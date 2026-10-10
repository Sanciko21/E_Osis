/**
 * Menyusun script untuk SQL Editor Supabase di server/sql:
 * - setup.sql: hasilnya sama dengan "npm run db:setup" (role aplikasi, skema, migrasi,
 *   pencatatan migrasi, hak akses), dibangun dari file migrasi & APP_GRANTS yang sama dengan CLI;
 * - demo.sql / demo-delete.sql: data demo dari seeds/demo-data.js (sama dengan db:seed:demo).
 * Tes unit memastikan file yang tersimpan selalu sesuai hasil generator ini.
 */
import path from 'node:path';
import pg from 'pg';
import { SERVER_ROOT } from '../../src/config/env.js';
import { DEMO_CANDIDATES, DEMO_DESCRIPTION, DEMO_TITLE, DEMO_TITLE_PREFIX, demoPhotoUrl } from '../../seeds/demo-data.js';
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
-- untuk mencoba voting di halaman /pilih.
-- Tidak membuat suara apa pun. Tempel seluruh isi file ke SQL Editor lalu klik Run.
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
  'demo-delete.sql': buildDemoDeleteSql,
});
