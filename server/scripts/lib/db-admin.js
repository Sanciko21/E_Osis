/**
 * Utilitas database untuk skrip CLI (create, migrate, grants, reset, seed).
 * Memakai akun MIGRASI (DB_MIGRATION_USER) yang berhak DDL — akun ini TIDAK pernah
 * dipakai oleh server aplikasi yang berjalan.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { connectionHint, connectionOptions, useSchema } from '../../src/config/database.js';
import { SERVER_ROOT, buildConfig, loadEnvFile } from '../../src/config/env.js';

export const MIGRATIONS_DIR = path.join(SERVER_ROOT, 'migrations');

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Nama role SQL dari nama login. Pooler Supabase (Supavisor) memakai format
 * "<role>.<project-ref>", mis. "postgres.abcdefghijklmnop" → role "postgres".
 */
export function roleFromLogin(login) {
  const role = login.split('.')[0];
  if (!ROLE_NAME.test(role)) {
    throw new Error(`Nama role "${role}" tidak valid: gunakan huruf kecil, angka, dan garis bawah.`);
  }
  return role;
}

export function getAdminDbSettings() {
  loadEnvFile();
  // Validasi yang sama dengan server (DB_SCHEMA, DB_SSL, dst.).
  const config = buildConfig();
  const env = process.env;
  const migrationUser = env.DB_MIGRATION_USER || config.db.user;
  return {
    db: config.db,
    database: config.db.database,
    schema: config.db.schema,
    migrationUser,
    migrationPassword: env.DB_MIGRATION_USER ? (env.DB_MIGRATION_PASSWORD ?? '') : config.db.password,
    migrationRole: roleFromLogin(migrationUser),
    appUser: config.db.user,
    appPassword: config.db.password,
    appRole: roleFromLogin(config.db.user),
    nodeEnv: config.env,
  };
}

/**
 * Koneksi akun migrasi. Tanpa `withDatabase`, terhubung ke database bawaan "postgres"
 * (dipakai untuk membuat database aplikasi bila belum ada).
 */
export async function connectAsMigrator(settings, { withDatabase = true } = {}) {
  const client = new pg.Client(
    connectionOptions(settings.db, {
      user: settings.migrationUser,
      password: settings.migrationPassword,
      database: withDatabase ? settings.database : 'postgres',
    }),
  );
  await client.connect();
  if (withDatabase) await useSchema(client, settings.schema);
  return client;
}

/** Membuat database bila belum ada. Di Supabase, database "postgres" selalu sudah ada. */
export async function ensureDatabase(client, database) {
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (rowCount > 0) return false;
  await client.query(`CREATE DATABASE ${pg.escapeIdentifier(database)}`);
  return true;
}

export function isSharedPrivilegedAccount(settings) {
  return settings.appRole === settings.migrationRole || settings.appRole === 'postgres';
}

/**
 * Verifier SCRAM-SHA-256 dihitung di sisi klien (seperti \password pada psql) sehingga
 * password akun aplikasi tidak pernah terkirim — atau tercatat di log server — sebagai
 * teks biasa. Format: SCRAM-SHA-256$<iterasi>:<salt>$<StoredKey>:<ServerKey>.
 */
export function scramSha256Verifier(password, { iterations = 4096, salt = crypto.randomBytes(16) } = {}) {
  const hmac = (key, text) => crypto.createHmac('sha256', key).update(text).digest();
  const salted = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const storedKey = crypto.createHash('sha256').update(hmac(salted, 'Client Key')).digest();
  const serverKey = hmac(salted, 'Server Key');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

/** Membuat role aplikasi berhak minimum (bila berbeda dari akun migrasi). */
export async function ensureAppUser(client, settings, log = console.log) {
  if (isSharedPrivilegedAccount(settings)) {
    log(
      `! DB_USER (${settings.appUser}) sama dengan akun migrasi/postgres. Untuk produksi, gunakan akun ` +
        'aplikasi terpisah agar prinsip hak akses minimum berlaku.',
    );
    return false;
  }
  if (!settings.appPassword) {
    throw new Error('DB_PASSWORD untuk akun aplikasi wajib diisi agar akun dapat dibuat.');
  }
  // Batasan ini membuat verifier yang dihitung di sini identik dengan hasil SASLprep server.
  if (!/^[\x20-\x7E]+$/.test(settings.appPassword)) {
    throw new Error('DB_PASSWORD akun aplikasi hanya boleh berisi huruf, angka, dan simbol ASCII.');
  }
  const role = pg.escapeIdentifier(settings.appRole);
  const password = pg.escapeLiteral(scramSha256Verifier(settings.appPassword));
  const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [settings.appRole]);
  if (rowCount === 0) {
    await client.query(`CREATE ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${password}`);
    log(`✓ Role aplikasi '${settings.appRole}' dibuat.`);
  } else {
    try {
      await client.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${password}`);
      log(`✓ Role aplikasi '${settings.appRole}' sudah ada (password disinkronkan).`);
    } catch (error) {
      if (error.code !== '42501') throw error;
      // PostgreSQL 16+: hanya pembuat role (atau pemegang ADMIN OPTION) yang boleh mengubahnya.
      log(
        `! Role '${settings.appRole}' sudah ada tetapi dibuat oleh akun lain, sehingga passwordnya tidak dapat ` +
          `disinkronkan oleh '${settings.migrationRole}'. Pastikan DB_PASSWORD sesuai, atau pakai nama role lain.`,
      );
    }
  }
  return true;
}

/** Hak akses minimum akun aplikasi. Tidak ada UPDATE/DELETE pada votes & voter_participation. */
export const APP_GRANTS = Object.freeze([
  { object: 'elections', privileges: 'SELECT, INSERT, UPDATE, DELETE' },
  { object: 'candidates', privileges: 'SELECT, INSERT, UPDATE, DELETE' },
  { object: 'voter_participation', privileges: 'INSERT' },
  { object: 'votes', privileges: 'INSERT' },
  { object: 'v_candidate_vote_counts', privileges: 'SELECT', view: true },
  { object: 'v_participation_timeline', privileges: 'SELECT', view: true },
  { object: 'admin_users', privileges: 'SELECT, UPDATE (last_login_at)' },
  { object: 'admin_sessions', privileges: 'SELECT, INSERT, UPDATE, DELETE' },
  { object: 'audit_logs', privileges: 'SELECT, INSERT' },
]);

/** Role Data API Supabase (PostgREST). Skema aplikasi tidak boleh terjangkau olehnya. */
export const SUPABASE_API_ROLES = Object.freeze(['anon', 'authenticated', 'service_role']);

/** Nama policy RLS untuk akun aplikasi (lihat grantStatements). */
export const APP_POLICY = 'app_role_access';

/**
 * Perintah REVOKE/GRANT hak akses — dipakai db:grants (dijalankan) dan sql/setup.sql (dicetak),
 * sehingga keduanya selalu sama. Semua akses PUBLIC/`apiRoles` ke skema dicabut; bila `appRole`
 * diisi, hak role itu dicabut lalu diberikan ulang tepat sesuai APP_GRANTS.
 *
 * Tiap tabel juga diberi policy RLS untuk akun aplikasi. Akses tetap dibatasi GRANT; policy ini
 * hanya agar aplikasi tidak lumpuh bila RLS dinyalakan (mis. tombol/opsi "enable RLS" di
 * dashboard Supabase) — RLS tanpa policy menolak semua baris bagi role selain pemilik tabel.
 */
export function grantStatements({ schema, appRole = null, apiRoles = [] }) {
  const target = pg.escapeIdentifier(schema);
  const grantees = ['PUBLIC', ...apiRoles.map((role) => pg.escapeIdentifier(role))].join(', ');
  const statements = [`SCHEMA ${target}`, `ALL TABLES IN SCHEMA ${target}`, `ALL SEQUENCES IN SCHEMA ${target}`, `ALL FUNCTIONS IN SCHEMA ${target}`].map(
    (objects) => `REVOKE ALL ON ${objects} FROM ${grantees}`,
  );
  if (appRole) {
    const role = pg.escapeIdentifier(appRole);
    statements.push(
      `REVOKE ALL ON ALL TABLES IN SCHEMA ${target} FROM ${role}`,
      `GRANT USAGE ON SCHEMA ${target} TO ${role}`,
      ...APP_GRANTS.map((grant) => `GRANT ${grant.privileges} ON ${target}.${pg.escapeIdentifier(grant.object)} TO ${role}`),
    );
    const policy = pg.escapeIdentifier(APP_POLICY);
    for (const grant of APP_GRANTS.filter((item) => !item.view)) {
      const table = `${target}.${pg.escapeIdentifier(grant.object)}`;
      statements.push(
        `DROP POLICY IF EXISTS ${policy} ON ${table}`,
        `CREATE POLICY ${policy} ON ${table} FOR ALL TO ${role} USING (true) WITH CHECK (true)`,
      );
    }
  }
  return statements;
}

/**
 * Menerapkan hak akses aplikasi secara tepat (hak lama yang tidak tercantum ikut dicabut)
 * dalam satu transaksi. Akses PUBLIC/Data API ke skema selalu dicabut.
 */
export async function applyAppGrants(client, settings, log = console.log) {
  const shared = isSharedPrivilegedAccount(settings);
  await client.query('BEGIN');
  try {
    const { rows } = await client.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname', [
      SUPABASE_API_ROLES,
    ]);
    const statements = grantStatements({
      schema: settings.schema,
      appRole: shared ? null : settings.appRole,
      apiRoles: rows.map((row) => row.rolname),
    });
    for (const statement of statements) await client.query(statement);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  if (shared) {
    log('! Grant dilewati karena DB_USER memakai akun migrasi/postgres.');
    return false;
  }
  log(`✓ Hak akses minimum diterapkan untuk role '${settings.appRole}' pada skema ${settings.schema}.`);
  return true;
}

/** Daftar hak akses role aplikasi pada objek di skema aplikasi (tabel/view dan kolom). */
export async function listGrants(client, settings) {
  const { rows } = await client.query(
    `WITH app AS (SELECT oid FROM pg_roles WHERE rolname = $2)
     SELECT c.relname AS object, string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type) AS privileges
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE n.nspname = $1 AND a.grantee = (SELECT oid FROM app)
      GROUP BY c.relname
     UNION ALL
     SELECT c.relname || ' (' || att.attname || ')', string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type)
       FROM pg_attribute att
       JOIN pg_class c ON c.oid = att.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(att.attacl) a
      WHERE n.nspname = $1 AND a.grantee = (SELECT oid FROM app)
      GROUP BY c.relname, att.attname
     ORDER BY 1`,
    [settings.schema, settings.appRole],
  );
  return rows.map((row) => `${row.object}: ${row.privileges}`);
}

/**
 * File migrasi beserta checksum-nya. Line ending dinormalisasi ke LF sehingga checksum sama
 * walau Git di Windows (core.autocrlf) mengubah file menjadi CRLF saat checkout.
 */
export async function readMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  const files = entries.filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  return Promise.all(
    files.map(async (name) => {
      const sql = (await fs.readFile(path.join(MIGRATIONS_DIR, name), 'utf8')).replace(/\r\n/g, '\n');
      return { version: name, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
    }),
  );
}

/** Tabel pencatat migrasi (dipakai runMigrations dan sql/setup.sql). */
export const SCHEMA_MIGRATIONS_DDL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text NOT NULL PRIMARY KEY,
  checksum   char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

/**
 * Menjalankan migrasi yang belum diterapkan, berurutan, di skema aplikasi. DDL PostgreSQL
 * bersifat transaksional: setiap file dijalankan dalam satu transaksi bersama pencatatannya,
 * sehingga migrasi yang gagal dibatalkan seluruhnya tanpa meninggalkan tabel setengah jadi.
 */
export async function runMigrations(client, settings, log = console.log) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${pg.escapeIdentifier(settings.schema)}`);
  await useSchema(client, settings.schema);
  await client.query(SCHEMA_MIGRATIONS_DDL);

  const { rows: appliedRows } = await client.query('SELECT version, checksum FROM schema_migrations');
  const applied = new Map(appliedRows.map((row) => [row.version, row.checksum]));
  const migrations = await readMigrationFiles();
  let count = 0;

  for (const migration of migrations) {
    const knownChecksum = applied.get(migration.version);
    if (knownChecksum) {
      if (knownChecksum !== migration.checksum) {
        throw new Error(
          `Migrasi ${migration.version} sudah diterapkan tetapi isinya berubah. ` +
            'Jangan mengubah migrasi lama; buat file migrasi baru.',
        );
      }
      continue;
    }
    log(`→ Menerapkan ${migration.version}`);
    await client.query('BEGIN');
    try {
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
        migration.version,
        migration.checksum,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migrasi ${migration.version} gagal dan dibatalkan seluruhnya: ${error.message}`, { cause: error });
    }
    count += 1;
  }
  log(count === 0 ? '✓ Skema sudah mutakhir.' : `✓ ${count} migrasi diterapkan.`);
  return count;
}

/** Menghapus skema aplikasi beserta SELURUH isinya (khusus reset lokal/test). */
export async function dropSchema(client, schema) {
  await client.query(`DROP SCHEMA IF EXISTS ${pg.escapeIdentifier(schema)} CASCADE`);
}

/** Menjalankan fungsi utama skrip CLI dengan pesan error yang ramah. */
export async function runCli(main) {
  try {
    await main();
  } catch (error) {
    console.error(`✗ ${error.message || error.code || error}`);
    const hint = connectionHint(error) ?? (error.code === '42501' ? 'Akun migrasi tidak berhak atas objek tersebut.' : null);
    if (hint) console.error(`  ${hint}`);
    process.exitCode = 1;
  }
}
