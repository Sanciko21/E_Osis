# Keamanan & Privasi E-OSIS

Dokumen ini melengkapi README bagian 10 dan 12: model ancaman, kontrol yang diterapkan beserta
lokasi kodenya, batasan yang **tidak** bisa diselesaikan oleh perangkat lunak, dan kebijakan
operasional yang disarankan.

## Model ancaman & kontrol

| Ancaman | Kontrol | Lokasi |
|---|---|---|
| Voting ganda (termasuk request paralel) | `UNIQUE(election_id, nisn)` + transaksi; duplikat → `409` | `migrations/001`, `services/vote.service.js` |
| Suara tanpa catatan partisipasi / sebaliknya | Satu transaksi, `ROLLBACK` pada error apa pun | `config/database.js#withTransaction` |
| Memilih kandidat pemilihan lain | Validasi `FOR SHARE` + FK komposit | `vote.service.js`, `migrations/001` |
| Voting di luar jadwal / setelah ditutup | Status & jadwal dicek dengan jam database; kunci baris pemilihan | `repositories/election.repository.js#findForVoting` |
| Klien memalsukan data (status, hasil, jumlah suara) | Skema zod *strict*; hanya `nisn` & `candidateId` diterima | `validators/vote.validators.js` |
| SQL injection | Query berparameter (`$1`, `$2`, …) — nilai tidak pernah disisipkan ke teks SQL; nama kolom dari allowlist; akun DB minimum | `config/database.js`, `repositories/*` |
| Pembacaan/perubahan suara lewat aplikasi yang dibobol | Akun aplikasi hanya `INSERT` pada tabel suara; rekap via VIEW | `scripts/lib/db-admin.js#APP_GRANTS` |
| Akses langsung lewat Data API Supabase (PostgREST) | Tabel di skema `eosis` (bukan `public`, tidak dibuka Data API); `db:grants` mencabut semua akses `PUBLIC`, `anon`, `authenticated`, `service_role` dari skema | `scripts/lib/db-admin.js#applyAppGrants` |
| Password akun DB tercatat di log server | Password akun aplikasi dikirim sebagai verifier SCRAM-SHA-256 hasil hitungan klien | `scripts/lib/db-admin.js#scramSha256Verifier` |
| Penyadapan koneksi ke database jarak jauh | TLS wajib (`DB_SSL=require` otomatis untuk host non-lokal); `verify-full` + `DB_SSL_CA` untuk verifikasi sertifikat | `config/database.js#sslOptions` |
| Pencurian sesi admin (XSS) | Cookie `HttpOnly`; React meng-escape output; SweetAlert2 `titleText`/DOM node; CSP ketat saat menyajikan build | `middleware/auth.js`, `utils/alerts.js`, `app.js` |
| CSRF | Token per sesi (header `X-CSRF-Token`), `SameSite=Strict`, wajib JSON | `middleware/auth.js#requireCsrf`, `middleware/validate.js` |
| Tebak password / enumerasi akun | Argon2id, pesan seragam, hash tiruan, rate limit percobaan gagal | `services/auth.service.js`, `middleware/rateLimiters.js` |
| Sesi bocor/terlalu lama | Token 256-bit, disimpan sebagai SHA-256, idle & absolute timeout, rotasi saat login, akun nonaktif langsung ditolak | `repositories/session.repository.js` |
| Eskalasi peran | RBAC berbasis izin eksplisit; DB menolak update kolom `role` oleh akun aplikasi | `config/permissions.js`, grant kolom |
| Unggah file berbahaya | Cek *magic bytes*, nama file acak, `nosniff`, CSP `sandbox`, batas ukuran | `services/upload.service.js`, `app.js` |
| Kebocoran detail internal | Error handler terpusat; log tanpa body; deret 10 digit disamarkan | `middleware/errorHandler.js`, `utils/logger.js` |
| Manipulasi audit log | Akun aplikasi hanya `SELECT, INSERT` pada `audit_logs` | grant |
| Banjir request | Rate limit login/voting/API, batas body 64 KB | `middleware/rateLimiters.js`, `app.js` |

## Data yang tidak boleh tercatat

- Audit log: **tanpa** password, token, hash, cookie, NISN, maupun pilihan (`utils/sanitize.js`
  membuang kunci sensitif dan menyamarkan nilai berpola NISN). Voting tidak menulis audit log.
- Log aplikasi: hanya method, path, status, durasi, request id — **tanpa body, query string,
  maupun SQL**.
- Respons API: tidak ada endpoint yang mengembalikan NISN atau pilihan per pemilih (diuji otomatis
  untuk seluruh endpoint publik dan admin).

## Batasan anonimitas (jujur)

Pemisahan tabel bukan jaminan anonimitas sempurna:

1. **Transaksi yang sama (`xmin`).** `voter_participation` dan `votes` ditulis dalam satu transaksi
   agar atomik. Di PostgreSQL setiap baris menyimpan ID transaksi pembuatnya pada kolom sistem
   `xmin`, sehingga **siapa pun yang dapat membaca kedua tabel** — pemilik tabel, yaitu akun
   `postgres` / SQL Editor dan Table Editor dashboard Supabase — dapat menautkan NISN dengan
   pilihannya lewat satu query (`... JOIN votes v ON v.xmin = p.xmin`). Akun aplikasi **tidak** bisa
   (tidak punya `SELECT` pada kedua tabel; diuji otomatis). WAL dan backup/PITR Supabase juga
   memuat isi transaksi yang sama.
2. **Korelasi waktu langsung.** Hasil sementara yang dipantau real-time sambil mengamati bilik dapat
   mengungkap pilihan siswa yang baru saja memilih.
3. **Jumlah pemilih sangat kecil.** Pembulatan waktu tidak menyamarkan bila hanya ada 1–2 suara
   pada satu hari.

Mitigasi operasional:

- **Batasi akses database.** Anggota proyek Supabase (dan siapa pun yang memegang password
  `postgres`/connection string akun migrasi) setara dengan pemilik tabel. Selama pemilihan, batasi
  hanya untuk satu-dua pengelola teknis yang ditunjuk; panitia lain cukup memakai dashboard E-OSIS.
- **Putuskan tautan `xmin` setelah pemungutan suara ditutup.** Tulis ulang seluruh baris suara
  pemilihan itu dalam satu transaksi sehingga semuanya memperoleh `xmin` yang sama. Jalankan
  dengan akun migrasi (mis. SQL Editor Supabase), lalu catat di berita acara:

  ```sql
  UPDATE eosis.votes SET id = id WHERE election_id = '<id-pemilihan>';
  ```

  Opsional, jalankan terpisah sesudahnya: `VACUUM eosis.votes;` untuk segera membuang versi baris
  lama (bila tidak, autovacuum akan membuangnya). Hasil rekap tidak berubah.
- Jangan mengaktifkan pencatatan semua statement (`log_statement = 'all'`) selama pemilihan, dan
  batasi retensi backup/PITR sesuai kebijakan sekolah.
- Jangan letakkan layar dashboard di dekat bilik; pertimbangkan mencabut izin
  `results:view-interim` dari peran tertentu selama pemungutan suara (`config/permissions.js`).

## Kebijakan retensi data

Disarankan untuk dituangkan dalam berita acara panitia:

| Data | Retensi | Tindakan |
|---|---|---|
| `votes` (agregat pilihan) | Selama arsip hasil diperlukan | Simpan; tidak mengandung identitas |
| `voter_participation` (NISN) | Sampai masa sanggah hasil berakhir (mis. 7 hari) | Hapus dengan akun migrasi: `DELETE FROM eosis.voter_participation WHERE election_id = '<id>';` lalu catat di berita acara. Setelah ini pemeriksaan integritas dashboard akan menunjukkan selisih — itu wajar |
| `admin_sessions` | Otomatis | Sesi kedaluwarsa dibersihkan berkala oleh server |
| `audit_logs` | Minimal 1 tahun ajaran | Arsipkan lalu hapus dengan akun migrasi bila perlu |
| Backup/PITR periode pemilihan | Sesingkat mungkin | Ikuti retensi backup Supabase/server; backup mandiri disimpan terenkripsi lalu dihapus setelah hasil final |
| Foto kandidat (`server/uploads`) | Selama data kandidat ada | Terhapus otomatis saat kandidat/pemilihan draft dihapus |

## Opsi verifikasi identitas tambahan

NISN saja tidak membuktikan identitas pemiliknya. Opsi yang **tidak** mengharuskan pendaftaran
seluruh NISN di awal (lihat juga README bagian 12):

1. **Kode akses sekali pakai** dibagikan bersama surat undangan/kartu suara fisik. Desain yang
   menjaga anonimitas: tabel `access_codes(id, election_id, code_hash, used_at)` tanpa kolom NISN;
   endpoint voting menerima `accessCode`, lalu dalam transaksi yang sama menjalankan
   `UPDATE access_codes SET used_at = now() WHERE election_id = $1 AND code_hash = $2 AND used_at IS NULL`
   dan menolak bila `rowCount = 0`.
2. **Kode TPS bergilir** yang ditampilkan panitia di ruang voting (berganti tiap beberapa menit).
3. **Pemeriksaan kartu pelajar** oleh pengawas sebelum siswa mengetik NISN di bilik terkontrol.
4. **Pembatasan jaringan**: endpoint voting hanya dari IP jaringan sekolah (Nginx `allow/deny`).

## Daftar periksa sebelum hari pemilihan

- [ ] HTTPS aktif, `COOKIE_SECURE=true`, `NODE_ENV=production`, `CORS_ORIGINS` tepat.
- [ ] Server memakai akun `eosis_app` (cek `npm run db:grants` → hanya hak minimum), koneksi
      memakai SSL (`DB_SSL=require`/`verify-full`) dan Session pooler/koneksi langsung (bukan port 6543).
- [ ] Skema `eosis` **tidak** ditambahkan ke *Exposed schemas* di pengaturan Data API Supabase.
- [ ] Akun admin dibuat lewat `admin:create`; akun tidak terpakai dinonaktifkan.
- [ ] Data `[DEMO]` dihapus; jumlah siswa berhak pilih diisi bila ingin persentase partisipasi.
- [ ] `VOTE_RATE_LIMIT_MAX` disesuaikan dengan jumlah perangkat per lab.
- [ ] Anggota proyek Supabase dibatasi; `log_statement` tidak `all`; backup diuji.
- [ ] Prosedur penutupan disepakati: tulis ulang `votes` (putus tautan `xmin`) setelah ditutup,
      hapus NISN setelah masa sanggah.
- [ ] Uji coba singkat dengan pemilihan draf terpisah sebelum pemilihan sungguhan dibuka.
