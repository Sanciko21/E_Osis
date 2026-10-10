import { hasPermission } from '../config/permissions.js';
import { resolveSession } from '../services/auth.service.js';
import { Errors } from '../utils/errors.js';
import { safeEqual } from '../utils/security.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function sessionCookieOptions(sessionConfig) {
  return {
    httpOnly: true, // tidak bisa dibaca JavaScript (mitigasi pencurian sesi via XSS)
    secure: sessionConfig.cookieSecure, // wajib true di HTTPS/production
    sameSite: 'strict', // cookie tidak dikirim pada request lintas situs (mitigasi CSRF)
    path: '/',
  };
}

/** Wajib login: memuat sesi admin dari cookie HttpOnly ke req.auth. */
export function requireAuth(sessionConfig) {
  return async (req, res, next) => {
    const token = req.cookies?.[sessionConfig.cookieName];
    if (!token) throw Errors.unauthenticated();
    const auth = await resolveSession(token, sessionConfig);
    if (!auth) {
      res.clearCookie(sessionConfig.cookieName, sessionCookieOptions(sessionConfig));
      throw Errors.sessionExpired();
    }
    req.auth = auth;
    next();
  };
}

/** Opsional login: req.auth diisi bila sesi valid, tanpa menolak request. */
export function optionalAuth(sessionConfig) {
  return async (req, _res, next) => {
    const token = req.cookies?.[sessionConfig.cookieName];
    req.auth = token ? await resolveSession(token, sessionConfig) : null;
    next();
  };
}

/**
 * Proteksi CSRF (synchronizer token): setiap request yang mengubah data wajib membawa
 * header X-CSRF-Token yang sama dengan token milik sesi di server. Situs lain tidak bisa
 * membaca token ini, dan header kustom memicu preflight CORS yang ditolak allowlist.
 */
export function requireCsrf(req, _res, next) {
  if (SAFE_METHODS.has(req.method) || !req.auth) return next();
  if (!safeEqual(req.get('x-csrf-token') ?? '', req.auth.csrfToken)) throw Errors.csrfInvalid();
  next();
}

/** Otorisasi berbasis izin peran (role-based access control). */
export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.auth) throw Errors.unauthenticated();
    if (!hasPermission(req.auth.user.role, permission)) throw Errors.forbidden();
    next();
  };
}
