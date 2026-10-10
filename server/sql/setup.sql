-- E-OSIS • setup database untuk SQL Editor Supabase
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
-- Hasilnya sama dengan "npm run db:setup": skema "eosis" (bukan public), role "eosis_app"
-- berhak minimum, dan akses Data API Supabase (anon/authenticated/service_role) dicabut.
-- Bila muncul error, tidak ada yang tersimpan: perbaiki penyebabnya lalu Run lagi.
-- Error 'schema "eosis" already exists' berarti database sudah pernah di-setup; jalankan
-- sql/reset.sql dulu HANYA bila memang ingin mengulang dari nol (MENGHAPUS SEMUA DATA).

-- =====================================================================
-- 1. Role aplikasi "eosis_app" (password = DB_PASSWORD di server/.env)
-- =====================================================================

DO $$
DECLARE
  app_password text := 'GANTI_DENGAN_DB_PASSWORD';  -- ← isi dengan DB_PASSWORD dari server/.env
BEGIN
  IF starts_with(app_password, 'GANTI_') THEN
    RAISE EXCEPTION 'Langkah 1: password belum diisi. Ganti teks di baris app_password dengan DB_PASSWORD dari server/.env.';
  END IF;
  IF length(app_password) < 12 THEN
    RAISE EXCEPTION 'Langkah 1: password terlalu pendek (% karakter). Pakai DB_PASSWORD dari server/.env, bukan password database Supabase.', length(app_password);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eosis_app') THEN
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', 'eosis_app', app_password);
  ELSE
    EXECUTE format('CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', 'eosis_app', app_password);
  END IF;
END
$$;

-- =====================================================================
-- 2. Skema "eosis" — semua tabel dibuat di sini, bukan di public
-- =====================================================================

CREATE SCHEMA "eosis";
SET search_path TO "eosis";

-- Pengaman: tabel TIDAK boleh tercipta di public (mis. bila hanya sebagian script yang dijalankan).
DO $$
BEGIN
  IF current_schema() IS DISTINCT FROM 'eosis' THEN
    RAISE EXCEPTION 'search_path bukan skema eosis: jalankan SELURUH script sekaligus dengan tombol Run.';
  END IF;
END
$$;

-- =====================================================================
-- Migrasi 001_initial_schema.sql
-- =====================================================================

-- =====================================================================
-- E-OSIS • Migrasi 001: skema inti
-- Target: PostgreSQL 14+ (Supabase memakai PostgreSQL 15/17).
-- "npm run db:migrate" menjalankan file ini dalam SATU transaksi di skema aplikasi
-- (DB_SCHEMA, bawaan "eosis") — bukan "public", yang di Supabase dibuka lewat Data API.
-- Semua waktu bertipe timestamptz: titik waktu absolut (UTC), tidak bergantung pada
-- zona waktu sesi maupun server database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Pengganti "ON UPDATE CURRENT_TIMESTAMP": updated_at diisi otomatis saat UPDATE.
-- ---------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- elections: satu baris = satu pemilihan Ketua & Wakil Ketua OSIS
-- ---------------------------------------------------------------------
CREATE TABLE elections (
  id                   uuid NOT NULL,
  title                varchar(150) NOT NULL,
  description          text NULL,
  start_at             timestamptz NOT NULL,
  end_at               timestamptz NOT NULL,
  status               text NOT NULL DEFAULT 'draft',
  results_public       boolean NOT NULL DEFAULT FALSE,
  -- Penyebut resmi persentase partisipasi (jumlah siswa berhak pilih) yang dimasukkan
  -- sekolah. NULL = tidak diketahui; sistem TIDAK mengarang jumlah siswa.
  eligible_voter_count integer NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_elections PRIMARY KEY (id),
  CONSTRAINT chk_elections_status CHECK (status IN ('draft', 'scheduled', 'active', 'completed')),
  CONSTRAINT chk_elections_schedule CHECK (end_at > start_at),
  CONSTRAINT chk_elections_eligible CHECK (eligible_voter_count IS NULL OR eligible_voter_count > 0)
);

-- Indeks unik PARSIAL: hanya baris berstatus 'active' yang diindeks, sehingga database
-- menjamin paling banyak SATU pemilihan aktif pada satu waktu.
CREATE UNIQUE INDEX uq_elections_single_active ON elections (status) WHERE status = 'active';
CREATE INDEX idx_elections_status_start ON elections (status, start_at);
CREATE INDEX idx_elections_schedule ON elections (start_at, end_at);

CREATE TRIGGER trg_elections_updated_at
  BEFORE UPDATE ON elections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- candidates: pasangan calon (Ketua + Wakil Ketua) dalam satu pemilihan
-- ---------------------------------------------------------------------
CREATE TABLE candidates (
  id                    uuid NOT NULL,
  election_id           uuid NOT NULL,
  candidate_number      smallint NOT NULL,
  chairperson_name      varchar(100) NOT NULL,
  vice_chairperson_name varchar(100) NOT NULL,
  photo_url             varchar(500) NULL,
  vision                text NOT NULL,
  mission               text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_candidates PRIMARY KEY (id),
  CONSTRAINT uq_candidates_election_number UNIQUE (election_id, candidate_number),
  -- Target foreign key komposit dari tabel votes (menjamin kandidat milik pemilihan yang sama).
  CONSTRAINT uq_candidates_election_candidate UNIQUE (election_id, id),
  CONSTRAINT fk_candidates_election FOREIGN KEY (election_id)
    REFERENCES elections (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT chk_candidates_number CHECK (candidate_number BETWEEN 1 AND 99)
);

CREATE TRIGGER trg_candidates_updated_at
  BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- voter_participation: SIAPA yang sudah memilih (tanpa pilihannya)
-- ---------------------------------------------------------------------
CREATE TABLE voter_participation (
  id          bigint GENERATED ALWAYS AS IDENTITY,
  election_id uuid NOT NULL,
  -- Teks, bukan angka, agar angka 0 di depan tidak hilang.
  nisn        varchar(10) COLLATE "C" NOT NULL,
  voted_at    timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_voter_participation PRIMARY KEY (id),
  -- Penjaga utama anti voting ganda: satu NISN hanya sekali per pemilihan.
  CONSTRAINT uq_participation_election_nisn UNIQUE (election_id, nisn),
  CONSTRAINT fk_participation_election FOREIGN KEY (election_id)
    REFERENCES elections (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_participation_nisn CHECK (nisn ~ '^[0-9]{10}$')
);

CREATE INDEX idx_participation_election_time ON voter_participation (election_id, voted_at);

-- ---------------------------------------------------------------------
-- votes: APA yang dipilih (tanpa identitas pemilih)
-- Sengaja TIDAK ada kolom NISN maupun foreign key ke voter_participation.
-- ---------------------------------------------------------------------
CREATE TABLE votes (
  -- UUID v4 ACAK dari aplikasi (bukan identity / UUID berbasis waktu) agar urutan
  -- baris tidak bisa dicocokkan dengan urutan voter_participation.
  id           uuid NOT NULL,
  election_id  uuid NOT NULL,
  candidate_id uuid NOT NULL,
  -- Privasi: hanya TANGGAL (UTC), tanpa jam, supaya waktu suara tidak dapat dicocokkan
  -- dengan voter_participation.voted_at. Tipe date menjaminnya tanpa CHECK tambahan.
  created_on   date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  CONSTRAINT pk_votes PRIMARY KEY (id),
  CONSTRAINT fk_votes_election FOREIGN KEY (election_id)
    REFERENCES elections (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- FK komposit: kandidat WAJIB berasal dari pemilihan yang sama dengan suara.
  CONSTRAINT fk_votes_candidate_same_election FOREIGN KEY (election_id, candidate_id)
    REFERENCES candidates (election_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_votes_election_candidate ON votes (election_id, candidate_id);

-- ---------------------------------------------------------------------
-- admin_users: akun panitia/pengawas (password disimpan sebagai hash Argon2id)
-- ---------------------------------------------------------------------
CREATE TABLE admin_users (
  id            uuid NOT NULL,
  name          varchar(100) NOT NULL,
  email         varchar(191) NOT NULL,
  password_hash varchar(255) NOT NULL,
  role          text NOT NULL DEFAULT 'observer',
  is_active     boolean NOT NULL DEFAULT TRUE,
  last_login_at timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_admin_users PRIMARY KEY (id),
  CONSTRAINT uq_admin_users_email UNIQUE (email),
  -- Email disimpan dalam huruf kecil sehingga UNIQUE di atas berlaku tanpa membedakan kapital.
  CONSTRAINT chk_admin_users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT chk_admin_users_role CHECK (role IN ('admin', 'observer')),
  CONSTRAINT chk_admin_users_hash CHECK (password_hash LIKE '$argon2id$%' OR password_hash LIKE '$2b$%')
);

CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- admin_sessions: sesi login admin di sisi server
-- Yang disimpan hanya SHA-256 dari token cookie, bukan token aslinya.
-- ---------------------------------------------------------------------
CREATE TABLE admin_sessions (
  id            char(64) COLLATE "C" NOT NULL,
  admin_user_id uuid NOT NULL,
  csrf_token    char(43) COLLATE "C" NOT NULL,
  user_agent    varchar(255) NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  CONSTRAINT pk_admin_sessions PRIMARY KEY (id),
  CONSTRAINT fk_admin_sessions_user FOREIGN KEY (admin_user_id)
    REFERENCES admin_users (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT chk_admin_sessions_id CHECK (id ~ '^[0-9a-f]{64}$')
);

CREATE INDEX idx_admin_sessions_user ON admin_sessions (admin_user_id);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions (expires_at);

-- ---------------------------------------------------------------------
-- audit_logs: jejak aktivitas administratif (append-only bagi akun aplikasi)
-- Tidak pernah memuat password, token, NISN, ataupun pilihan suara.
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  id            bigint GENERATED ALWAYS AS IDENTITY,
  admin_user_id uuid NULL,
  action        varchar(64) NOT NULL,
  entity_type   varchar(32) NOT NULL,
  entity_id     varchar(64) NULL,
  -- Untuk penyaringan per pemilihan. Tanpa foreign key agar jejak audit tetap ada
  -- walaupun pemilihan (draft) dihapus.
  election_id   uuid NULL,
  metadata      jsonb NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_audit_logs PRIMARY KEY (id),
  CONSTRAINT fk_audit_logs_admin FOREIGN KEY (admin_user_id)
    REFERENCES admin_users (id) ON DELETE SET NULL ON UPDATE RESTRICT
);

CREATE INDEX idx_audit_logs_created ON audit_logs (created_at);
CREATE INDEX idx_audit_logs_election_created ON audit_logs (election_id, created_at);
CREATE INDEX idx_audit_logs_admin_created ON audit_logs (admin_user_id, created_at);

-- =====================================================================
-- Migrasi 002_reporting_views.sql
-- =====================================================================

-- =====================================================================
-- E-OSIS • Migrasi 002: view pelaporan (pemisahan operasi baca dan tulis)
--
-- Akun database aplikasi (DB_USER) hanya diberi hak INSERT pada tabel votes dan
-- voter_participation; ia TIDAK bisa SELECT/UPDATE/DELETE baris suara maupun NISN.
-- Untuk rekap hasil, aplikasi membaca view berikut, yang hanya mengekspos data
-- agregat / data tanpa identitas.
--
-- View PostgreSQL (tanpa opsi security_invoker) membaca tabel dasar dengan hak
-- PEMILIK view (akun migrasi), bukan hak pemanggilnya — setara SQL SECURITY DEFINER.
-- Skema aplikasi tidak dibuka lewat Data API Supabase, jadi view ini hanya dapat
-- dibaca akun yang diberi GRANT oleh "npm run db:grants".
-- =====================================================================

-- Jumlah suara per kandidat (agregat, tanpa identitas pemilih).
CREATE VIEW v_candidate_vote_counts AS
SELECT
  election_id,
  candidate_id,
  COUNT(*) AS vote_count
FROM votes
GROUP BY election_id, candidate_id;

-- Waktu partisipasi TANPA kolom NISN (untuk jumlah pemilih unik & grafik partisipasi).
CREATE VIEW v_participation_timeline AS
SELECT
  election_id,
  voted_at
FROM voter_participation;

-- =====================================================================
-- 3. Pencatatan migrasi (agar "npm run db:migrate" tahu skema ini sudah mutakhir)
-- =====================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text NOT NULL PRIMARY KEY,
  checksum   char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version, checksum) VALUES
  ('001_initial_schema.sql', 'ffa884d9a154fd2e73f69c3282b234a819dd87563fa735a4e770a0b04fb33e71'),
  ('002_reporting_views.sql', '128137f6d79f3b1bbc583948856934153fd033dc02fac8cce53b84e7cfcd1c17');

-- =====================================================================
-- 4. Hak akses minimum (sama dengan "npm run db:grants")
-- =====================================================================

REVOKE ALL ON SCHEMA "eosis" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON ALL TABLES IN SCHEMA "eosis" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "eosis" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "eosis" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON ALL TABLES IN SCHEMA "eosis" FROM "eosis_app";
GRANT USAGE ON SCHEMA "eosis" TO "eosis_app";
ALTER ROLE "eosis_app" SET search_path TO "eosis";
GRANT SELECT, INSERT, UPDATE, DELETE ON "eosis"."elections" TO "eosis_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON "eosis"."candidates" TO "eosis_app";
GRANT INSERT ON "eosis"."voter_participation" TO "eosis_app";
GRANT INSERT ON "eosis"."votes" TO "eosis_app";
GRANT SELECT ON "eosis"."v_candidate_vote_counts" TO "eosis_app";
GRANT SELECT ON "eosis"."v_participation_timeline" TO "eosis_app";
GRANT SELECT, UPDATE (last_login_at) ON "eosis"."admin_users" TO "eosis_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON "eosis"."admin_sessions" TO "eosis_app";
GRANT SELECT, INSERT ON "eosis"."audit_logs" TO "eosis_app";
DROP POLICY IF EXISTS "app_role_access" ON "eosis"."elections";
CREATE POLICY "app_role_access" ON "eosis"."elections" FOR ALL TO "eosis_app" USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "app_role_access" ON "eosis"."candidates";
CREATE POLICY "app_role_access" ON "eosis"."candidates" FOR ALL TO "eosis_app" USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "app_role_access" ON "eosis"."voter_participation";
CREATE POLICY "app_role_access" ON "eosis"."voter_participation" FOR ALL TO "eosis_app" USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "app_role_access" ON "eosis"."votes";
CREATE POLICY "app_role_access" ON "eosis"."votes" FOR ALL TO "eosis_app" USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "app_role_access" ON "eosis"."admin_users";
CREATE POLICY "app_role_access" ON "eosis"."admin_users" FOR ALL TO "eosis_app" USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "app_role_access" ON "eosis"."admin_sessions";
CREATE POLICY "app_role_access" ON "eosis"."admin_sessions" FOR ALL TO "eosis_app" USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "app_role_access" ON "eosis"."audit_logs";
CREATE POLICY "app_role_access" ON "eosis"."audit_logs" FOR ALL TO "eosis_app" USING (true) WITH CHECK (true);

RESET search_path;
