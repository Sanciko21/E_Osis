-- =====================================================================
-- E-OSIS — persiapan SATU KALI untuk deploy API ke Supabase Edge Functions.
-- Jalankan di Supabase → SQL Editor (setelah setup.sql pernah dijalankan). Aman dijalankan ulang.
-- Tidak mengubah tabel, kolom, data, maupun RLS policy aplikasi.
-- =====================================================================

-- 1. search_path bawaan role aplikasi. Edge Functions memakai Transaction pooler (port 6543)
--    yang membagi koneksi antar-request; dengan ini setiap koneksi langsung memakai skema "eosis".
ALTER ROLE eosis_app SET search_path TO eosis;

-- 2. Bucket publik untuk foto pasangan calon. Siapa pun dapat MELIHAT foto (sama seperti di
--    kartu beranda), tetapi hanya API (kunci server Supabase) yang dapat mengunggah/menghapus:
--    tidak ada policy INSERT/UPDATE/DELETE untuk pengguna anonim.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('candidate-photos', 'candidate-photos', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Pemeriksaan (harus tampil: search_path=eosis dan bucket candidate-photos public=true).
SELECT rolname, rolconfig FROM pg_roles WHERE rolname = 'eosis_app';
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'candidate-photos';
