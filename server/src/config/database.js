import fs from 'node:fs';
import pg from 'pg';
import { describeError, logger } from '../utils/logger.js';
import { getConfig } from './env.js';

// BIGINT (hasil COUNT(*) dan kolom identity) dibaca sebagai number, bukan string bawaan
// node-postgres. Aman karena nilainya jauh di bawah Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));

/** Opsi TLS node-postgres dari DB_SSL / DB_SSL_CA. */
export function sslOptions({ mode, caPath }) {
  if (mode === 'disable') return false;
  // Setara sslmode=require: terenkripsi, tetapi sertifikat server tidak diverifikasi.
  if (mode === 'require') return { rejectUnauthorized: false };
  // verify-full: sertifikat & nama host diverifikasi (Supabase: unduh CA dari dashboard).
  return { rejectUnauthorized: true, ...(caPath ? { ca: fs.readFileSync(caPath, 'utf8') } : {}) };
}

/** Opsi koneksi bersama untuk pool aplikasi dan skrip CLI (akun migrasi). */
export function connectionOptions(dbConfig, overrides = {}) {
  return {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: sslOptions(dbConfig.ssl),
    application_name: 'e-osis',
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    ...overrides,
  };
}

/**
 * Mengarahkan nama tabel tanpa skema ke skema aplikasi (DB_SCHEMA). Disetel per koneksi,
 * sehingga butuh koneksi langsung atau Session pooler Supabase (bukan Transaction pooler).
 */
export function useSchema(client, schema) {
  return client.query("SELECT set_config('search_path', $1, false)", [pg.escapeIdentifier(schema)]);
}

/**
 * Pool koneksi aplikasi. Memakai akun database dengan hak akses minimum (DB_USER),
 * BUKAN akun migrasi. Semua query memakai parameter ($1, $2, ...) sehingga nilai
 * tidak pernah disisipkan ke teks SQL.
 */
export function createPool(dbConfig) {
  const pool = new pg.Pool({
    ...connectionOptions(dbConfig),
    max: dbConfig.connectionLimit,
    idleTimeoutMillis: 30_000,
    // Ditunggu sebelum koneksi baru dipakai; bila gagal, koneksi dibuang.
    onConnect: (client) => useSchema(client, dbConfig.schema),
  });
  // Koneksi idle yang diputus server (mis. restart/pemeliharaan Supabase) tidak boleh
  // mematikan proses: pool cukup membuang koneksi tersebut.
  pool.on('error', (error) => logger.warn('Koneksi database idle terputus', { error: describeError(error) }));
  return pool;
}

let pool;

export function getPool() {
  if (!pool) pool = createPool(getConfig().db);
  return pool;
}

export async function closePool() {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}

/** Petunjuk perbaikan untuk error koneksi yang umum (PostgreSQL lokal maupun Supabase). */
export function connectionHint(error) {
  const message = String(error?.message ?? '');
  if (error?.code === 'ECONNREFUSED') return 'Pastikan PostgreSQL berjalan dan DB_HOST/DB_PORT di .env sudah benar.';
  if (error?.code === 'ENOTFOUND' || error?.code === 'ENETUNREACH' || error?.code === 'EHOSTUNREACH') {
    return (
      'Host database tidak ditemukan/tidak dapat dijangkau: periksa DB_HOST di .env. Untuk Supabase pakai host ' +
      '"Session pooler" (...pooler.supabase.com); koneksi langsung db.<ref>.supabase.co hanya mendukung IPv6.'
    );
  }
  if (/Tenant or user not found/i.test(message)) {
    return 'Untuk pooler Supabase, nama user berformat <role>.<project-ref>, mis. postgres.abcdefghijklmnop.';
  }
  // node-postgres menganggap password kosong sebagai "tidak ada password".
  if (/client password must be/i.test(message)) {
    return 'Password kosong: isi DB_MIGRATION_PASSWORD (skrip db:*) atau DB_PASSWORD (server) di .env, lalu SIMPAN file-nya.';
  }
  if (error?.code === '28P01') return 'Password salah. Periksa DB_PASSWORD (server) atau DB_MIGRATION_PASSWORD (skrip db:*) di .env.';
  if (error?.code === '28000') return 'Role/akun ditolak. Periksa DB_USER/DB_MIGRATION_USER, lalu jalankan "npm run db:setup".';
  if (error?.code === '3D000') return 'Database DB_NAME tidak ada. Di Supabase gunakan DB_NAME=postgres.';
  if (/does not support SSL/i.test(message)) return 'Server tidak memakai SSL: setel DB_SSL=disable (hanya untuk PostgreSQL lokal).';
  if (/self[- ]signed certificate|unable to verify|unable to get local issuer/i.test(message)) {
    return 'Sertifikat server tidak terverifikasi: isi DB_SSL_CA dengan sertifikat CA Supabase, atau pakai DB_SSL=require.';
  }
  return null;
}

/** Dilempar ketika COMMIT gagal: status transaksi tidak dapat dipastikan. */
export class TransactionOutcomeUnknownError extends Error {
  constructor(cause) {
    super('Status COMMIT transaksi tidak diketahui.', { cause });
    this.name = 'TransactionOutcomeUnknownError';
  }
}

const ISOLATION_LEVELS = new Set(['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']);
// deadlock_detected & serialization_failure: PostgreSQL sudah membatalkan seluruh transaksi.
const RETRYABLE_CODES = new Set(['40P01', '40001']);

/**
 * Menjalankan `work(client)` di dalam satu transaksi PostgreSQL.
 * - READ COMMITTED (bawaan): SELECT ... FOR SHARE/FOR UPDATE yang menunggu kunci membaca
 *   versi baris TERBARU setelah kunci didapat, dan setiap query berikutnya melihat data
 *   terbaru yang sudah di-COMMIT — perilaku yang dibutuhkan pola penguncian di service.
 * - ROLLBACK otomatis bila terjadi error apa pun sebelum COMMIT.
 * - Deadlock/serialization failure dicoba ulang dari awal (transaksi sudah dibatalkan).
 * - Kegagalan saat COMMIT dibungkus TransactionOutcomeUnknownError karena
 *   hasilnya (tersimpan atau tidak) tidak bisa dipastikan oleh aplikasi.
 */
export async function withTransaction(work, { isolationLevel = 'READ COMMITTED', retries = 2 } = {}) {
  if (!ISOLATION_LEVELS.has(isolationLevel)) {
    throw new Error(`Isolation level tidak dikenal: ${isolationLevel}`);
  }

  for (let attempt = 0; ; attempt += 1) {
    const client = await getPool().connect();
    let healthy = true;
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);
      const result = await work(client);
      try {
        await client.query('COMMIT');
      } catch (commitError) {
        healthy = false;
        throw new TransactionOutcomeUnknownError(commitError);
      }
      return result;
    } catch (error) {
      if (!(error instanceof TransactionOutcomeUnknownError)) {
        try {
          await client.query('ROLLBACK');
        } catch {
          healthy = false;
        }
      }
      if (RETRYABLE_CODES.has(error?.code) && attempt < retries) continue;
      throw error;
    } finally {
      // release(true) membuang koneksi yang statusnya tidak pasti, bukan mengembalikannya ke pool.
      client.release(!healthy);
    }
  }
}

/**
 * Transaksi baca-saja dengan snapshot konsisten (REPEATABLE READ). Dipakai untuk rekap
 * hasil agar total suara, perolehan per kandidat, dan jumlah pemilih dihitung dari keadaan
 * database yang sama (tidak "bergeser" karena suara yang masuk di tengah query).
 */
export async function withReadSnapshot(work) {
  const client = await getPool().connect();
  let healthy = true;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {
      healthy = false;
    });
    throw error;
  } finally {
    client.release(!healthy);
  }
}
