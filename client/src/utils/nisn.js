/**
 * Validasi NISN di sisi klien hanya untuk kenyamanan pengguna. Keputusan akhir tetap
 * di backend (format nasional 10 digit + aturan sekolah dari server).
 */
export const NISN_LENGTH = 10;

/** Hanya angka, maksimal 10 digit (spasi/tanda baca yang diketik otomatis dibuang). */
export function sanitizeNisnInput(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, NISN_LENGTH);
}

export function validateNisn(value) {
  if (!value) return 'NISN wajib diisi.';
  if (!/^\d+$/.test(value)) return 'NISN hanya boleh berisi angka.';
  if (value.length !== NISN_LENGTH) return `NISN harus terdiri dari 10 digit (sekarang ${value.length} digit).`;
  return null;
}
