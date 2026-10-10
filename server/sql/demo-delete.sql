-- E-OSIS • hapus data DEMO (untuk SQL Editor Supabase)
-- FILE INI DIBUAT OTOMATIS oleh "npm run db:sql" — jangan diedit manual.
--
-- Menghapus semua pemilihan berjudul "[DEMO] ..." beserta pasangan calon, suara, dan
-- catatan partisipasi (NISN) uji cobanya. Pemilihan lain TIDAK tersentuh.

DELETE FROM "eosis".votes WHERE election_id IN (SELECT id FROM "eosis".elections WHERE title LIKE '[DEMO]%');
DELETE FROM "eosis".voter_participation WHERE election_id IN (SELECT id FROM "eosis".elections WHERE title LIKE '[DEMO]%');
-- Pasangan calon ikut terhapus (ON DELETE CASCADE).
DELETE FROM "eosis".elections WHERE title LIKE '[DEMO]%';
