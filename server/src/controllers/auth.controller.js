import { sessionCookieOptions } from '../middleware/auth.js';
import * as authService from '../services/auth.service.js';
import { Errors } from '../utils/errors.js';
import { safeEqual } from '../utils/security.js';

export function createAuthController(sessionConfig) {
  const cookieOptions = sessionCookieOptions(sessionConfig);

  return {
    async login(req, res) {
      const { email, password } = req.valid.body;
      const result = await authService.login(
        { email, password, userAgent: req.get('user-agent'), ip: req.ip },
        sessionConfig,
      );
      // Rotasi sesi: token lama di peramban ini dicabut agar tidak tersisa sesi yatim.
      await authService.revokeSessionToken(req.cookies?.[sessionConfig.cookieName]);
      // Token sesi hanya dikirim lewat cookie HttpOnly — tidak pernah di body respons.
      res.cookie(sessionConfig.cookieName, result.token, {
        ...cookieOptions,
        maxAge: sessionConfig.absoluteHours * 60 * 60 * 1000,
      });
      res.json({ data: { user: result.user, csrfToken: result.csrfToken }, message: 'Login berhasil.' });
    },

    async logout(req, res) {
      if (req.auth) {
        if (!safeEqual(req.get('x-csrf-token') ?? '', req.auth.csrfToken)) throw Errors.csrfInvalid();
        await authService.logout(req.auth, req.ip);
      }
      res.clearCookie(sessionConfig.cookieName, cookieOptions);
      res.status(204).end();
    },

    me(req, res) {
      res.json({ data: { user: req.auth.user, csrfToken: req.auth.csrfToken } });
    },
  };
}
