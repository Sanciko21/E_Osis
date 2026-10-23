-- E-OSIS • suara DUMMY untuk pemilihan [DEMO] (SQL Editor Supabase)
-- FILE INI DIBUAT OTOMATIS oleh "npm run db:sql" (isi dari server/seeds/demo-data.js) — jangan diedit manual.
--
-- Menambahkan 1000 pemilih fiktif ke pemilihan "[DEMO] ..." terbaru (jalankan demo.sql dulu):
--   Paslon 01: 418, Paslon 02: 352, Paslon 03: 230 suara.
-- - NISN dummy 9900000001–9900001000: jangan dipakai saat mencoba memilih secara manual.
-- - Waktu memilih tersebar selama 6 jam terakhir periode pemungutan suara (dua puncak, seperti
--   jam istirahat); bila perlu, waktu mulai pemilihan demo dimajukan agar periode itu tercakup.
-- - Jumlah siswa berhak pilih diisi 1250 bila masih kosong (partisipasi 80%).
-- - Aman dijalankan ulang: NISN yang sudah tercatat dilewati sehingga suara tidak dobel.
-- Hasil langsung tampil di dashboard admin. Untuk halaman Hasil publik, selesaikan pemilihan dan
-- publikasikan hasil dari dashboard admin. Hapus semuanya dengan sql/demo-delete.sql.
-- Tempel seluruh isi file ke SQL Editor lalu klik Run.

DO $$
DECLARE
  demo "eosis".elections%ROWTYPE;
  window_end timestamptz;
  window_start timestamptz;
  added integer;
BEGIN
  SELECT * INTO demo FROM "eosis".elections
   WHERE title LIKE '[DEMO]%' AND status <> 'draft'
   ORDER BY created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Belum ada pemilihan [DEMO] (bukan draf). Jalankan sql/demo.sql terlebih dahulu.';
  END IF;
  IF (SELECT count(*) FROM "eosis".candidates
       WHERE election_id = demo.id AND candidate_number BETWEEN 1 AND 3) < 3 THEN
    RAISE EXCEPTION 'Pasangan calon demo nomor 1–3 tidak lengkap. Jalankan sql/demo-delete.sql lalu sql/demo.sql.';
  END IF;

  window_end := LEAST(demo.end_at, now());
  window_start := LEAST(demo.start_at, window_end - interval '6 hours');
  UPDATE "eosis".elections
     SET start_at = window_start,
         eligible_voter_count = COALESCE(eligible_voter_count, 1250)
   WHERE id = demo.id;

  WITH voters AS MATERIALIZED (
    SELECT '99' || lpad(n::text, 8, '0') AS nisn,
           CASE WHEN n <= 418 THEN 1 WHEN n <= 770 THEN 2 ELSE 3 END AS candidate_number,
           window_start + (window_end - window_start) * LEAST(0.995, GREATEST(0.005,
             CASE WHEN random() < 0.55 THEN 0.32 ELSE 0.74 END + (random() + random() + random() - 1.5) * 0.16
           )) AS voted_at
      FROM generate_series(1, 1000) AS n
  ),
  recorded AS (
    INSERT INTO "eosis".voter_participation (election_id, nisn, voted_at, created_at)
    SELECT demo.id, voters.nisn, voters.voted_at, voters.voted_at FROM voters
    ON CONFLICT (election_id, nisn) DO NOTHING
    RETURNING nisn
  )
  -- Seperti alur voting aplikasi: id suara UUID acak, hanya TANGGAL (UTC), urutan acak.
  INSERT INTO "eosis".votes (id, election_id, candidate_id, created_on)
  SELECT gen_random_uuid(), demo.id, c.id, (v.voted_at AT TIME ZONE 'UTC')::date
    FROM recorded r
    JOIN voters v ON v.nisn = r.nisn
    JOIN "eosis".candidates c ON c.election_id = demo.id AND c.candidate_number = v.candidate_number
   ORDER BY random();
  GET DIAGNOSTICS added = ROW_COUNT;
  RAISE NOTICE '% pemilih dummy ditambahkan ke "%".', added, demo.title;
END
$$;

-- Ringkasan perolehan suara pemilihan [DEMO] (tampil sebagai hasil di SQL Editor).
SELECT c.candidate_number AS nomor_urut,
       c.chairperson_name || ' & ' || c.vice_chairperson_name AS pasangan_calon,
       count(v.id) AS suara
  FROM "eosis".candidates c
  LEFT JOIN "eosis".votes v ON v.candidate_id = c.id
 WHERE c.election_id = (SELECT id FROM "eosis".elections WHERE title LIKE '[DEMO]%' AND status <> 'draft' ORDER BY created_at DESC LIMIT 1)
 GROUP BY c.candidate_number, c.chairperson_name, c.vice_chairperson_name
 ORDER BY c.candidate_number;
