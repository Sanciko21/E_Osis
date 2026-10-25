# Deploy E-OSIS di hosting cPanel Rumahweb (subfolder `/E-Voting/`)

```
Browser siswa/admin
   │  https://domain-sekolah/E-Voting/
   ▼
Rumahweb (cPanel) ── public_html/E-Voting/
   ├── index.html, assets/, demo/ ...   file statis React (hasil build)
   └── api/index.php                    proxy: /E-Voting/api/* → Edge Function (origin tetap sama
   │                                    → cookie sesi admin & CSRF berfungsi)
   ▼
Supabase Edge Function "api" ── API Express yang SAMA dengan server/src
   ├── Supabase Postgres (skema eosis, RLS)
   └── Supabase Storage (foto pasangan calon)
```

Hosting cPanel biasa tidak menjalankan server Node.js yang terhubung ke database Supabase, jadi API
dijalankan di Supabase Edge Function. Rumahweb hanya menyajikan file statis plus satu proxy PHP
kecil (tanpa logika aplikasi & tanpa rahasia) — perannya sama dengan rewrite `/api/*` di
`vercel.json`. Endpoint, validasi NISN, aturan satu suara, RLS, dan database tidak berubah.

## 1. Supabase — backend (sekali saja)

Ikuti **langkah 1 dan 2** di [DEPLOY-SUPABASE-VERCEL.md](DEPLOY-SUPABASE-VERCEL.md#1-supabase--sql-satu-kali)
(jalankan `deploy-edge.sql`, isi `supabase/.env.production`, `secrets set`, `functions deploy`),
dengan satu perbedaan — `CORS_ORIGINS` diisi domain sekolah (tanpa `/E-Voting`):

```powershell
npx supabase secrets set CORS_ORIGINS=https://domain-sekolah.sch.id
npx supabase functions deploy api --use-api
```

Uji: `https://<project-ref>.supabase.co/functions/v1/api/health` → `{"status":"ok","database":"ok"}`.

## 2. Build frontend untuk Rumahweb

```powershell
cd client
Copy-Item .env.rumahweb.example .env.rumahweb   # sekali saja, lalu cek isinya
npm ci
npm run build:rumahweb
```

`client/.env.rumahweb`:

| Variabel | Isi |
|---|---|
| `BASE_PATH` | Folder di `public_html`, mis. `/E-Voting/` (huruf besar/kecil harus sama persis) |
| `SUPABASE_FUNCTIONS_URL` | `https://<project-ref>.supabase.co/functions/v1` (tanpa `/api`) |

Hasilnya `client/dist/` sudah berisi `.htaccess`, `api/index.php`, dan `api/.user.ini`.
Build biasa (`npm run build`, dipakai Vercel) tetap untuk akar domain dan tidak terpengaruh.

## 3. Unggah ke cPanel

1. Kompres **isi** folder `client/dist` (bukan foldernya) menjadi `E-Voting.zip`. File `.htaccess`
   dan folder `api` wajib ikut — di Windows Explorer aktifkan *View → Hidden items* untuk memastikan.
2. cPanel → **File Manager** → `public_html/E-Voting/`. Aktifkan *Settings → Show Hidden Files*.
   Hapus isi lama, lalu **Upload** `E-Voting.zip` → klik kanan → **Extract** → hapus zip-nya.
3. cPanel → **Select PHP Version**: PHP **8.x** (minimal 7.4) dengan ekstensi **curl** aktif.
4. cPanel → **SSL/TLS Status**: pastikan domain sudah HTTPS (AutoSSL). Tanpa HTTPS login admin
   tidak berfungsi.

## 4. Pemeriksaan

1. `https://domain-sekolah/E-Voting/api/health` → `{"status":"ok","database":"ok"}`.
2. `https://domain-sekolah/E-Voting/` menampilkan jadwal & pasangan calon; muat ulang (F5) di
   `/E-Voting/hasil` atau `/E-Voting/admin` tetap tampil (bukan 404).
3. Login admin, unggah foto pasangan calon → foto tampil.
4. Coba memilih pada pemilihan `[DEMO]`, lalu pastikan NISN yang sama ditolak.

## 5. Memperbarui aplikasi

- **Frontend**: `npm run build:rumahweb` → unggah ulang isi `client/dist` (langkah 3.1–3.2).
- **Backend**: `npx supabase functions deploy api --use-api`.
- **Database**: tetap manual lewat SQL Editor.

## 6. Pemecahan masalah

| Gejala | Penyebab & solusi |
|---|---|
| `/E-Voting/api/...` → 404 halaman Apache | `.htaccess` tidak ikut terunggah (file tersembunyi) atau `BASE_PATH` beda huruf dengan nama folder |
| `/E-Voting/api/...` → halaman "Internal Server Error" Apache (bukan JSON) | Permission terlalu longgar setelah ekstrak zip: folder `api` **755**, `index.php` & `.user.ini` **644** |
| `UPSTREAM_UNAVAILABLE (cURL 28, tahap dns)` | DNS hosting lambat (±5–10 dtk). Proxy mengingat IP Supabase 6 jam (`api/.upstream-ip`), jadi cukup muat ulang; laporkan DNS lambat ke support hosting |
| `/E-Voting/api/health` → `UPSTREAM_UNAVAILABLE` (lainnya) | Edge Function belum dideploy / `SUPABASE_FUNCTIONS_URL` salah; `PROXY_CURL_MISSING` = ekstensi PHP curl mati (pilih PHP 8.x non-native di *Select PHP Version*) |
| File tes `cek.php` di folder `api/` malah menjawab JSON proxy | Semua URL `api/*` diarahkan ke `index.php`; taruh file tes di folder `E-Voting/` |
| `/E-Voting/api/health` menampilkan kode PHP / terunduh | PHP belum aktif untuk domain → cek *Select PHP Version* |
| 500 Internal Server Error di semua halaman | Hosting menolak salah satu baris `.htaccess`; lihat cPanel → **Errors**, lalu kabari baris mana |
| Halaman putih, file `assets/...` 404 | Build tanpa mode Rumahweb (`npm run build`). Pakai `npm run build:rumahweb` |
| Muat ulang `/E-Voting/admin` → 404 | `.htaccess` tidak terbaca (mod_rewrite) — hubungi support Rumahweb |
| Login berhasil lalu langsung keluar | Domain belum HTTPS, atau dibuka lewat `http://` |
| Unggah foto gagal "maksimal 2 MB" padahal kecil | `api/.user.ini` tidak ikut terunggah; tunggu ±5 menit setelah unggah (cache PHP) |
| `{"msg":"Invalid JWT"}` | Edge Function terdeploy dengan verifikasi JWT — lihat tabel di DEPLOY-SUPABASE-VERCEL.md |
