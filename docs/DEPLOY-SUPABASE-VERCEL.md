# Deploy E-OSIS: frontend di Vercel, backend & database di Supabase

```
Browser siswa/admin
   │  https://<nama-proyek>.vercel.app
   ▼
Vercel ── file statis React (client/dist)
   │  /api/*  (rewrite/proxy, origin tetap sama → cookie sesi admin berfungsi)
   ▼
Supabase Edge Function "api" ── API Express yang SAMA dengan server/src
   ├── Supabase Postgres (skema eosis, role eosis_app, RLS) ── data pemilihan & suara
   └── Supabase Storage (bucket candidate-photos)          ── foto pasangan calon
```

Logika aplikasi tidak berubah: endpoint, validasi NISN, satu NISN satu suara, jadwal pemilihan,
publikasi hasil, hak akses admin, dan RLS sama persis dengan server Node.js. Yang berbeda hanya
tempat menjalankannya:

| Hal | Server Node.js biasa | Supabase Edge Function |
|---|---|---|
| Runtime | Node.js | Deno (tanpa modul native; hash password memakai Argon2id WebAssembly) |
| Koneksi database | Session pooler, port 5432 | Transaction pooler, port 6543 |
| Foto kandidat | folder `server/uploads` | Supabase Storage, bucket `candidate-photos` |
| Pembersihan sesi kedaluwarsa | tiap jam | setelah login admin (maks. sekali per jam per worker) |
| Konfigurasi | `server/.env` | Edge Function Secrets |

## 1. Supabase — SQL satu kali

Buka **Supabase → SQL Editor**, tempel seluruh isi [`server/sql/deploy-edge.sql`](../server/sql/deploy-edge.sql),
lalu klik **Run**. Script ini:

- menyetel `search_path` bawaan role `eosis_app` ke skema `eosis` (wajib untuk Transaction pooler);
- membuat bucket publik `candidate-photos` (maks. 2 MB, JPG/PNG/WebP). Foto boleh dilihat publik
  seperti di kartu beranda, tetapi hanya API yang dapat mengunggah atau menghapusnya.

Tabel, kolom, data, dan RLS policy tidak diubah.

## 2. Supabase — secrets & deploy Edge Function

1. Salin `supabase/.env.example` menjadi `supabase/.env.production`, lalu isi:
   - `DB_USER=eosis_app.<project-ref>` dan `DB_PASSWORD` = nilai `DB_PASSWORD` di `server/.env`;
   - `CORS_ORIGINS` = domain Vercel (boleh diisi belakangan, lihat langkah 3).

   File ini berisi rahasia dan sudah diabaikan `.gitignore` — jangan di-commit.
2. Di folder proyek (PowerShell/terminal):

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase secrets set --env-file supabase/.env.production
   npx supabase functions deploy api --use-api
   ```

   `--use-api` membundel function tanpa Docker dan mengizinkan impor kode dari folder `server/`
   (jangan pindahkan/hapus folder itu). Pengaturan function ada di `supabase/config.toml`
   (`verify_jwt = false`, karena API memakai sesi admin & CSRF sendiri).
3. Uji: buka `https://<project-ref>.supabase.co/functions/v1/api/health` → harus
   `{"status":"ok","database":"ok"}`.

`SUPABASE_URL` dan kunci server Supabase (untuk Storage) disediakan otomatis oleh Supabase.

## 3. Vercel — frontend

1. Pastikan `destination` di [`vercel.json`](../vercel.json) memakai project ref Supabase Anda.
2. Vercel → **Add New → Project** → impor repo GitHub. *Framework Preset*: **Other**, *Root
   Directory*: biarkan kosong (akar repo). Perintah build sudah diatur `vercel.json`.
3. *Environment Variables* (opsional): `VITE_SCHOOL_NAME`, `VITE_SCHOOL_LOGO_URL`.
   **Jangan** mengisi `VITE_API_BASE_URL` (API diakses lewat origin yang sama).
4. **Deploy**, lalu catat domainnya, mis. `https://e-osis.vercel.app`, dan setel CORS:

   ```bash
   npx supabase secrets set CORS_ORIGINS=https://e-osis.vercel.app
   npx supabase functions deploy api --use-api
   ```

## 4. Pemeriksaan setelah deploy

1. `https://<domain-vercel>/api/health` → `{"status":"ok","database":"ok"}`.
2. Beranda menampilkan jadwal & kartu pasangan calon; halaman Hasil mengikuti aturan publikasi.
3. Login admin, unggah foto pasangan calon → foto tampil dan tersimpan di
   **Storage → candidate-photos/candidates/**.
4. Coba memilih pada pemilihan uji (`[DEMO]`), lalu pastikan NISN yang sama ditolak.
5. **Supabase → Edge Functions → api → Logs**, cari `Edge: header X-Forwarded-For`:
   - `viaVercel: true` dan `entries` ≥ 2 → IP siswa terbaca dengan benar;
   - `entries: 1` → semua siswa terlihat satu IP. Batas bawaan Edge sudah longgar
     (`VOTE_RATE_LIMIT_MAX=600`, `API_RATE_LIMIT_MAX=6000` per menit per worker); naikkan lewat
     `npx supabase secrets set ...` bila muncul pesan "Terlalu banyak permintaan".

Hapus pemilihan `[DEMO]` (`server/sql/demo-delete.sql`) sebelum pemilihan sungguhan.

## 5. Memperbarui aplikasi

- **Frontend**: `git push` → Vercel membangun ulang otomatis.
- **Backend** (`server/src` atau `supabase/`): `npx supabase functions deploy api --use-api`.
- **Database**: tetap manual lewat SQL Editor seperti biasa.

## 6. Batasan & catatan

- Supabase Free: proyek **dijeda bila 7 hari tidak aktif** (aktifkan kembali sebelum hari pemilihan),
  Edge Functions 2 detik CPU per request (login ±0,5 detik) dan 500 ribu pemanggilan per bulan.
- Rate limit disimpan per worker Edge (bukan bersama), jadi sifatnya pengaman tambahan. Aturan
  satu NISN satu suara tetap dijamin database.
- Foto yang dulu diunggah saat menjalankan server lokal (URL `/uploads/...`) tidak ikut terbawa;
  unggah ulang lewat dashboard admin. Foto demo (`/demo/...`) tetap tampil dari Vercel.
- Bila *Network Restrictions* database diaktifkan, pastikan `/api/health` tetap `ok`.

## 7. Pemecahan masalah

| Gejala | Penyebab & solusi |
|---|---|
| `{"msg":"Invalid JWT"}` / 401 dari semua endpoint | Function terdeploy dengan verifikasi JWT. Deploy ulang dari akar repo (memakai `supabase/config.toml`) atau tambahkan `--no-verify-jwt` |
| 500, log `relation "..." does not exist` | `deploy-edge.sql` belum dijalankan (search_path role) |
| Log `Tenant or user not found` | `DB_USER` harus `eosis_app.<project-ref>` |
| Log `password authentication failed` | `DB_PASSWORD` di secrets berbeda dengan password role `eosis_app` |
| Unggah foto gagal ("Foto gagal diunggah ke penyimpanan") | Bucket `candidate-photos` belum dibuat → jalankan `deploy-edge.sql` |
| Login admin berhasil tetapi langsung keluar | Akses lewat domain Vercel (HTTPS), bukan URL `supabase.co`; periksa `CORS_ORIGINS` |
| Halaman beranda tampil, data tidak muncul | `destination` di `vercel.json` salah project ref, atau function belum dideploy |
