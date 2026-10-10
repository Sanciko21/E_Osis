/**
 * Aturan NISN (Nomor Induk Siswa Nasional):
 * - Aturan nasional: tepat 10 digit angka, disimpan sebagai TEKS agar angka 0 di depan
 *   tidak hilang (contoh: "0098765432"). Aturan ini juga dijaga CHECK constraint PostgreSQL.
 * - Aturan sekolah (opsional): NISN_PATTERN di .env, mis. "^01[0-4][0-9]{7}$" untuk
 *   membatasi rentang tahun lahir. Pola sekolah hanya bisa MEMPERKETAT aturan nasional.
 */
export const NATIONAL_NISN_REGEX = /^[0-9]{10}$/;

/** Menghapus spasi yang tidak sengaja diketik (mis. "0012 345 678"). */
export function normalizeNisn(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, '') : value;
}

export function createNisnValidator(schoolPattern) {
  return (value) => typeof value === 'string' && NATIONAL_NISN_REGEX.test(value) && schoolPattern.test(value);
}
