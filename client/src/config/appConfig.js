/**
 * Konfigurasi PUBLIK frontend (variabel VITE_* ikut ter-bundle ke browser).
 * Jangan pernah menaruh rahasia (password database, session secret, dsb.) di sini.
 */
const env = import.meta.env;

export const appConfig = Object.freeze({
  /** Kosong = origin yang sama (disarankan; saat dev diteruskan oleh proxy Vite). */
  apiBaseUrl: (env.VITE_API_BASE_URL ?? '').replace(/\/$/, ''),
  schoolName: env.VITE_SCHOOL_NAME?.trim() || '',
  /** Logo sekolah di belakang foto pasangan calon (file di client/public/ atau URL https://). */
  schoolLogoUrl: env.VITE_SCHOOL_LOGO_URL?.trim() || '/logo-sekolah.png',
  /** Batas waktu request umum dan request voting (ms). */
  requestTimeoutMs: 15_000,
  voteTimeoutMs: 20_000,
  /** Interval pembaruan otomatis dashboard admin (ms). */
  dashboardRefreshMs: 15_000,
});
