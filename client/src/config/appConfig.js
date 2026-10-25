/**
 * Konfigurasi PUBLIK frontend (variabel VITE_* ikut ter-bundle ke browser).
 * Jangan pernah menaruh rahasia (password database, session secret, dsb.) di sini.
 */
const env = import.meta.env;

/** Folder tempat aplikasi dipasang, dari `base` Vite (BASE_PATH): "/" atau mis. "/E-Voting/". */
const basePath = env.BASE_URL || '/';

/**
 * Menyesuaikan path milik aplikasi ("/logo-sekolah.png", foto demo "/demo/...", "/uploads/...")
 * dengan folder pemasangan. URL lengkap (https://, data:, blob:) dikembalikan apa adanya.
 */
export function publicUrl(url) {
  if (!url || !url.startsWith('/') || url.startsWith('//')) return url;
  return basePath + url.slice(1);
}

export const appConfig = Object.freeze({
  /** Basename router, mis. "/E-Voting" (atau "/" bila dipasang di akar domain). */
  routerBasename: basePath.replace(/\/$/, '') || '/',
  /**
   * Kosong = API di origin & folder yang sama dengan frontend: "/api/..." atau
   * "/E-Voting/api/..." (disarankan; saat dev diteruskan oleh proxy Vite).
   */
  apiBaseUrl: (env.VITE_API_BASE_URL?.trim() || basePath).replace(/\/$/, ''),
  schoolName: env.VITE_SCHOOL_NAME?.trim() || '',
  /** Logo sekolah di belakang foto pasangan calon (file di client/public/ atau URL https://). */
  schoolLogoUrl: publicUrl(env.VITE_SCHOOL_LOGO_URL?.trim() || '/logo-sekolah.png'),
  /** Batas waktu request umum dan request voting (ms). */
  requestTimeoutMs: 15_000,
  voteTimeoutMs: 20_000,
  /** Interval pembaruan otomatis dashboard admin (ms). */
  dashboardRefreshMs: 15_000,
  /** Interval pembaruan panel Live Report untuk layar/proyektor (ms). */
  liveReportRefreshMs: 5_000,
});
