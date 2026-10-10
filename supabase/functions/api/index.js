/**
 * Supabase Edge Function "api" — menjalankan API Express E-OSIS yang SAMA dengan server Node.js
 * (folder server/src): endpoint, validasi NISN, aturan satu suara per siswa, jadwal, publikasi
 * hasil, dan hak akses admin tidak berubah.
 *
 * URL function: https://<project-ref>.supabase.co/functions/v1/api/...  → Express menerima /api/...
 * Frontend (Vercel) meneruskan /api/* ke URL tersebut lewat rewrite, sehingga browser tetap melihat
 * satu origin dan cookie sesi admin (SameSite=Strict) berfungsi.
 *
 * Deploy: lihat docs/DEPLOY-SUPABASE-VERCEL.md.
 */
import express from 'express';
import { createApp } from '../../../server/src/app.js';
import { initConfig } from '../../../server/src/config/env.js';
import { purgeExpiredSessions } from '../../../server/src/services/auth.service.js';
import { describeError, logger } from '../../../server/src/utils/logger.js';

/**
 * Nilai bawaan khusus Edge Functions; setiap nilai dapat ditimpa lewat Edge Function Secrets.
 * - PHOTO_STORAGE=supabase: tidak ada disk permanen, foto disimpan di Supabase Storage.
 * - TRUST_PROXY=10: IP klien diambil dari entri paling awal X-Forwarded-For (ditulis Vercel),
 *   bukan IP server Vercel/gateway Supabase yang sama untuk semua siswa.
 * - Batas permintaan lebih longgar: penyimpanan rate limit per worker dan banyak siswa berbagi
 *   satu IP sekolah. Aturan satu NISN satu suara tetap dijaga database.
 * - DB_CONNECTION_LIMIT kecil: banyak worker berjalan bersamaan dan berbagi pooler Supabase.
 */
const EDGE_DEFAULTS = Object.freeze({
  NODE_ENV: 'production',
  PHOTO_STORAGE: 'supabase',
  TRUST_PROXY: '10',
  VOTE_RATE_LIMIT_MAX: '600',
  API_RATE_LIMIT_MAX: '6000',
  DB_CONNECTION_LIMIT: '3',
});

const SESSION_PURGE_INTERVAL_MS = 60 * 60 * 1000;

const config = initConfig({ ...EDGE_DEFAULTS, ...Deno.env.toObject() });
const app = express();
app.disable('x-powered-by');

// Diagnosa sekali per worker (tanpa mencatat IP): apakah IP klien ikut diteruskan Vercel?
let forwardingLogged = false;
app.use((req, _res, next) => {
  if (!forwardingLogged) {
    forwardingLogged = true;
    const entries = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .filter((part) => part.trim()).length;
    logger.info('Edge: header X-Forwarded-For', { entries, viaVercel: Boolean(req.headers['x-vercel-id']) });
  }
  next();
});

// Server Node.js membersihkan sesi kedaluwarsa tiap jam (setInterval); worker Edge berumur pendek,
// jadi pembersihan dijalankan setelah login admin berhasil (paling sering sekali per jam per worker).
let lastSessionPurge = 0;
app.post('/api/auth/login', (_req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400 || Date.now() - lastSessionPurge < SESSION_PURGE_INTERVAL_MS) return;
    lastSessionPurge = Date.now();
    purgeExpiredSessions(config.session).catch((error) =>
      logger.warn('Pembersihan sesi kedaluwarsa gagal', { error: describeError(error) }),
    );
  });
  next();
});

app.use(createApp({ config }));

app.listen(8000);
