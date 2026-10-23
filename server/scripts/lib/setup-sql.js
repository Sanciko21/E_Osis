/**
 * Menyusun script untuk SQL Editor Supabase di server/sql:
 * - setup.sql: hasilnya sama dengan "npm run db:setup" (role aplikasi, skema, migrasi,
 *   pencatatan migrasi, hak akses), dibangun dari file migrasi & APP_GRANTS yang sama dengan CLI;
 * - demo.sql / demo-delete.sql: data demo dari seeds/demo-data.js (sama dengan db:seed:demo);
 * - demo-votes.sql: suara dummy untuk pemilihan demo (pemilih fiktif, NISN rentang khusus demo).
 * Tes unit memastikan file yang tersimpan selalu sesuai hasil generator ini.
 */
import path from 'node:path';
import pg from 'pg';
import { SERVER_ROOT } from '../../src/config/env.js';
import {
  DEMO_CANDIDATES,
  DEMO_DESCRIPTION,
  DEMO_ELIGIBLE_VOTERS,
  DEMO_NISN_PREFIX,
  DEMO_TITLE,
  DEMO_TITLE_PREFIX,
  DEMO_VOTES,
  DEMO_VOTING_HOURS,
  demoPhotoUrl,
} from '../../seeds/demo-data.js';
import { SCHEMA_MIGRATIONS_DDL, SUPABASE_API_ROLES, grantStatements, readMigrationFiles } from './db-admin.js';

export const SQL_DIR = path.join(SERVER_ROOT, 'sql');
export const SETUP_SQL_PATH = path.join(SQL_DIR, 'setup.sql');
export const PASSWORD_PLACEHOLDER = 'GANTI_DENGAN_DB_PASSWORD';

const section = (title) => `-- ${'='.repeat(69)}\n-- ${title}\n-- ${'='.repeat(69)}`;

export async function buildSetupSql({ schema = 'eosis', appRole = 'eosis_app' } = {}) {
  const schemaId = pg.escapeIdentifier(schema);
  const migrations = await readMigrationFiles();
  const parts = [
    `-- E-OSIS • setup database untuk SQL Editor Supabase
-- FILE INI DIBUAT OTOMATIS oleh "npm run db:sql" dari server/migrations — jangan diedit manual.
--
-- Cara pakai:
--   1. Salin SELURUH isi file ini ke Supabase → SQL Editor. JANGAN mengisi password di file
--      ini: file ini ikut ter-upload ke GitHub.
--   2. Di SQL Editor, pada langkah 1 ganti teks GANTI_… di baris app_password dengan nilai
--      DB_PASSWORD di server/.env (BUKAN password database Supabase), lalu klik Run.
--   3. Setelah berhasil, hapus password dari editor (riwayat query tersimpan di dashboard).
--   4. Buat akun admin: jalankan "npm run admin:sql" di folder server, tempel hasilnya ke SQL Editor.
--
-- Hasilnya sama dengan "npm run db:setup": skema "${schema}" (bukan public), role "${appRole}"
-- berhak minimum, dan akses Data API Supabase (anon/authenticated/service_role) dicabut.
-- Bila muncul error, tidak ada yang tersimpan: perbaiki penyebabnya lalu Run lagi.
-- Error 'schema "${schema}" already exists' berarti database sudah pernah di-setup; jalankan
-- sql/reset.sql dulu HANYA bila memang ingin mengulang dari nol (MENGHAPUS SEMUA DATA).`,

    section(`1. Role aplikasi "${appRole}" (password = DB_PASSWORD di server/.env)`),
    // Teks pengganti sengaja hanya muncul SEKALI di seluruh file (aman untuk "Replace All"),
    // dan pesan error tidak pernah memuat password.
    `DO $$
DECLARE
  app_password text := '${PASSWORD_PLACEHOLDER}';  -- ← isi dengan DB_PASSWORD dari server/.env
BEGIN
  IF starts_with(app_password, 'GANTI_') THEN
    RAISE EXCEPTION 'Langkah 1: password belum diisi. Ganti teks di baris app_password dengan DB_PASSWORD dari server/.env.';
  END IF;
  IF length(app_password) < 12 THEN
    RAISE EXCEPTION 'Langkah 1: password terlalu pendek (% karakter). Pakai DB_PASSWORD dari server/.env, bukan password database Supabase.', length(app_password);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${pg.escapeLiteral(appRole)}) THEN
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', ${pg.escapeLiteral(appRole)}, app_password);
  ELSE
    EXECUTE format('CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', ${pg.escapeLiteral(appRole)}, app_password);
  END IF;
END
$$;`,

    section(`2. Skema "${schema}" — semua tabel dibuat di sini, bukan di public`),
    `CREATE SCHEMA ${schemaId};
SET search_path TO ${schemaId};

-- Pengaman: tabel TIDAK boleh tercipta di public (mis. bila hanya sebagian script yang dijalankan).
DO $$
BEGIN
  IF current_schema() IS DISTINCT FROM ${pg.escapeLiteral(schema)} THEN
    RAISE EXCEPTION 'search_path bukan skema ${schema}: jalankan SELURUH script sekaligus dengan tombol Run.';
  END IF;
END
$$;`,
  ];

  for (const migration of migrations) {
    parts.push(section(`Migrasi ${migration.version}`), migration.sql.trim());
  }

  parts.push(
    section('3. Pencatatan migrasi (agar "npm run db:migrate" tahu skema ini sudah mutakhir)'),
    `${SCHEMA_MIGRATIONS_DDL};\n\nINSERT INTO schema_migrations (version, checksum) VALUES\n${migrations
      .map((migration) => `  (${pg.escapeLiteral(migration.version)}, ${pg.escapeLiteral(migration.checksum)})`)
      .join(',\n')};`,

    section('4. Hak akses minimum (sama dengan "npm run db:grants")'),
    `${grantStatements({ schema, appRole, apiRoles: [...SUPABASE_API_ROLES] }).join(';\n')};

RESET search_path;`,
  );

  return `${parts.join('\n\n')}\n`;
}

/** Data DEMO untuk SQL Editor: pemilihan "[DEMO]" yang langsung dibuka + 3 paslon fiktif. */
export function buildDemoSql({ schema = 'eosis' } = {}) {
  const table = (name) => `${pg.escapeIdentifier(schema)}.${name}`;
  const candidates = DEMO_CANDIDATES.map(
    (candidate, index) =>
      `    (gen_random_uuid(), demo_id, ${index + 1}, ${[
        candidate.chairpersonName,
        candidate.viceChairpersonName,
        demoPhotoUrl(index + 1),
        candidate.vision,
        candidate.mission,
      ]
        .map((value) => pg.escapeLiteral(value))
        .join(', ')})`,
  ).join(',\n');

  return `-- E-OSIS • data DEMO untuk SQL Editor Supabase
-- FILE INI DIBUAT OTOMATIS oleh "npm run db:sql" (isi dari server/seeds/demo-data.js) — jangan diedit manual.
--
-- Membuat satu pemilihan "${DEMO_TITLE_PREFIX} ..." yang LANGSUNG DIBUKA (mulai 5 menit lalu, selesai
-- 8 jam lagi) dengan ${DEMO_CANDIDATES.length} pasangan calon fiktif bergambar kartun (client/public/demo),
-- untuk mencoba memilih langsung dari kartu pasangan calon di beranda.
-- Tidak membuat suara apa pun (suara dummy: sql/demo-votes.sql). Tempel seluruh isi file ke SQL Editor lalu klik Run.
-- Hapus dengan sql/demo-delete.sql sebelum pemilihan sungguhan.

DO $$
DECLARE
  demo_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO ${table('elections')} (id, title, description, start_at, end_at, status, results_public)
  VALUES (demo_id, ${pg.escapeLiteral(DEMO_TITLE)}, ${pg.escapeLiteral(DEMO_DESCRIPTION)},
          now() - interval '5 minutes', now() + interval '8 hours', 'active', FALSE);

  INSERT INTO ${table('candidates')} (id, election_id, candidate_number, chairperson_name, vice_chairperson_name, photo_url, vision, mission)
  VALUES
${candidates};
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Sudah ada pemilihan aktif. Tutup pemilihan itu dulu dari dashboard admin, lalu Run lagi.';
END
$$;
`;
}

/**
 * Suara DUMMY untuk pemilihan [DEMO] terbaru: satu baris voter_participation + satu baris votes per
 * pemilih fiktif, persis seperti alur voting aplikasi (dashboard tetap lolos pemeriksaan integritas).
 */
export function buildDemoVotesSql({ schema = 'eosis' } = {}) {
  const table = (name) => `${pg.escapeIdentifier(schema)}.${name}`;
  const titlePattern = pg.escapeLiteral(`${DEMO_TITLE_PREFIX}%`);
  const total = DEMO_VOTES.reduce((sum, count) => sum + count, 0);
  const nisnDigits = 10 - DEMO_NISN_PREFIX.length;
  const firstNisn = `${DEMO_NISN_PREFIX}${'1'.padStart(nisnDigits, '0')}`;
  const lastNisn = `${DEMO_NISN_PREFIX}${String(total).padStart(nisnDigits, '0')}`;
  let cumulative = 0;
  const candidateCase = DEMO_VOTES.map((count, index) => {
    cumulative += count;
    return index === DEMO_VOTES.length - 1 ? `ELSE ${index + 1}` : `WHEN n <= ${cumulative} THEN ${index + 1}`;
  }).join(' ');
  const turnout = Math.round((total / DEMO_ELIGIBLE_VOTERS) * 100);
  const summary = DEMO_VOTES.map((count, index) => `Paslon ${String(index + 1).padStart(2, '0')}: ${count}`).join(', ');
  const latestDemo = `SELECT id FROM ${table('elections')} WHERE title LIKE ${titlePattern} AND status <> 'draft' ORDER BY created_at DESC LIMIT 1`;

  return `-- E-OSIS • suara DUMMY untuk pemilihan ${DEMO_TITLE_PREFIX} (SQL Editor Supabase)
-- FILE INI DIBUAT OTOMATIS oleh "npm run db:sql" (isi dari server/seeds/demo-data.js) — jangan diedit manual.
--
-- Menambahkan ${total} pemilih fiktif ke pemilihan "${DEMO_TITLE_PREFIX} ..." terbaru (jalankan demo.sql dulu):
--   ${summary} suara.
-- - NISN dummy ${firstNisn}–${lastNisn}: jangan dipakai saat mencoba memilih secara manual.
-- - Waktu memilih tersebar selama ${DEMO_VOTING_HOURS} jam terakhir periode pemungutan suara (dua puncak, seperti
--   jam istirahat); bila perlu, waktu mulai pemilihan demo dimajukan agar periode itu tercakup.
-- - Jumlah siswa berhak pilih diisi ${DEMO_ELIGIBLE_VOTERS} bila masih kosong (partisipasi ${turnout}%).
-- - Aman dijalankan ulang: NISN yang sudah tercatat dilewati sehingga suara tidak dobel.
-- Hasil langsung tampil di dashboard admin. Untuk halaman Hasil publik, selesaikan pemilihan dan
-- publikasikan hasil dari dashboard admin. Hapus semuanya dengan sql/demo-delete.sql.
-- Tempel seluruh isi file ke SQL Editor lalu klik Run.

DO $$
DECLARE
  demo ${table('elections')}%ROWTYPE;
  window_end timestamptz;
  window_start timestamptz;
  added integer;
BEGIN
  SELECT * INTO demo FROM ${table('elections')}
   WHERE title LIKE ${titlePattern} AND status <> 'draft'
   ORDER BY created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Belum ada pemilihan ${DEMO_TITLE_PREFIX} (bukan draf). Jalankan sql/demo.sql terlebih dahulu.';
  END IF;
  IF (SELECT count(*) FROM ${table('candidates')}
       WHERE election_id = demo.id AND candidate_number BETWEEN 1 AND ${DEMO_VOTES.length}) < ${DEMO_VOTES.length} THEN
    RAISE EXCEPTION 'Pasangan calon demo nomor 1–${DEMO_VOTES.length} tidak lengkap. Jalankan sql/demo-delete.sql lalu sql/demo.sql.';
  END IF;

  window_end := LEAST(demo.end_at, now());
  window_start := LEAST(demo.start_at, window_end - interval '${DEMO_VOTING_HOURS} hours');
  UPDATE ${table('elections')}
     SET start_at = window_start,
         eligible_voter_count = COALESCE(eligible_voter_count, ${DEMO_ELIGIBLE_VOTERS})
   WHERE id = demo.id;

  WITH voters AS MATERIALIZED (
    SELECT ${pg.escapeLiteral(DEMO_NISN_PREFIX)} || lpad(n::text, ${nisnDigits}, '0') AS nisn,
           CASE ${candidateCase} END AS candidate_number,
           window_start + (window_end - window_start) * LEAST(0.995, GREATEST(0.005,
             CASE WHEN random() < 0.55 THEN 0.32 ELSE 0.74 END + (random() + random() + random() - 1.5) * 0.16
           )) AS voted_at
      FROM generate_series(1, ${total}) AS n
  ),
  recorded AS (
    INSERT INTO ${table('voter_participation')} (election_id, nisn, voted_at, created_at)
    SELECT demo.id, voters.nisn, voters.voted_at, voters.voted_at FROM voters
    ON CONFLICT (election_id, nisn) DO NOTHING
    RETURNING nisn
  )
  -- Seperti alur voting aplikasi: id suara UUID acak, hanya TANGGAL (UTC), urutan acak.
  INSERT INTO ${table('votes')} (id, election_id, candidate_id, created_on)
  SELECT gen_random_uuid(), demo.id, c.id, (v.voted_at AT TIME ZONE 'UTC')::date
    FROM recorded r
    JOIN voters v ON v.nisn = r.nisn
    JOIN ${table('candidates')} c ON c.election_id = demo.id AND c.candidate_number = v.candidate_number
   ORDER BY random();
  GET DIAGNOSTICS added = ROW_COUNT;
  RAISE NOTICE '% pemilih dummy ditambahkan ke "%".', added, demo.title;
END
$$;

-- Ringkasan perolehan suara pemilihan ${DEMO_TITLE_PREFIX} (tampil sebagai hasil di SQL Editor).
SELECT c.candidate_number AS nomor_urut,
       c.chairperson_name || ' & ' || c.vice_chairperson_name AS pasangan_calon,
       count(v.id) AS suara
  FROM ${table('candidates')} c
  LEFT JOIN ${table('votes')} v ON v.candidate_id = c.id
 WHERE c.election_id = (${latestDemo})
 GROUP BY c.candidate_number, c.chairperson_name, c.vice_chairperson_name
 ORDER BY c.candidate_number;
`;
}

/** Menghapus data DEMO beserta suara & NISN uji cobanya; pemilihan lain tidak tersentuh. */
export function buildDemoDeleteSql({ schema = 'eosis' } = {}) {
  const table = (name) => `${pg.escapeIdentifier(schema)}.${name}`;
  const demoIds = `(SELECT id FROM ${table('elections')} WHERE title LIKE ${pg.escapeLiteral(`${DEMO_TITLE_PREFIX}%`)})`;
  return `-- E-OSIS • hapus data DEMO (untuk SQL Editor Supabase)
-- FILE INI DIBUAT OTOMATIS oleh "npm run db:sql" — jangan diedit manual.
--
-- Menghapus semua pemilihan berjudul "${DEMO_TITLE_PREFIX} ..." beserta pasangan calon, suara, dan
-- catatan partisipasi (NISN) uji cobanya. Pemilihan lain TIDAK tersentuh.

DELETE FROM ${table('votes')} WHERE election_id IN ${demoIds};
DELETE FROM ${table('voter_participation')} WHERE election_id IN ${demoIds};
-- Pasangan calon ikut terhapus (ON DELETE CASCADE).
DELETE FROM ${table('elections')} WHERE title LIKE ${pg.escapeLiteral(`${DEMO_TITLE_PREFIX}%`)};
`;
}

/** Semua file di server/sql yang dibuat otomatis oleh "npm run db:sql". */
export const GENERATED_SQL_FILES = Object.freeze({
  'setup.sql': buildSetupSql,
  'demo.sql': buildDemoSql,
  'demo-votes.sql': buildDemoVotesSql,
  'demo-delete.sql': buildDemoDeleteSql,
});
