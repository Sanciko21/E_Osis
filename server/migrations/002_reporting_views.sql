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
