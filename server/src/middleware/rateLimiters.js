import { rateLimit } from 'express-rate-limit';
import { Errors } from '../utils/errors.js';

/**
 * Rate limiter berbasis IP (penyimpanan memori). Untuk lebih dari satu instance server,
 * gunakan store bersama (mis. Redis) agar batas berlaku di semua instance.
 * Catatan: siswa di laboratorium komputer biasanya berbagi satu IP publik (NAT),
 * sehingga batas voting dibuat longgar dan dapat diatur lewat .env.
 */
function limiter({ windowMs, max, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests,
    handler: (_req, _res, next) => next(Errors.rateLimited(message)),
  });
}

export function createRateLimiters(rateLimitConfig) {
  return {
    login: limiter({
      ...rateLimitConfig.login,
      // Hanya percobaan gagal yang dihitung.
      skipSuccessfulRequests: true,
      message: 'Terlalu banyak percobaan login. Silakan tunggu beberapa menit lalu coba lagi.',
    }),
    vote: limiter({
      ...rateLimitConfig.vote,
      message: 'Terlalu banyak permintaan dari perangkat/jaringan ini. Tunggu sebentar lalu coba lagi.',
    }),
    api: limiter({
      ...rateLimitConfig.api,
      message: 'Terlalu banyak permintaan. Silakan coba lagi sebentar lagi.',
    }),
  };
}
