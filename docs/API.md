# Referensi API E-OSIS

Base URL: `/api` (saat pengembangan diteruskan Vite ke `http://127.0.0.1:4000`).

## Konvensi

- Request & response berformat JSON (`Content-Type: application/json`). Request `POST/PATCH/PUT`
  dengan body non-JSON ditolak `415` (kecuali unggah foto: `multipart/form-data`).
- Waktu dikirim & diterima dalam **ISO-8601 dengan zona waktu** (mis. `2026-10-20T00:30:00.000Z`
  atau `2026-10-20T07:30:00+07:00`). Database menyimpan UTC.
- ID berupa UUID. ID yang tidak valid pada path diperlakukan sebagai `404`.
- Body dengan field yang tidak dikenal ditolak `400` (skema *strict*).
- Semua respons memakai `Cache-Control: no-store` dan header `X-Request-Id`.

**Sukses**

```json
{ "data": { }, "meta": { }, "message": "opsional" }
```

**Error (seragam)**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data yang dikirim tidak valid.",
    "details": [{ "field": "nisn", "message": "NISN harus terdiri dari 10 digit." }],
    "requestId": "2f09f763-35db-4e5e-b095-77d2c9e5ec04"
  }
}
```

Stack trace, pesan SQL, dan detail internal **tidak pernah** dikirim ke klien; `requestId` dipakai
untuk menelusuri log server.

### Kode error

| HTTP | `code` | Arti |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body/query tidak valid (`details` per field) |
| 400 | `INVALID_JSON` | JSON rusak |
| 400 | `INVALID_IMAGE` | File foto bukan JPG/PNG/WebP asli |
| 401 | `UNAUTHENTICATED` | Belum login |
| 401 | `SESSION_EXPIRED` | Cookie sesi tidak valid / kedaluwarsa / akun dinonaktifkan |
| 401 | `INVALID_CREDENTIALS` | Email atau kata sandi salah (pesan seragam) |
| 403 | `FORBIDDEN` | Peran tidak memiliki izin |
| 403 | `CSRF_INVALID` | Header `X-CSRF-Token` hilang/salah |
| 403 | `ELECTION_NOT_STARTED` | Pemungutan suara belum dibuka / belum masuk jadwal |
| 403 | `ELECTION_ENDED` | Pemungutan suara sudah berakhir |
| 403 | `RESULTS_NOT_PUBLIC` | Hasil belum dipublikasikan |
| 404 | `NOT_FOUND`, `ELECTION_NOT_FOUND`, `NO_ACTIVE_ELECTION`, `ROUTE_NOT_FOUND` | Tidak ditemukan |
| 409 | `ALREADY_VOTED` | **"NISN ini sudah digunakan untuk memilih!"** |
| 409 | `INVALID_STATUS_TRANSITION` | Perubahan status tidak diizinkan |
| 409 | `ANOTHER_ELECTION_ACTIVE` | Masih ada pemilihan aktif lain (dijaga database) |
| 409 | `ELECTION_LOCKED` | Data dikunci karena pemilihan sudah dibuka/selesai |
| 409 | `SCHEDULE_INVALID` | Jadwal tidak valid untuk aksi tersebut |
| 409 | `NO_CANDIDATES` | Belum ada pasangan calon |
| 409 | `CANDIDATE_NUMBER_TAKEN` | Nomor urut sudah dipakai |
| 413 | `PAYLOAD_TOO_LARGE` | Body / foto terlalu besar |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Body bukan JSON |
| 422 | `INVALID_CANDIDATE` | Kandidat tidak terdaftar pada pemilihan tersebut |
| 429 | `RATE_LIMITED` | Terlalu banyak permintaan |
| 500 | `VOTE_NOT_RECORDED` | Transaksi suara di-ROLLBACK — **pasti belum tersimpan** |
| 500 | `VOTE_STATUS_UNKNOWN` | COMMIT gagal di tengah jalan — status **tidak dapat dipastikan** |
| 500 | `INTERNAL_ERROR` | Kesalahan server lain |

---

## Endpoint publik

### `GET /api/health`

```json
{ "status": "ok", "database": "ok" }
```
`503 { "status": "degraded", "database": "unavailable" }` bila database tidak terjangkau.

### `GET /api/elections/current`

Pemilihan publik paling relevan: aktif → terjadwal terdekat → selesai terbaru. Draft tidak pernah
tampil. `data` bernilai `null` bila tidak ada.

```json
{
  "data": {
    "id": "d66cbb92-29ae-4feb-9e7a-61524b4d362c",
    "title": "[DEMO] Pemilihan Ketua & Wakil Ketua OSIS 2026/2027",
    "description": "Data demonstrasi untuk pengembangan lokal.",
    "startAt": "2026-10-09T07:33:54.000Z",
    "endAt": "2026-10-09T15:33:54.000Z",
    "status": "active",
    "phase": "open",
    "votingOpen": true,
    "resultsAvailable": false
  },
  "meta": { "serverTime": "2026-10-09T08:03:29.087Z" }
}
```

`status` (disimpan): `draft | scheduled | active | completed`.
`phase` (dihitung server dari status + jadwal): `draft | upcoming | open | closed | completed`.
Voting hanya diterima saat `phase = open` (status `active` **dan** `startAt ≤ sekarang < endAt`).
`meta.serverTime` dipakai frontend untuk mengoreksi hitung mundur.

### `GET /api/elections/active`

Seperti di atas tetapi hanya pemilihan berstatus `active`; `404 NO_ACTIVE_ELECTION` bila tidak ada.

### `GET /api/elections/:id`

Detail pemilihan publik. Draft → `404 ELECTION_NOT_FOUND`.

### `GET /api/elections/:id/candidates`

```json
{
  "data": [
    {
      "id": "e8cbc146-3c8d-43d1-9d30-d2fce0b2b0bf",
      "electionId": "d66cbb92-29ae-4feb-9e7a-61524b4d362c",
      "candidateNumber": 1,
      "chairpersonName": "Raka Aditya Pratama",
      "viceChairpersonName": "Nabila Putri Lestari",
      "photoUrl": null,
      "vision": "Mewujudkan OSIS yang aktif, kreatif, dan peduli sebagai rumah bagi seluruh siswa.",
      "mission": "Mengadakan forum aspirasi siswa setiap bulan.\nMenghidupkan kembali kegiatan ekstrakurikuler."
    }
  ]
}
```

`mission` berisi satu misi per baris.

### `GET /api/elections/:id/results`

Hanya bila pemilihan `completed` **dan** `results_public = true`; selain itu
`403 RESULTS_NOT_PUBLIC` (draft: `404`). Tidak memuat NISN, timeline, maupun data integritas.

```json
{
  "data": {
    "election": { "id": "…", "title": "…", "status": "completed", "phase": "completed", "resultsAvailable": true },
    "isFinal": true,
    "totals": { "validVotes": 4, "uniqueVoters": 4, "eligibleVoters": 40, "turnoutPercentage": 10 },
    "candidates": [
      { "id": "…", "candidateNumber": 1, "chairpersonName": "…", "viceChairpersonName": "…",
        "photoUrl": null, "votes": 1, "percentage": 25, "isLeading": false },
      { "id": "…", "candidateNumber": 2, "chairpersonName": "…", "viceChairpersonName": "…",
        "photoUrl": null, "votes": 3, "percentage": 75, "isLeading": true }
    ],
    "isTie": false,
    "generatedAt": "2026-10-20T06:00:00.000Z"
  }
}
```

- `percentage` = suara kandidat ÷ total suara sah × 100 (2 desimal).
- `turnoutPercentage` = pemilih unik ÷ `eligibleVoters` × 100, **`null` bila sekolah belum mengisi
  jumlah siswa berhak pilih** (sistem tidak menebak jumlah siswa).

### `POST /api/elections/:id/vote`

Rate limit per IP (`VOTE_RATE_LIMIT_*`).

```json
{ "nisn": "0055443322", "candidateId": "e8cbc146-3c8d-43d1-9d30-d2fce0b2b0bf" }
```

| Respons | Contoh |
|---|---|
| `201` | `{ "data": { "recorded": true }, "message": "Terima kasih! Suara Anda berhasil disimpan." }` |
| `409` | `{ "error": { "code": "ALREADY_VOTED", "message": "NISN ini sudah digunakan untuk memilih!", "requestId": "…" } }` |
| `400` | NISN bukan 10 digit / bukan string / tidak sesuai pola sekolah, field asing |
| `403` | `ELECTION_NOT_STARTED`, `ELECTION_ENDED` |
| `404` | Pemilihan tidak ada atau masih draft |
| `422` | `INVALID_CANDIDATE` |
| `500` | `VOTE_NOT_RECORDED` (pasti belum tersimpan) / `VOTE_STATUS_UNKNOWN` |

Respons sukses sengaja tidak memuat NISN maupun kandidat yang dipilih. Spasi pada NISN
dinormalisasi (`"0055 443 322"` = `"0055443322"`), dan NISN berupa angka JSON ditolak agar nol di
depan tidak hilang.

---

## Autentikasi admin

### `POST /api/auth/login`

Rate limit: hanya percobaan **gagal** yang dihitung (`LOGIN_RATE_LIMIT_*`).

```json
{ "email": "admin@eosis.local", "password": "••••••••••••" }
```

```json
{
  "data": {
    "user": {
      "id": "3f42190d-cac0-4c9e-ac0d-f9c2c5dca9a0",
      "name": "Admin Panitia (Lokal)",
      "email": "admin@eosis.local",
      "role": "admin",
      "permissions": ["dashboard:view", "elections:view", "elections:manage", "elections:change-status",
                      "results:view-interim", "results:publish", "candidates:manage", "audit:view"]
    },
    "csrfToken": "ihvmIZ-Msyk3nyffTBR50Yoa7gQfnuwIE1xTI1Q43o4"
  },
  "message": "Login berhasil."
}
```

Header respons: `Set-Cookie: eosis_sid=<token>; Path=/; HttpOnly; SameSite=Strict` (di HTTPS:
`__Host-eosis_sid=…; Secure`). Token sesi **tidak pernah** ada di body. Simpan `csrfToken` di memori
dan kirim sebagai header `X-CSRF-Token` pada setiap request `POST/PATCH/PUT/DELETE` admin.
Gagal → `401 INVALID_CREDENTIALS` dengan pesan sama untuk email tidak terdaftar, password salah,
maupun akun nonaktif.

### `GET /api/auth/me`

Memulihkan sesi setelah refresh: `{ "data": { "user": { … }, "csrfToken": "…" } }`; tanpa sesi `401`.

### `POST /api/auth/logout`

Wajib `X-CSRF-Token` bila sesi masih valid. `204`, cookie dihapus, sesi dihapus di server.

---

## Endpoint admin

Semua endpoint di bawah `/api/admin` wajib sesi valid (`401`) dan izin peran (`403`); method yang
mengubah data wajib `X-CSRF-Token` (`403 CSRF_INVALID`).

| Izin | admin | observer |
|---|---|---|
| `dashboard:view`, `elections:view`, `results:view-interim`, `audit:view` | ✓ | ✓ |
| `elections:manage`, `elections:change-status`, `results:publish`, `candidates:manage` | ✓ | — |

### `GET /api/admin/dashboard?electionId=<uuid>`

```json
{
  "data": {
    "electionCounts": { "draft": 0, "scheduled": 0, "active": 1, "completed": 0 },
    "focusElectionId": "d66cbb92-…",
    "results": { "…": "sama dengan GET /api/admin/elections/:id/results" }
  },
  "meta": { "serverTime": "…" }
}
```

Tanpa `electionId`, pemilihan fokus = aktif → terjadwal → selesai terbaru → draft terbaru.

### `GET /api/admin/elections?status=&page=1&pageSize=20`

```json
{
  "data": [
    {
      "id": "…", "title": "…", "description": null, "startAt": "…", "endAt": "…",
      "status": "active", "phase": "open", "votingOpen": true, "resultsAvailable": false,
      "resultsPublic": false, "eligibleVoterCount": 450,
      "allowedTransitions": ["completed"], "candidatesEditable": false,
      "candidateCount": 3, "voterCount": 18, "createdAt": "…", "updatedAt": "…"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

### `POST /api/admin/elections`

```json
{
  "title": "Pemilihan Ketua & Wakil Ketua OSIS 2026/2027",
  "description": "Periode 2026/2027",
  "startAt": "2026-10-20T07:30:00+07:00",
  "endAt": "2026-10-20T12:00:00+07:00",
  "eligibleVoterCount": 450,
  "resultsPublic": false
}
```

`201` dengan data pemilihan berstatus `draft`. Validasi: judul 5–150 karakter, `endAt > startAt`,
`eligibleVoterCount` bilangan bulat ≥ 1 atau `null`.

### `PATCH /api/admin/elections/:id`

Kirim hanya field yang berubah: `title`, `description`, `startAt`, `endAt`, `eligibleVoterCount`,
`resultsPublic`, `status`.

| Status saat ini | Field yang boleh diubah | Transisi status |
|---|---|---|
| `draft` | semua | → `scheduled`, `active` |
| `scheduled` | semua | → `draft`, `active` |
| `active` | judul, deskripsi, `endAt` (hanya ke masa depan), jumlah siswa, publikasi | → `completed` |
| `completed` | judul, deskripsi, jumlah siswa, publikasi | — (final) |

Membuka (`active`) mensyaratkan ≥ 1 paslon dan `endAt` di masa depan; hanya satu pemilihan aktif
pada satu waktu (`409 ANOTHER_ELECTION_ACTIVE`, dijaga indeks unik di database). Setiap perubahan
dicatat di audit log dalam transaksi yang sama.

Contoh membuka & mempublikasikan:

```json
{ "status": "active" }
```
```json
{ "resultsPublic": true }
```

### `DELETE /api/admin/elections/:id`

Hanya status `draft`/`scheduled` (yang pasti belum punya suara). `204`. Pasangan calon & fotonya
ikut terhapus. Pemilihan dengan suara ditolak `409` (juga dijaga `FOREIGN KEY … ON DELETE RESTRICT`).

### Pasangan calon

`GET /api/admin/elections/:id/candidates` — daftar paslon (termasuk `createdAt`/`updatedAt`).

`POST /api/admin/elections/:id/candidates`

```json
{
  "candidateNumber": 1,
  "chairpersonName": "Raka Aditya Pratama",
  "viceChairpersonName": "Nabila Putri Lestari",
  "vision": "Mewujudkan OSIS yang aktif, kreatif, dan peduli.",
  "mission": "Forum aspirasi bulanan.\nJumat Bersih.",
  "photoUrl": "https://cdn.sekolah.sch.id/paslon-1.jpg"
}
```

`PATCH /api/admin/candidates/:id` — field yang sama, parsial. `DELETE /api/admin/candidates/:id` → `204`.

`PUT /api/admin/candidates/:id/photo` — `multipart/form-data` dengan satu field `photo`
(JPG/PNG/WebP, ≤ `UPLOAD_MAX_MB`). Jenis dicek dari isi file; nama file dibuat server; foto lama
dihapus. Respons: data paslon dengan `photoUrl: "/uploads/candidates/<uuid>.png"`.

Data paslon hanya dapat diubah saat pemilihan `draft`/`scheduled` (`409 ELECTION_LOCKED`).
`photoUrl` hanya menerima `https://…` atau path hasil unggahan; `javascript:`, `data:`, `http:` ditolak.

### `GET /api/admin/elections/:id/results`

Hasil sementara (saat berlangsung) atau akhir, dari **satu snapshot konsisten** database:

```json
{
  "data": {
    "election": { "…": "data admin pemilihan" },
    "isFinal": false,
    "totals": { "validVotes": 18, "uniqueVoters": 18, "eligibleVoters": null, "turnoutPercentage": null },
    "candidates": [
      { "id": "…", "candidateNumber": 1, "chairpersonName": "…", "viceChairpersonName": "…",
        "photoUrl": null, "votes": 10, "percentage": 55.56, "isLeading": true }
    ],
    "leaderCount": 1,
    "isTie": false,
    "timeline": {
      "bucketSeconds": 3600,
      "points": [{ "bucketStart": "2026-10-09T07:00:00.000Z", "voters": 17, "cumulativeVoters": 17 }]
    },
    "participationWindow": { "firstVotedAt": "…", "lastVotedAt": "…" },
    "integrity": { "consistent": true, "validVotes": 18, "participationRecords": 18 },
    "generatedAt": "2026-10-09T08:03:30.002Z"
  }
}
```

- `timeline` dihitung dengan `GROUP BY` di database dari waktu partisipasi (tanpa NISN); interval
  15 menit (jadwal ≤ 6 jam), 1 jam (≤ 3 hari), atau 1 hari.
- `integrity.consistent` harus selalu `true` karena suara dan partisipasi ditulis dalam satu transaksi.

### Audit log

`GET /api/admin/audit-logs?page=1&pageSize=25&electionId=<uuid opsional>` dan
`GET /api/admin/elections/:id/audit-logs?page=1&pageSize=25`:

```json
{
  "data": [
    {
      "id": 16,
      "action": "auth.login_success",
      "entityType": "admin_user",
      "entityId": "3f42190d-…",
      "electionId": null,
      "metadata": { "ip": "127.0.0.1" },
      "createdAt": "2026-10-09T08:03:29.882Z",
      "admin": { "id": "3f42190d-…", "name": "Admin Panitia (Lokal)", "email": "admin@eosis.local", "role": "admin" }
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 16, "totalPages": 1 }
}
```

Aksi yang dicatat: `auth.login_success`, `auth.login_failed`, `auth.logout`, `election.created`,
`election.updated`, `election.status_changed`, `election.results_visibility_changed`,
`election.deleted`, `candidate.created`, `candidate.updated`, `candidate.photo_updated`,
`candidate.deleted`. Proses voting tidak pernah menulis audit log.
