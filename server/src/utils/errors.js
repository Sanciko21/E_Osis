/**
 * Error aplikasi dengan status HTTP dan kode yang dapat dikenali frontend.
 * Format respons seragam: { error: { code, message, details?, requestId } }
 */
export class AppError extends Error {
  constructor(status, code, message, { details, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = Object.freeze({
  validation: (details, message = 'Data yang dikirim tidak valid.') =>
    new AppError(400, 'VALIDATION_ERROR', message, { details }),
  invalidJson: () => new AppError(400, 'INVALID_JSON', 'Format JSON pada permintaan tidak valid.'),
  unsupportedMediaType: () =>
    new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Permintaan harus dikirim dengan Content-Type: application/json.'),
  payloadTooLarge: (message = 'Ukuran data yang dikirim terlalu besar.') =>
    new AppError(413, 'PAYLOAD_TOO_LARGE', message),
  notFound: (message = 'Data tidak ditemukan.') => new AppError(404, 'NOT_FOUND', message),
  routeNotFound: () => new AppError(404, 'ROUTE_NOT_FOUND', 'Endpoint tidak ditemukan.'),

  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'Silakan login sebagai admin terlebih dahulu.'),
  sessionExpired: () => new AppError(401, 'SESSION_EXPIRED', 'Sesi Anda telah berakhir. Silakan login kembali.'),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.'),
  forbidden: (message = 'Anda tidak memiliki izin untuk melakukan tindakan ini.') =>
    new AppError(403, 'FORBIDDEN', message),
  csrfInvalid: () =>
    new AppError(403, 'CSRF_INVALID', 'Token keamanan (CSRF) tidak valid. Muat ulang halaman lalu coba lagi.'),
  rateLimited: (message) => new AppError(429, 'RATE_LIMITED', message),

  electionNotFound: () => new AppError(404, 'ELECTION_NOT_FOUND', 'Pemilihan tidak ditemukan.'),
  electionNotStarted: () =>
    new AppError(403, 'ELECTION_NOT_STARTED', 'Pemungutan suara belum dimulai. Silakan kembali sesuai jadwal.'),
  electionEnded: () => new AppError(403, 'ELECTION_ENDED', 'Pemungutan suara sudah berakhir.'),
  invalidCandidate: () =>
    new AppError(422, 'INVALID_CANDIDATE', 'Pasangan calon yang dipilih tidak terdaftar pada pemilihan ini.'),
  alreadyVoted: () => new AppError(409, 'ALREADY_VOTED', 'NISN ini sudah digunakan untuk memilih!'),
  voteNotRecorded: (cause) =>
    new AppError(500, 'VOTE_NOT_RECORDED', 'Suara BELUM tercatat karena gangguan pada server. Silakan coba lagi.', {
      cause,
    }),
  voteStatusUnknown: (cause) =>
    new AppError(
      500,
      'VOTE_STATUS_UNKNOWN',
      'Server tidak dapat memastikan apakah suara sudah tercatat. Jangan berulang kali mengirim; hubungi panitia.',
      { cause },
    ),

  resultsNotPublic: () =>
    new AppError(403, 'RESULTS_NOT_PUBLIC', 'Hasil pemilihan belum dipublikasikan oleh panitia.'),
  invalidStatusTransition: (from, to) =>
    new AppError(409, 'INVALID_STATUS_TRANSITION', `Status pemilihan tidak dapat diubah dari "${from}" ke "${to}".`),
  anotherElectionActive: () =>
    new AppError(409, 'ANOTHER_ELECTION_ACTIVE', 'Masih ada pemilihan lain yang aktif. Tutup pemilihan tersebut terlebih dahulu.'),
  electionLocked: (message = 'Data tidak dapat diubah karena pemilihan sudah dibuka atau selesai.') =>
    new AppError(409, 'ELECTION_LOCKED', message),
  scheduleInvalid: (message) => new AppError(409, 'SCHEDULE_INVALID', message),
  noCandidates: () =>
    new AppError(409, 'NO_CANDIDATES', 'Tambahkan minimal satu pasangan calon sebelum membuka pemungutan suara.'),
  candidateNumberTaken: () =>
    new AppError(409, 'CANDIDATE_NUMBER_TAKEN', 'Nomor urut tersebut sudah dipakai pasangan calon lain.'),
  invalidImage: (message = 'Foto harus berupa gambar JPG, PNG, atau WebP.') =>
    new AppError(400, 'INVALID_IMAGE', message),
});

/** Kode SQLSTATE PostgreSQL yang ditangani aplikasi. */
export const PG_ERROR = Object.freeze({
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
});

/** Mengecek pelanggaran UNIQUE PostgreSQL, opsional untuk nama constraint/indeks tertentu. */
export function isDuplicateKeyError(error, constraintName) {
  if (error?.code !== PG_ERROR.UNIQUE_VIOLATION) return false;
  return !constraintName || error.constraint === constraintName;
}

/** Baris yang hendak dihapus masih dirujuk foreign key (ON DELETE RESTRICT). */
export function isForeignKeyViolation(error) {
  return error?.code === PG_ERROR.FOREIGN_KEY_VIOLATION;
}
