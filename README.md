# E-OSIS — Sistem Pemilihan Ketua & Wakil Ketua OSIS

E-OSIS adalah aplikasi web full-stack untuk pemilihan Ketua dan Wakil Ketua OSIS tingkat SMP.
Siswa memilih **cukup dengan NISN** (tanpa registrasi seluruh NISN sebelumnya), panitia
mengelola jadwal & pasangan calon dari dashboard, dan hasil dihitung langsung dari database.

**Jaminan utama sistem**

| Jaminan | Bagaimana dijamin |
|---|---|
| Satu NISN hanya bisa memilih sekali per pemilihan | `UNIQUE(election_id, nisn)` di PostgreSQL (bukan sekadar cek `SELECT`) — teruji dengan 12 request paralel |
| Suara & partisipasi tersimpan atomik | Satu transaksi PostgreSQL: `INSERT voter_participation` → `INSERT votes` → `COMMIT`, `ROLLBACK` bila apa pun gagal |
| Kandidat harus milik pemilihan yang sama | Validasi backend **dan** foreign key komposit `votes(election_id, candidate_id) → candidates(election_id, id)` |
| Identitas terpisah dari pilihan | Tabel `votes` tanpa NISN, id suara UUID v4 acak, waktu suara hanya berupa tanggal |
| Aplikasi tidak bisa membaca/mengubah suara | Akun DB aplikasi hanya punya `INSERT` pada `votes` & `voter_participation`; rekap lewat VIEW agregat |
| Hasil sementara hanya untuk admin | Endpoint publik menolak (`403 RESULTS_NOT_PUBLIC`) kecuali pemilihan **selesai** dan `results_public = true` |

> Dokumentasi rinci: [`docs/API.md`](docs/API.md) · [`docs/DATABASE.md`](docs/DATABASE.md) ·
> [`docs/KEAMANAN.md`](docs/KEAMANAN.md) · contoh Nginx: [`docs/deploy/nginx.conf.example`](docs/deploy/nginx.conf.example)

---

## Daftar isi

1. [Fitur](#1-fitur)
2. [Arsitektur & struktur proyek](#2-arsitektur--struktur-proyek)
3. [Persyaratan versi](#3-persyaratan-versi)
4. [Instalasi](#4-instalasi)
5. [Konfigurasi `.env`](#5-konfigurasi-env)
6. [Database: pembuatan, migrasi, seed, reset](#6-database-pembuatan-migrasi-seed-reset)
7. [Menjalankan aplikasi](#7-menjalankan-aplikasi)
8. [Ringkasan API](#8-ringkasan-api)
9. [Mekanisme transaksi voting & pencegahan voting ganda](#9-mekanisme-transaksi-voting--pencegahan-voting-ganda)
10. [Keamanan, akses admin, dan publikasi hasil](#10-keamanan-akses-admin-dan-publikasi-hasil)
11. [Pengujian](#11-pengujian)
12. [Keterbatasan verifikasi identitas & anonimitas](#12-keterbatasan-verifikasi-identitas--anonimitas)
13. [Deployment yang aman](#13-deployment-yang-aman)
14. [Pemecahan masalah](#14-pemecahan-masalah)

---

## 1. Fitur

**Halaman publik (siswa)**
- **Beranda** — hero dengan animasi pembuka GSAP, status & jadwal pemilihan dengan hitung mundur
  (dikoreksi ke jam server), tahapan pemilihan, cara memilih, kartu pasangan calon (visi & misi
  lengkap dalam dialog), FAQ accordion, footer. Animasi scroll memakai AOS dan Motion for React.
- **Kartu pasangan calon** — foto paslon di depan logo sekolah; saat disorot mouse kartu melayang
  dan miring 3D mengikuti kursor ("flying card"). Efek gerak otomatis mati di layar sentuh dan bila
  pengguna memilih animasi dikurangi. Paling bagus dengan foto **PNG berlatar transparan**.
- **Memilih langsung dari kartu** (tanpa login) — selama pemungutan suara dibuka, tiap kartu punya
  tombol **"Pilih Paslon NN"**: dialog NISN (otomatis hanya angka, 10 digit, divalidasi) → konfirmasi
  SweetAlert2 berisi nomor urut, Ketua, dan Wakil Ketua dengan tombol **"Kembali"** / **"Ya, Saya
  Yakin"** → suara dikirim. Satu proses pada satu waktu (tombol terkunci, aman dari klik ganda), sukses
  hanya tampil setelah server menyimpan, dan pilihan tidak tersisa di layar (aman untuk komputer
  bersama di lab). Tombol "Pilih pasangan ini" juga tersedia di dialog visi & misi.
- Alamat bilik suara lama `/pilih` otomatis dialihkan ke kartu pasangan calon di beranda.
- **Hak cipta** — "© PTI AM 2026 UNDIKSHA" tampil di hero beranda dan footer
  (`client/src/components/brand/Copyright.jsx`).
- **Hasil (`/hasil`)** — hanya tampil bila pemilihan selesai dan dipublikasikan panitia.

**Dashboard admin (`/admin`)**
- Login aman (Argon2id, cookie sesi HttpOnly, CSRF token), dua peran: **Panitia (admin)** dan
  **Pengawas (observer, hanya-baca)**.
- Dashboard: total suara sah, pemilih unik, partisipasi (hanya bila jumlah siswa resmi diisi),
  pemeriksaan integritas (jumlah suara = jumlah catatan partisipasi), grafik batang, donat, garis
  partisipasi, meter partisipasi, tabel hasil, pembaruan otomatis yang menahan tampilan lama saat memuat.
- Manajemen pemilihan & jadwal (draft → terjadwal → aktif → selesai), CRUD pasangan calon (unggah foto
  aman), pengaturan publikasi hasil, audit log aktivitas admin dengan filter & pagination.

**Integrasi library wajib**: SweetAlert2 (`src/utils/alerts.js`), Chart.js + react-chartjs-2
(`src/components/charts/`), AOS (`src/lib/aos.js`), GSAP (`src/components/landing/Hero.jsx`,
`src/components/ui/StatCard.jsx`). Pendukung tampilan: Motion for React (`src/lib/motionPresets.js`;
stagger kartu, accordion FAQ, dialog, ilustrasi melayang) dan ikon Lucide (`src/components/ui/Icon.jsx`).
Semua animasi menghormati `prefers-reduced-motion`.

## 2. Arsitektur & struktur proyek

```
Browser (React + Vite)
   │  fetch JSON + cookie sesi (HttpOnly) + header X-CSRF-Token
   ▼
Express 5 API  ──  helmet · CORS allowlist · rate limit · validasi zod · error handler terpusat
   │  pg / node-postgres (query berparameter, akun DB berhak minimum, TLS)
   ▼
PostgreSQL 14+ / Supabase, skema "eosis"  ──  UNIQUE · FK komposit · CHECK · VIEW agregat · transaksi
```

```
.
├── client/                     Frontend React + Vite
│   ├── src/
│   │   ├── components/         UI reusable (navbar, footer, kartu kandidat, badge, state, dialog, chart)
│   │   ├── pages/              Halaman publik & admin
│   │   ├── layouts/            PublicLayout, AdminLayout
│   │   ├── hooks/              useResource, usePolling, useNow, useDocumentTitle
│   │   ├── context/            AuthContext (sesi admin)
│   │   ├── services/           apiClient (timeout, CSRF, error seragam) + modul API
│   │   ├── utils/              alerts (SweetAlert2), chartData, format, nisn, motion
│   │   ├── lib/                aos.js (inisialisasi AOS, singleton), motionPresets.js (varian Motion)
│   │   ├── styles/             Token desain & CSS per area
│   │   └── test/               Setup & fixture pengujian
│   └── e2e/                    Tes Playwright (responsif & alur voting)
├── server/                     Backend Node.js + Express
│   ├── src/
│   │   ├── config/             env (tervalidasi), database (pool & transaksi), permissions (RBAC)
│   │   ├── controllers/  routes/  middleware/  services/  repositories/  validators/  utils/
│   │   ├── app.js              Susunan middleware & route
│   │   └── server.js           Start server + graceful shutdown
│   ├── migrations/             Migrasi SQL (skema + view pelaporan)
│   ├── seeds/                  Seed admin lokal & data demo
│   ├── scripts/                CLI db:* dan admin:*
│   └── tests/                  Tes integrasi (PostgreSQL sungguhan) & unit
├── docs/                       Dokumentasi API, database, keamanan, contoh deployment
├── package.json                Skrip gabungan (dev, test, lint, build)
└── README.md
```

## 3. Persyaratan versi

| Komponen | Versi |
|---|---|
| Node.js | **20.19+ atau 22.12+** (disarankan 22 LTS / 24 LTS). Diuji di Node 24.15 |
| npm | 10+ (diuji npm 11.2) |
| PostgreSQL | **14+** (memakai `date_bin` & `gen_random_uuid`), mis. **Supabase** (PostgreSQL 15/17) atau PostgreSQL lokal. Suite tes dijalankan & lulus di **PostgreSQL 17.10**, termasuk dengan akun migrasi non-superuser seperti role `postgres` di Supabase |
| Peramban | Chrome/Edge/Firefox/Safari versi terbaru (memakai `<dialog>` dan container query CSS) |

Satu proyek Supabase sudah cukup: aplikasi memakai skema `eosis` di database `postgres`, sedangkan
tes otomatis memakai skema `eosis_test` (boleh di proyek yang sama, atau di PostgreSQL lokal).

Versi library utama: React 19.3, React Router 7.18, Vite 7.3, Express 5.2, pg 8.23, zod 4.6,
argon2 0.45, SweetAlert2 11.26, Chart.js 4.5 + react-chartjs-2 5.3, AOS 2.3.4, GSAP 3.15, Motion 14.1,
lucide-react 1.54,
Vitest 4.1, Playwright 1.63.

## 4. Instalasi

```bash
git clone https://github.com/Sanciko21/E_Osis.git e-osis && cd e-osis
npm run install:all        # menginstal root, server/, dan client/ (beserta lockfile masing-masing)
```

Atau per paket: `npm install --prefix server` dan `npm install --prefix client`.

## 5. Konfigurasi `.env`

```bash
cp server/.env.example server/.env          # Windows: copy server\.env.example server\.env
cp client/.env.example client/.env          # opsional
```

File `.env` asli **tidak** masuk Git (lihat `.gitignore`). Variabel penting di `server/.env`:

| Variabel | Keterangan |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME` | Lokasi database PostgreSQL. Supabase: host **Session pooler**, port `5432`, database `postgres` |
| `DB_SCHEMA` | Skema tempat semua tabel E-OSIS (bawaan `eosis`; bukan `public`) |
| `DB_SSL`, `DB_SSL_CA` | `disable` / `require` / `verify-full` (+ file sertifikat CA). Bawaan: `disable` untuk host lokal, `require` untuk host lain |
| `DB_USER`, `DB_PASSWORD` | **Akun aplikasi berhak minimum** yang dipakai server berjalan (mis. `eosis_app`; lewat pooler Supabase: `eosis_app.<project-ref>`) |
| `DB_MIGRATION_USER`, `DB_MIGRATION_PASSWORD` | Akun berhak DDL/GRANT (Supabase: `postgres.<project-ref>` + database password proyek) — **hanya** untuk skrip CLI |
| `CORS_ORIGINS` | Daftar origin frontend yang diizinkan (dipisah koma, tidak boleh `*` di production) |
| `COOKIE_SECURE` | `true` wajib di production (HTTPS). Cookie sesi otomatis memakai prefiks `__Host-` |
| `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS` | Batas idle & batas absolut sesi admin |
| `LOGIN_RATE_LIMIT_*`, `VOTE_RATE_LIMIT_*` | Rate limit per IP. Lab komputer sering berbagi satu IP — sesuaikan |
| `NISN_PATTERN` | Aturan NISN sekolah (regex) yang **memperketat** aturan nasional 10 digit |
| `TRUST_PROXY` | Jumlah reverse proxy di depan aplikasi (mis. `1` untuk Nginx) |
| `SERVE_CLIENT` | `true` = Express juga menyajikan build React (mode satu server) |

`client/.env` hanya berisi nilai **publik** (`VITE_SCHOOL_NAME`, `VITE_SCHOOL_LOGO_URL`,
`VITE_API_BASE_URL`). Semua variabel `VITE_*` terlihat di browser — jangan menaruh rahasia apa pun di sana.

**Logo sekolah** untuk latar foto pasangan calon: simpan file sebagai
`client/public/logo-sekolah.png` (PNG transparan disarankan). Nama/lokasi lain dapat diatur lewat
`VITE_SCHOOL_LOGO_URL`. Bila file tidak ada, latar foto cukup berupa gradasi warna.

## 6. Database: pembuatan, migrasi, seed, reset

### 6.1 Menyiapkan Supabase

1. Buat proyek di [supabase.com/dashboard](https://supabase.com/dashboard) (region terdekat, mis.
   *Southeast Asia (Singapore)*). Simpan **database password** yang dibuat saat itu.
2. Di halaman proyek, klik **Connect** → pilih metode **Session pooler** → **View parameters**.
   Catat `host`, `port` (5432), `database` (`postgres`), dan `user` (`postgres.<project-ref>`).
3. Isi `server/.env` (salin dari `server/.env.example`):

   ```env
   DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com   # host Session pooler proyekmu
   DB_PORT=5432
   DB_NAME=postgres
   DB_SCHEMA=eosis
   DB_SSL=require
   # Akun aplikasi berhak minimum — dibuat otomatis oleh db:setup. Format pooler: <role>.<project-ref>
   DB_USER=eosis_app.<project-ref>
   DB_PASSWORD=<password acak yang kuat, khusus untuk eosis_app>
   # Akun migrasi = user postgres proyek, hanya untuk skrip CLI db:* dan admin:*
   DB_MIGRATION_USER=postgres.<project-ref>
   DB_MIGRATION_PASSWORD=<database password proyek>
   ```

   Password yang berisi `#`, spasi, atau tanda kutip **wajib diapit kutip ganda**
   (`DB_MIGRATION_PASSWORD="Ab#cd 12"`) — tanpa kutip, semua setelah `#` dianggap komentar.
4. Buat tabel dengan **salah satu** cara: otomatis `npm run db:setup` lalu `npm run db:seed` dari
   folder `server/` (rincian di [6.3](#63-perintah-database)), **atau** manual lewat SQL Editor
   Supabase ([6.2](#62-cara-manual-lewat-sql-editor-supabase)).

Catatan Supabase:

- **Pakai Session pooler** (atau koneksi langsung `db.<project-ref>.supabase.co` bila jaringan
  server mendukung IPv6 — user-nya tanpa akhiran: `eosis_app`, `postgres`). **Jangan** memakai
  Transaction pooler (port `6543`): server menyetel `search_path` per koneksi, dan mode transaksi
  tidak mempertahankannya.
- **SSL**: `require` sudah mengenkripsi koneksi. Untuk verifikasi sertifikat penuh, unduh sertifikat
  CA dari *Database Settings → SSL Configuration*, simpan di `server/`, lalu setel
  `DB_SSL=verify-full` dan `DB_SSL_CA=./prod-ca-2021.crt` (sesuaikan nama file).
- Tabel berada di skema `eosis`, **bukan** `public`, sehingga tidak ikut terbuka lewat Data API
  Supabase. Jangan menambahkan `eosis` ke *Exposed schemas*; `db:grants` juga mencabut akses role
  `anon`, `authenticated`, dan `service_role`. Tabel dapat dilihat di Table Editor dengan memilih
  skema `eosis`.
- `DB_CONNECTION_LIMIT` (bawaan 10) harus di bawah *Pool Size* pooler pada *Database Settings*.

**PostgreSQL lokal** (alternatif, mis. installer resmi postgresql.org): `DB_HOST=127.0.0.1`,
`DB_PORT=5432`, `DB_USER=eosis_app`, `DB_MIGRATION_USER=postgres`. SSL otomatis nonaktif untuk host lokal.

### 6.2 Cara manual lewat SQL Editor Supabase

Tanpa skrip `db:*` — semua dijalankan sendiri di **Supabase → SQL Editor**. Hasilnya identik dengan
`npm run db:setup` (skema `eosis`, role `eosis_app` berhak minimum, akses Data API dicabut).

1. Buka [`server/sql/setup.sql`](server/sql/setup.sql), salin **seluruh** isinya ke SQL Editor.
   **Jangan** mengisi password di file itu — file tersebut ikut ter-upload ke GitHub.
2. **Di SQL Editor**, pada langkah 1 script ganti `GANTI_DENGAN_DB_PASSWORD` (hanya ada di baris
   `app_password`) dengan nilai `DB_PASSWORD` di `server/.env` — **bukan** password database Supabase.
3. Klik **Run** (jalankan seluruh script sekaligus, bukan per bagian). Bila password lupa diganti
   atau terjadi error, script dibatalkan seluruhnya — perbaiki lalu Run lagi. Bila skema `eosis`
   sudah telanjur ada (mis. dari `db:setup`), jalankan [`server/sql/reset.sql`](server/sql/reset.sql)
   dulu — **ini menghapus seluruh data E-OSIS**.
   Bila Supabase menawarkan untuk **mengaktifkan RLS** pada tabel baru, pilihan mana pun aman:
   script ini membuat policy RLS untuk `eosis_app`, sementara batas aksesnya tetap diatur GRANT.
4. Hapus password dari editor setelah berhasil (riwayat query tersimpan di dashboard Supabase).
5. Buat akun admin. Password admin disimpan sebagai hash **Argon2id** yang tidak dapat dibuat di
   SQL Editor, jadi hash dibuat di komputermu (tanpa koneksi database) lalu SQL-nya ditempel:

   ```bash
   cd server
   npm run admin:sql -- --email ketua@sekolah.sch.id --name "Ketua Panitia" --role admin
   npm run admin:sql -- --email guru@sekolah.sch.id --name "Guru Pengawas" --role observer --generate
   npm run admin:sql -- --email ketua@sekolah.sch.id --reset        # ganti password
   npm run admin:sql -- --email ketua@sekolah.sch.id --name "Ketua Panitia" --role admin --show   # password terlihat saat diketik
   ```

   Password diketik dua kali dan tampil sebagai `*`; dengan `--show` password terlihat dan cukup
   diketik sekali (pastikan tidak ada yang melihat layar).

   Salin SQL yang tercetak ke SQL Editor lalu Run. Password yang dibuat `--generate` ditampilkan
   sekali di atas SQL — simpan, dan **jangan** ikut ditempel.

**Data demo** (opsional, untuk mencoba voting): tempel [`server/sql/demo.sql`](server/sql/demo.sql)
ke SQL Editor lalu Run — dibuat satu pemilihan `[DEMO]` yang langsung dibuka 8 jam dengan 3
pasangan calon fiktif bergambar kartun (tanpa suara). Gambarnya ada di `client/public/demo/` dan
dapat dibuat ulang dengan `npm run demo:photos --prefix client`. Sebelum pemilihan sungguhan, hapus dengan
[`server/sql/demo-delete.sql`](server/sql/demo-delete.sql) (ikut menghapus suara & NISN uji coba).

`setup.sql`, `demo.sql`, dan `demo-delete.sql` dibuat otomatis oleh `npm run db:sql`; jangan diedit manual.
Script ini untuk database **baru**. Bila kelak ada file migrasi baru untuk database yang sudah
berisi data, terapkan dengan `npm run db:migrate` lalu `npm run db:grants` — `setup.sql` akan
menolak karena skema sudah ada. Kedua cara saling kompatibel karena `setup.sql` ikut mengisi
`schema_migrations`.

### 6.3 Perintah database

Semua perintah dijalankan di folder `server/`:

```bash
npm run db:setup       # = db:create + db:migrate + db:grants
```

| Perintah | Fungsi |
|---|---|
| `npm run db:create` | Membuat database bila belum ada (di Supabase `postgres` selalu sudah ada) dan role aplikasi `DB_USER` |
| `npm run db:migrate` | Menjalankan file `migrations/*.sql` yang belum diterapkan di skema `DB_SCHEMA` — tiap file dalam satu transaksi, dicatat di `schema_migrations` beserta checksum |
| `npm run db:grants` | Menerapkan hak akses minimum akun aplikasi (dan mencabut akses Data API) lalu menampilkan hak yang berlaku |
| `npm run db:reset -- --yes` | **Menghapus skema `DB_SCHEMA` beserta seluruh isinya** lalu membangun ulang. Ditolak bila `NODE_ENV=production` |
| `npm run db:seed` | Membuat akun admin & pengawas **lokal** (ditolak di production) |
| `npm run db:seed:demo` | Pemilihan `[DEMO]` berstatus terjadwal + 3 paslon fiktif (tanpa suara) |
| `npm run db:seed:demo -- --open` | Sama, tetapi langsung aktif agar bisa mencoba voting |
| `npm run db:sql` | Membuat ulang script SQL Editor di `sql/` (`setup.sql`, `demo.sql`, `demo-delete.sql`) |

**Seed admin yang aman.** Tidak ada password bawaan di kode. `db:seed` memakai
`SEED_ADMIN_PASSWORD`/`SEED_OBSERVER_PASSWORD` dari environment, atau membuat password acak kuat
yang **ditampilkan sekali** di terminal. Untuk production gunakan CLI:

```bash
npm run admin:create -- --email ketua@sekolah.sch.id --name "Ketua Panitia" --role admin
npm run admin:create -- --email guru@sekolah.sch.id --name "Guru Pengawas" --role observer --generate
npm run admin:list
npm run admin:reset-password -- --email ketua@sekolah.sch.id
npm run admin:deactivate -- --email ketua@sekolah.sch.id     # langsung mencabut semua sesinya
npm run admin:sql -- --email ketua@sekolah.sch.id --name "Ketua Panitia" --role admin   # cetak SQL untuk SQL Editor
```

Password admin minimal 12 karakter berisi huruf dan angka; disimpan sebagai hash **Argon2id**
(64 MiB, t=3). Database juga menolak nilai yang bukan hash (`CHECK` pada `admin_users`).

Skema lengkap, diagram relasi, indeks, view, dan grant: [`docs/DATABASE.md`](docs/DATABASE.md).

## 7. Menjalankan aplikasi

**Pengembangan** (dari root proyek):

```bash
npm run dev            # API http://127.0.0.1:4000 + frontend http://localhost:5173
```

Atau terpisah: `npm run dev --prefix server` dan `npm run dev --prefix client`. Vite meneruskan
`/api` dan `/uploads` ke backend sehingga browser melihat satu origin (cookie sesi `SameSite=Strict`
tetap berfungsi tanpa konfigurasi CORS tambahan).

Langkah cepat dari nol: `npm run install:all` → salin `.env` → `npm run db:setup --prefix server`
→ `npm run db:seed --prefix server` → `npm run db:seed:demo --prefix server -- --open` → `npm run dev`
→ buka `http://localhost:5173`, login admin di `/admin/login`.

**Production (satu server)**: `npm run build`, lalu jalankan backend dengan `NODE_ENV=production`,
`SERVE_CLIENT=true`, di belakang reverse proxy HTTPS. Lihat [bagian 13](#13-deployment-yang-aman).

## 8. Ringkasan API

Format sukses `{ "data": ..., "meta"?: ..., "message"?: ... }`; format error seragam
`{ "error": { "code", "message", "details"?, "requestId" } }`. Contoh request/response lengkap ada
di [`docs/API.md`](docs/API.md).

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/health` | publik | Status server & database |
| GET | `/api/elections/current` | publik | Pemilihan paling relevan (aktif → terjadwal → selesai terbaru) |
| GET | `/api/elections/active` | publik | Pemilihan berstatus aktif (404 bila tidak ada) |
| GET | `/api/elections/:id` | publik | Detail pemilihan (draft = 404) |
| GET | `/api/elections/:id/candidates` | publik | Daftar pasangan calon |
| GET | `/api/elections/:id/results` | publik | Hasil — hanya bila selesai **dan** `results_public` |
| POST | `/api/elections/:id/vote` | publik, rate limit | `{ nisn, candidateId }` → `201` / `409 ALREADY_VOTED` / `403` / `422` |
| POST | `/api/auth/login` | publik, rate limit | Login admin (cookie HttpOnly + `csrfToken`) |
| POST | `/api/auth/logout` | sesi + CSRF | Logout |
| GET | `/api/auth/me` | sesi | Memulihkan sesi setelah refresh |
| GET | `/api/admin/dashboard` | `dashboard:view` | Ringkasan + rekap pemilihan fokus |
| GET/POST | `/api/admin/elections` | view / `elections:manage` | Daftar (paginasi) / buat pemilihan |
| GET/PATCH/DELETE | `/api/admin/elections/:id` | view / manage | Detail / ubah data, status, publikasi / hapus (draft & terjadwal) |
| GET/POST | `/api/admin/elections/:id/candidates` | view / `candidates:manage` | Daftar / tambah paslon |
| PATCH/DELETE | `/api/admin/candidates/:id` | `candidates:manage` | Ubah / hapus paslon |
| PUT | `/api/admin/candidates/:id/photo` | `candidates:manage` | Unggah foto (multipart, JPG/PNG/WebP ≤ 2 MB) |
| GET | `/api/admin/elections/:id/results` | `results:view-interim` | Hasil sementara/akhir + integritas + timeline |
| GET | `/api/admin/elections/:id/audit-logs` | `audit:view` | Audit log per pemilihan |
| GET | `/api/admin/audit-logs` | `audit:view` | Seluruh audit log |

Sengaja **tidak ada** endpoint untuk membaca NISN, membaca pilihan per pemilih, atau
mengubah/menghapus suara.

## 9. Mekanisme transaksi voting & pencegahan voting ganda

```
POST /api/elections/:id/vote  { nisn, candidateId }
 1. Validasi body (zod, field asing ditolak): NISN tepat 10 digit + pola sekolah; candidateId UUID
 2. BEGIN ISOLATION LEVEL READ COMMITTED
 3. SELECT … FROM elections WHERE id = $1 FOR SHARE    ← status + jadwal dicek dengan jam DATABASE
      draft → 404 · belum mulai → 403 ELECTION_NOT_STARTED · berakhir → 403 ELECTION_ENDED
 4. SELECT … FROM candidates WHERE id = $1 AND election_id = $2 FOR SHARE ← bukan milik pemilihan → 422
 5. INSERT INTO voter_participation (election_id, nisn)                   ← UNIQUE(election_id, nisn)
      unique_violation (23505) → ROLLBACK → 409 ALREADY_VOTED "NISN ini sudah digunakan untuk memilih!"
 6. INSERT INTO votes (id = UUID v4 acak, election_id, candidate_id)      ← FK komposit menjaga konsistensi
 7. COMMIT → 201 { recorded: true }
    error apa pun di 3–6 → ROLLBACK → 500 VOTE_NOT_RECORDED (pasti belum tersimpan)
    error saat COMMIT    → 500 VOTE_STATUS_UNKNOWN (hasil tidak dapat dipastikan)
```

- **Satu-satunya penjaga anti voting ganda adalah constraint database**, bukan `SELECT` lalu
  `INSERT`. Dua request paralel dengan NISN sama: yang kedua tertahan pada indeks unik sampai
  transaksi pertama selesai, lalu mendapat `unique_violation` setelah yang pertama `COMMIT`.
  Deadlock/serialization failure PostgreSQL dicoba ulang otomatis.
- Kunci `FOR SHARE` pada baris pemilihan membuat panitia yang menutup pemilihan (`FOR UPDATE`)
  menunggu transaksi suara yang sedang berjalan, dan suara berikutnya langsung melihat status baru.
- `READ COMMITTED` membuat transaksi yang sempat menunggu kunci membaca status **terbaru**, bukan
  snapshot lama; kebenaran tidak bergantung pada isolation level karena dijamin `UNIQUE`, FK
  komposit, dan kunci baris.
- Frontend: tombol dinonaktifkan + penjaga sinkron (`useRef`) mencegah klik/submit ganda; request
  hanya dikirim setelah "Ya, Saya Yakin"; notifikasi sukses hanya setelah `201 { recorded: true }`;
  timeout/koneksi putus menampilkan pesan **status belum dapat dipastikan** (tidak mengklaim
  berhasil/gagal) dan mengarahkan siswa mengirim ulang sekali — aman karena suara ganda tetap ditolak.

## 10. Keamanan, akses admin, dan publikasi hasil

Ringkasan (rincian & model ancaman: [`docs/KEAMANAN.md`](docs/KEAMANAN.md)):

- **Input & query**: semua input divalidasi zod (field asing ditolak, karakter kontrol dibuang);
  semua query memakai parameter (`$1`, `$2`, …) sehingga nilai tidak pernah menjadi bagian teks SQL;
  nama kolom dinamis hanya dari allowlist.
- **Autentikasi admin**: Argon2id; pesan gagal login seragam + hash tiruan untuk mencegah enumerasi
  akun; sesi server-side (yang disimpan hanya SHA-256 token); cookie `HttpOnly`, `SameSite=Strict`,
  `Secure` + prefiks `__Host-` di HTTPS; batas idle 30 menit & absolut 8 jam; rotasi sesi saat login;
  akun nonaktif langsung kehilangan akses.
- **CSRF**: synchronizer token per sesi pada header `X-CSRF-Token` untuk semua request yang
  mengubah data, ditambah wajib `Content-Type: application/json` dan cookie `SameSite=Strict`.
- **Otorisasi (RBAC)**: izin eksplisit di `server/src/config/permissions.js`.
  `admin` = semua izin; `observer` = `dashboard:view`, `elections:view`, `results:view-interim`,
  `audit:view` saja. Setiap endpoint admin memeriksa izin, bukan sekadar status login.
- **Header & jaringan**: helmet (CSP ketat saat menyajikan build), CORS allowlist, rate limit login
  (hanya percobaan gagal dihitung), voting, dan API umum; error handler terpusat tanpa stack trace,
  pesan SQL, maupun body request.
- **Hak akses database minimum** (diterapkan `db:grants`): akun aplikasi hanya `INSERT` pada
  `votes` & `voter_participation`, `SELECT` pada view agregat, `SELECT, INSERT` pada `audit_logs`
  (append-only), dan `UPDATE` hanya kolom `last_login_at` pada `admin_users`. Tes otomatis
  membuktikan akun ini **tidak bisa** `SELECT nisn`, `SELECT * FROM votes`, `UPDATE/DELETE votes`,
  mengubah peran admin, maupun mengubah audit log.
- **Supabase**: tabel berada di skema `eosis` (bukan `public`) sehingga tidak terekspos Data API;
  `db:grants` mencabut akses `PUBLIC`/`anon`/`authenticated`/`service_role` (teruji walau ada
  *default privileges* yang memberikannya); koneksi wajib TLS; password akun aplikasi dikirim ke
  server sebagai verifier SCRAM, bukan teks biasa.
- **Audit log**: setiap login/logout/gagal login dan perubahan pemilihan/kandidat/publikasi dicatat
  dalam transaksi yang sama dengan perubahannya. Metadata disanitasi (tanpa password, token, NISN,
  pilihan). Proses voting **tidak pernah** menulis audit log.
- **Publikasi hasil**: publik hanya melihat hasil bila status `completed` **dan** `results_public = true`.
  Hasil sementara (saat pemilihan berjalan) hanya untuk peran dengan izin `results:view-interim`.
  Data contoh (`[DEMO]`) tidak pernah berisi suara — semua angka berasal dari suara sungguhan.
- **Upload foto**: jenis file diperiksa dari *magic bytes* (bukan ekstensi), nama file acak dari
  server, disajikan dengan `X-Content-Type-Options: nosniff` dan CSP `sandbox`.

## 11. Pengujian

### Backend (Vitest + Supertest + PostgreSQL sungguhan)

```bash
cp server/.env.test.example server/.env.test     # isi kredensial PostgreSQL/Supabase tes
npm test --prefix server
```

- Memakai **skema terpisah**; tes menolak berjalan bila `NODE_ENV` ≠ `test` atau `DB_SCHEMA`
  tidak berakhiran `_test` (pengaman terhadap data pengembangan/produksi). Karena itu tes aman
  dijalankan di proyek Supabase yang sama — hanya skema `eosis_test` yang dihapus & dibangun ulang.
- Sebelum tes, skema tes dibangun ulang dari file migrasi; tiap tes mengosongkan tabel.
- Akun aplikasi di `.env.test` sebaiknya role berhak minimum tersendiri (mis. `eosis_test_app`),
  agar tes hak akses database ikut berjalan.
- Terhadap Supabase, tes berjalan lebih lambat (latensi jaringan) dan memakai hingga ±12 koneksi:
  hentikan server dev selama tes bila *Pool Size* proyek kecil. PostgreSQL lokal lebih cepat.

### Frontend (Vitest + Testing Library + jsdom)

```bash
npm test --prefix client
```

### End-to-end (Playwright, terhadap backend + database pengembangan)

```bash
cd client && npx playwright install chromium && cd ..   # sekali saja (mengunduh Chromium)
npm run db:seed:demo --prefix server -- --open          # butuh pemilihan yang sedang dibuka
E2E_ADMIN_EMAIL=admin@eosis.local E2E_ADMIN_PASSWORD=... npm run test:e2e
```

Di PowerShell, set variabel dengan `$env:E2E_ADMIN_EMAIL="..."` sebelum `npm run test:e2e`.
Playwright otomatis menyalakan backend & Vite bila belum berjalan (`client/playwright.config.js`).

Tes E2E membuat suara sungguhan pada pemilihan demo — **jangan** jalankan terhadap database produksi.

### Pemetaan 17 tes wajib

| No | Skenario | Lokasi tes |
|---|---|---|
| 1 | NISN baru dapat memilih saat pemilihan aktif | `server/tests/vote.test.js` `[1]`, `[1b]` |
| 2 | NISN sama ditolak pada pemilihan sama (409) | `vote.test.js` `[2]`, `[2b]` |
| 3 | NISN sama boleh di pemilihan berbeda | `vote.test.js` `[3]` |
| 4 | Request paralel NISN sama → satu suara | `vote.test.js` `[4]` (12 paralel), `[4b]`, penutupan saat voting paralel |
| 5 | Kandidat pemilihan lain ditolak | `vote.test.js` `[5]`, `[5b]` (FK komposit) |
| 6 | draft/scheduled/completed/di luar jadwal menolak | `vote.test.js` `[6]` (6 kasus) |
| 7 | Gagal simpan suara → partisipasi di-rollback | `vote.test.js` `[7]` (trigger DB & injeksi kegagalan) |
| 8 | Gagal simpan partisipasi → tidak ada suara | `vote.test.js` `[8]` |
| 9 | Tanpa autentikasi tidak bisa akses admin | `server/tests/admin-access.test.js` `[9]` (17 endpoint) |
| 10 | Pengguna biasa tidak bisa kelola jadwal/kandidat | `admin-access.test.js` `[10]` |
| 11 | Publik tidak bisa baca NISN / ubah suara | `server/tests/privacy.test.js` `[11]` (API & hak akses DB) |
| 12 | Agregasi sesuai data votes | `server/tests/results.test.js` `[12]` |
| 13 | Hasil publik ditolak bila `results_public=false` | `results.test.js` `[13]` |
| 14 | Grafik saat data kosong & tersedia | `client/src/components/charts/ResultsCharts.test.jsx` `[14]` |
| 15 | SweetAlert2 konfirmasi sebelum request | `client/src/pages/LandingPage.test.jsx` `[15]` (kartu paslon), `client/e2e/voting.spec.js` |
| 16 | Animasi dibersihkan saat unmount / pindah halaman | `client/src/animations.test.jsx` `[16]` |
| 17 | Validasi form, loading, error, responsif | `LandingPage.test.jsx` `[17]` (NISN di dialog, tombol terkunci, error jaringan/server), `LoginPage.test.jsx`, `Navbar.test.jsx`, `client/e2e/responsive.spec.js` |

Pemeriksaan lain: `npm run lint` (ESLint server & client) dan `npm run build`.

## 12. Keterbatasan verifikasi identitas & anonimitas

**Verifikasi identitas.** NISN bukan rahasia — tertera di kartu pelajar, rapor, dan dapat ditebak
polanya. Sistem ini menjamin *satu NISN satu suara*, tetapi **tidak membuktikan** bahwa yang
mengetik NISN adalah pemiliknya. Siapa pun yang mengetahui NISN siswa lain dapat memakai hak
pilih siswa tersebut lebih dulu. Mitigasi yang disarankan **tanpa mendaftarkan seluruh NISN di awal**:

1. **Bilik suara terkontrol**: voting hanya di lab/ruang yang diawasi panitia; pengawas memeriksa
   kartu pelajar sebelum siswa mengetik NISN.
2. **Kode akses sekali pakai**: sekolah membagikan kode acak (mis. 8 karakter) bersama kartu suara
   fisik. Server hanya menyimpan *hash* kode dan menandainya terpakai dalam transaksi yang sama
   dengan partisipasi — kode tidak dikaitkan dengan NISN maupun pilihan.
3. **Kode TPS bergilir**: panitia menampilkan kode yang berganti tiap beberapa menit di ruang
   voting, sehingga voting dari luar ruangan tidak mungkin.
4. **Batasi jaringan**: endpoint voting hanya dapat diakses dari jaringan sekolah (aturan Nginx/firewall).
5. **Rekonsiliasi**: setelah pemilihan, panitia mencocokkan daftar NISN yang memilih (lewat akses
   database terbatas) dengan daftar hadir untuk mendeteksi penyalahgunaan.

**Anonimitas.** Pemisahan tabel `voter_participation` (siapa) dan `votes` (apa) mengurangi
keterkaitan, tetapi **tidak menjamin anonimitas sempurna**:

- Kedua baris ditulis dalam **transaksi yang sama** sehingga membawa ID transaksi (`xmin`) yang
  sama. Pemilik tabel — akun `postgres` / SQL Editor dashboard Supabase — dapat menautkan NISN
  dengan pilihan lewat kolom sistem itu (akun aplikasi tidak bisa). Batasi anggota proyek Supabase
  selama pemilihan, dan setelah pemungutan suara ditutup putuskan tautannya dengan menulis ulang
  baris `votes` (satu perintah SQL, lihat [`docs/KEAMANAN.md`](docs/KEAMANAN.md#batasan-anonimitas-jujur)).
- Hasil sementara yang dipantau **secara langsung** dapat ditebak per suara bila pengamat juga
  melihat siapa yang baru memilih. Jangan tempatkan layar dashboard di dekat bilik, batasi peran
  yang memiliki izin `results:view-interim`, atau cabut izin itu selama pemungutan suara.
- Pada pemilihan dengan sangat sedikit pemilih (mis. 1–2 suara dalam satu hari), pembulatan waktu
  pun tidak cukup menyamarkan.

Langkah yang sudah diterapkan: id suara UUID v4 acak (tidak berurutan), `votes.created_on`
bertipe `date` (hanya tanggal UTC, tanpa jam), log aplikasi tidak pernah memuat body request dan
menyamarkan deret 10 digit, akun DB aplikasi tidak bisa membaca baris suara maupun NISN, tidak ada
endpoint pencarian pilihan berdasarkan NISN. Kebijakan retensi yang disarankan ada di
[`docs/KEAMANAN.md`](docs/KEAMANAN.md#kebijakan-retensi-data).

## 13. Deployment yang aman

1. **HTTPS wajib.** Pasang di belakang Nginx/Caddy dengan sertifikat TLS (mis. Let's Encrypt).
   Contoh konfigurasi: [`docs/deploy/nginx.conf.example`](docs/deploy/nginx.conf.example).
2. `server/.env` production: `NODE_ENV=production`, `COOKIE_SECURE=true`, `TRUST_PROXY=1`,
   `CORS_ORIGINS=https://osis.sekolah.sch.id`, `HOST=127.0.0.1` (hanya diakses lewat reverse proxy).
3. **Database**: jalankan `npm run db:setup` dengan akun migrasi (`postgres` Supabase) sekali, lalu
   server memakai akun `eosis_app` berhak minimum lewat TLS (`DB_SSL=require`/`verify-full`). Di
   Supabase: aktifkan *Network Restrictions* agar hanya IP server aplikasi yang boleh terhubung ke
   database, dan batasi anggota proyek. PostgreSQL sendiri: dengarkan hanya `127.0.0.1`/jaringan
   privat. Simpan kredensial migrasi di luar server aplikasi bila memungkinkan.
4. **Build & jalankan**: `npm run build`; layani `client/dist` lewat Nginx (atau `SERVE_CLIENT=true`),
   jalankan `node src/server.js` di bawah process manager (systemd/PM2) dengan restart otomatis.
5. **Akun admin**: buat lewat `npm run admin:create`; jangan memakai `db:seed` di production.
   Nonaktifkan akun yang tidak dipakai (`admin:deactivate`).
6. **Rate limit**: sesuaikan `VOTE_RATE_LIMIT_MAX` dengan jumlah siswa per lab (satu IP NAT).
   Untuk lebih dari satu instance server, gunakan store rate limit bersama (Redis).
7. **Operasional**: backup terenkripsi (Supabase menyediakan backup harian), uji pemulihan; pantau
   `/api/health`; hapus pemilihan `[DEMO]` sebelum pemilihan sungguhan; setelah pemilihan ditutup,
   putuskan tautan `xmin` dan hapus NISN sesuai [kebijakan retensi](docs/KEAMANAN.md#kebijakan-retensi-data);
   jalankan `npm audit` dan perbarui dependensi secara berkala. Proyek Supabase gratis dapat dijeda
   otomatis bila lama tidak aktif — pastikan proyek aktif sebelum hari pemilihan.

## 14. Pemecahan masalah

| Gejala | Solusi |
|---|---|
| `ECONNREFUSED` saat `db:*` | PostgreSQL belum berjalan / `DB_HOST`, `DB_PORT` salah |
| `ENOTFOUND`/`ENETUNREACH` ke `db.<ref>.supabase.co` | Koneksi langsung Supabase hanya IPv6 → pakai host **Session pooler** |
| `Tenant or user not found` | User pooler Supabase harus berformat `<role>.<project-ref>` (mis. `postgres.abcd…`, `eosis_app.abcd…`) |
| `password authentication failed` | Periksa `DB_MIGRATION_PASSWORD` (= database password proyek Supabase) atau `DB_PASSWORD`; `npm run db:setup` menyinkronkan password `eosis_app` |
| `The server does not support SSL connections` | PostgreSQL lokal tanpa SSL → `DB_SSL=disable` |
| `self-signed certificate in certificate chain` | `DB_SSL=verify-full` butuh `DB_SSL_CA` berisi sertifikat CA Supabase; atau pakai `DB_SSL=require` |
| `Tabel E-OSIS tidak ditemukan di skema ...` saat start | Belum `npm run db:setup`, atau `DB_SCHEMA` server berbeda dengan saat migrasi |
| `permission denied for table ...` di server | Jalankan ulang `npm run db:grants` setelah migrasi baru |
| `Max client connections reached` | Turunkan `DB_CONNECTION_LIMIT` di bawah *Pool Size* Supabase; jangan jalankan tes dan server dev bersamaan |
| `Role '...' sudah ada tetapi dibuat oleh akun lain` | PostgreSQL 16+ hanya mengizinkan pembuat role mengubahnya: samakan `DB_PASSWORD` dengan password role itu, atau pakai nama role lain |
| `Tes dibatalkan: DB_SCHEMA ... harus berakhiran "_test"` | Pengaman tes: gunakan skema khusus tes di `server/.env.test` |
| npm: `Cannot read properties of null (reading 'edgesOut')` | Bug npm saat Vite 8 + Vitest 4; proyek mengunci Vite 7 lewat `overrides` di `package.json`. Jalankan ulang `npm install` |
| Login berhasil tetapi langsung keluar di production | Pastikan diakses lewat HTTPS dan `COOKIE_SECURE=true` (cookie `__Host-` wajib Secure) |
| Siswa satu lab terkena `429` | Naikkan `VOTE_RATE_LIMIT_MAX` |
