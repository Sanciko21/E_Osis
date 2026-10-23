# Load test E-OSIS (Locust)

Mengukur berapa banyak siswa yang dapat dilayani server secara bersamaan: jumlah permintaan per
detik, waktu respons (median/p95/p99), dan apakah ada permintaan gagal — sambil memastikan aturan
**satu NISN satu suara** tetap terjaga saat server ramai.

## Apa yang disimulasikan

| Pengguna | Bobot bawaan | Yang dilakukan |
|---|---|---|
| **Siswa** | 10 | Buka beranda (`/api/elections/current` + kartu paslon) → membaca 2–6 detik → memilih dengan NISN uji acak. Setiap putaran = satu siswa baru. 10% siswa mengirim ulang NISN yang sama dan **wajib ditolak 409** |
| **Pengunjung** | 3 | Melihat beranda, halaman hasil (403 = hasil belum dipublikasikan, dianggap benar), dan `/api/health` |
| **PanitiaLiveReport** | 1 layar | Login admin lalu memuat dashboard setiap 5 detik, seperti panel Live Report. Hanya aktif bila kredensial admin diisi |

## Pengaman (baca dulu)

- Suara **hanya** dikirim ke pemilihan berjudul `[DEMO] ...` yang sedang dibuka. Bila pemilihan aktif
  bukan demo, tes otomatis berjalan **tanpa voting** (hanya membaca).
- NISN uji berawalan `98` (suara dummy `demo-votes.sql` memakai `99`). Semua suara uji ikut terhapus
  oleh `server/sql/demo-delete.sql`.
- **Jangan** menjalankan load test pada pemilihan sungguhan atau saat siswa sedang memilih.

## Persiapan (sekali)

Butuh Python 3.10+. Dari folder proyek:

```powershell
cd loadtest
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

(macOS/Linux: `.venv/bin/python -m pip install -r requirements.txt`, lalu pakai `.venv/bin/locust`.)

## 1. Siapkan server yang akan diuji

**Disarankan: server uji lokal** dengan pemilihan demo (`server/sql/demo.sql`, boleh ditambah
`demo-votes.sql`). Server membatasi permintaan per IP, sedangkan semua pengguna Locust berasal dari
satu komputer — jadi **naikkan batas khusus saat uji** agar yang terukur adalah kapasitas server,
bukan rate limiter. Di `server/.env` (kembalikan setelah selesai!):

```env
VOTE_RATE_LIMIT_MAX=100000
API_RATE_LIMIT_MAX=1000000
LOG_REQUESTS=false
```

lalu jalankan `npm run dev:server` (atau `node src/server.js` di folder `server`).

## 2. Jalankan Locust

**Dengan tampilan web** (grafik langsung, mudah diatur):

```powershell
cd loadtest
.venv\Scripts\locust
```

Buka <http://localhost:8089>, isi jumlah pengguna (mis. 300) dan *ramp up* (mis. 30/detik), lalu
**Start**. Host bawaan `http://127.0.0.1:4000` (lihat `locust.conf`).

**Tanpa tampilan (headless) + laporan HTML/CSV:**

```powershell
.venv\Scripts\locust --headless -u 300 -r 30 -t 5m --html reports\hasil.html --csv reports\hasil
```

Di akhir, Locust mencetak **RINGKASAN LOAD TEST E-OSIS** dan keluar dengan kode 1 bila batas lulus
terlampaui (bawaan: gagal > 1%, p95 > 1500 ms, atau p95 voting > 2000 ms).

**Ikut mensimulasikan layar Live Report** (PowerShell):

```powershell
$env:LOADTEST_ADMIN_EMAIL = "admin@sekolah.sch.id"
$env:LOADTEST_ADMIN_PASSWORD = "password-admin-uji"
.venv\Scripts\locust --headless -u 300 -r 30 -t 5m
```

**Simulasi hari pemilihan** (bel masuk → puncak jam istirahat → mereda):

```powershell
$env:LOADTEST_SHAPE = "hari-pemilihan"
$env:LOADTEST_PEAK_USERS = "500"     # siswa serentak pada puncak
$env:LOADTEST_SHAPE_MINUTES = "14"   # lama total (bawaan 14 menit)
.venv\Scripts\locust --headless --html reports\hari-pemilihan.html
```

Hapus variabel setelah selesai: `Remove-Item Env:LOADTEST_*`.

## Variabel environment

| Variabel | Bawaan | Arti |
|---|---|---|
| `LOADTEST_VOTES` | `1` | `0` = hanya membaca (tanpa voting) |
| `LOADTEST_THINK_MIN` / `MAX` | `2` / `6` | Lama siswa membaca kartu paslon sebelum memilih (detik). Perkecil untuk uji stres |
| `LOADTEST_DUPLICATE_RATIO` | `0.1` | Porsi siswa yang mengirim ulang NISN yang sama (harus ditolak) |
| `LOADTEST_WEIGHT_SISWA` / `PENGUNJUNG` | `10` / `3` | Perbandingan jenis pengguna |
| `LOADTEST_ADMIN_EMAIL` / `PASSWORD` | – | Mengaktifkan simulasi layar Live Report |
| `LOADTEST_LIVE_SCREENS` | `1` | Jumlah layar Live Report |
| `LOADTEST_SHAPE` | – | `hari-pemilihan` untuk skenario bertahap |
| `LOADTEST_PEAK_USERS` / `SHAPE_MINUTES` | `300` / `14` | Puncak & lama skenario hari pemilihan |
| `LOADTEST_MAX_FAIL_RATIO` | `0.01` | Batas lulus rasio gagal |
| `LOADTEST_MAX_P95_MS` / `MAX_VOTE_P95_MS` | `1500` / `2000` | Batas lulus waktu respons p95 |
| `LOADTEST_ALLOW_NON_DEMO` | `0` | `1` = izinkan voting ke pemilihan non-demo (**hanya** database uji) |

## Membaca hasil

- **req/detik (RPS)** — banyaknya permintaan yang dilayani tiap detik.
- **Median / p95 / p99** — 50% / 95% / 99% permintaan selesai dalam waktu tersebut. Untuk siswa,
  p95 di bawah ±1 detik terasa lancar.
- **Gagal (failures)** — `429` = dibatasi rate limit (naikkan batas saat uji); `Tidak ada respons` =
  koneksi putus/timeout; `HTTP 5xx` = server/database bermasalah.
- **POST vote ulang NISN sama (harus 409)** — harus 0 gagal. Bila muncul "SUARA GANDA DITERIMA",
  integritas bermasalah (seharusnya tidak pernah terjadi: dijaga UNIQUE constraint database).
- Cara mencari batas server: naikkan pengguna bertahap (100 → 300 → 500 → 800 …) dan catat kapan
  p95 mulai melonjak atau kegagalan muncul. Angka sebelum titik itu adalah kapasitas aman.
- Peringatan **"CPU usage above 90%"** artinya komputer penguji yang kewalahan, bukan server. Di
  Windows jalankan beberapa proses: satu terminal `.venv\Scripts\locust --master`, lalu 2–4 terminal
  lain `.venv\Scripts\locust --worker`. Lebih akurat lagi bila Locust dijalankan dari komputer lain.

### Contoh hasil (laptop pengembang, server + PostgreSQL + Locust di satu mesin)

| Skenario | Pengguna serentak | req/detik | Median | p95 | Suara masuk | Gagal |
|---|---|---|---|---|---|---|
| Realistis (membaca 2–6 dtk) | 300 | 132 | 7 ms | 47 ms | 2.052 / menit | 0 |
| Stres (membaca 0,5–1,5 dtk) | 800 | 461 | 290 ms | 640 ms | 5.891 / 45 dtk | 0,02% |
| Stres (membaca 0,5–1,5 dtk) | 1.500 | 437 (jenuh) | 780 ms | 2.100 ms | 7.999 / menit | 0,03% |

Setelah ±17 ribu suara uji: jumlah suara = jumlah catatan partisipasi, 0 NISN ganda. Kegagalan kecil
pada uji stres berupa *connection reset* koneksi keep-alive yang menganggur > 5 detik (batas bawaan
Node.js), bukan error server. Angka di komputer/server Anda akan berbeda — jalankan sendiri.

## Menguji server deploy (Vercel + Supabase)

Bisa (`-H https://<nama-proyek>.vercel.app`), tetapi perhatikan:

- Pakai **pemilihan `[DEMO]`** dan lakukan di luar jam pemilihan.
- Supabase Free: Edge Functions 500 ribu pemanggilan/bulan dan 2 detik CPU per request; uji 5 menit
  dengan 300 pengguna ≈ 40 ribu pemanggilan. Mulai dari beban kecil.
- Semua pengguna Locust memakai IP Anda, sehingga rate limit per IP (Edge: 600 suara & 6000
  permintaan per menit per worker) cepat tercapai → banyak `429`. Itu tanda pengaman bekerja, bukan
  batas kapasitas. Untuk angka kapasitas, uji server lokal/staging dengan batas dinaikkan.

## Setelah selesai

1. Jalankan `server/sql/demo-delete.sql` (atau `npm run db:seed:demo` ulang) untuk menghapus suara uji.
2. Kembalikan `VOTE_RATE_LIMIT_MAX` / `API_RATE_LIMIT_MAX` di `server/.env` ke nilai semula.
