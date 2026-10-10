-- E-OSIS • RESET database (untuk SQL Editor Supabase)
--
-- PERINGATAN: MENGHAPUS SELURUH DATA E-OSIS — pemilihan, pasangan calon, suara, NISN,
-- akun admin, dan audit log — dan TIDAK DAPAT DIBATALKAN. Hanya untuk mengulang setup
-- dari awal (mis. setelah setup.sql gagal), bukan untuk database yang sudah dipakai memilih.
--
-- Hanya skema "eosis" yang dihapus; skema bawaan Supabase (public, auth, storage, ...) aman.
-- Setelah ini jalankan kembali sql/setup.sql.

DROP SCHEMA IF EXISTS eosis CASCADE;

-- Opsional: hapus juga role aplikasi (setup.sql akan membuatnya lagi).
-- DROP ROLE IF EXISTS eosis_app;
