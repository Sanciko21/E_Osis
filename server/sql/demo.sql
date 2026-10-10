-- E-OSIS • data DEMO untuk SQL Editor Supabase
-- FILE INI DIBUAT OTOMATIS oleh "npm run db:sql" (isi dari server/seeds/demo-data.js) — jangan diedit manual.
--
-- Membuat satu pemilihan "[DEMO] ..." yang LANGSUNG DIBUKA (mulai 5 menit lalu, selesai
-- 8 jam lagi) dengan 3 pasangan calon fiktif bergambar kartun (client/public/demo),
-- untuk mencoba voting di halaman /pilih.
-- Tidak membuat suara apa pun. Tempel seluruh isi file ke SQL Editor lalu klik Run.
-- Hapus dengan sql/demo-delete.sql sebelum pemilihan sungguhan.

DO $$
DECLARE
  demo_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO "eosis".elections (id, title, description, start_at, end_at, status, results_public)
  VALUES (demo_id, '[DEMO] Pemilihan Ketua & Wakil Ketua OSIS 2026/2027', 'Data demonstrasi untuk pengembangan lokal. Hapus sebelum dipakai untuk pemilihan sungguhan.',
          now() - interval '5 minutes', now() + interval '8 hours', 'active', FALSE);

  INSERT INTO "eosis".candidates (id, election_id, candidate_number, chairperson_name, vice_chairperson_name, photo_url, vision, mission)
  VALUES
    (gen_random_uuid(), demo_id, 1, 'Raka Aditya Pratama', 'Nabila Putri Lestari', '/demo/paslon-1.png', 'Mewujudkan OSIS yang aktif, kreatif, dan peduli sebagai rumah bagi seluruh siswa.', 'Mengadakan forum aspirasi siswa setiap bulan.
Menghidupkan kembali kegiatan ekstrakurikuler bidang seni dan olahraga.
Mengajak siswa menjaga kebersihan lingkungan sekolah melalui program Jumat Bersih.'),
    (gen_random_uuid(), demo_id, 2, 'Dimas Fajar Nugroho', 'Salsabila Kirana Dewi', '/demo/paslon-2.png', 'OSIS yang jujur, terbuka, dan menjadi teladan disiplin bagi warga sekolah.', 'Membuat papan informasi kegiatan OSIS yang terbuka untuk semua kelas.
Mengadakan program literasi pagi bersama perpustakaan sekolah.
Mendukung lomba antarkelas untuk mempererat persaudaraan.'),
    (gen_random_uuid(), demo_id, 3, 'Aulia Rahmawati', 'Bagas Satria Wibowo', '/demo/paslon-3.png', 'Menjadikan OSIS wadah prestasi dan inovasi yang ramah bagi setiap siswa.', 'Membentuk kelompok belajar sebaya menjelang ujian.
Menyelenggarakan pentas karya siswa setiap semester.
Mengembangkan kegiatan sosial bersama masyarakat sekitar sekolah.');
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Sudah ada pemilihan aktif. Tutup pemilihan itu dulu dari dashboard admin, lalu Run lagi.';
END
$$;
