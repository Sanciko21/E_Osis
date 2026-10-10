import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

/** ID unik per request (dikirim balik lewat header X-Request-Id untuk penelusuran). */
export function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

/** Log akses minimal: method, path, status, durasi. Body TIDAK pernah dicatat. */
export function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    logger.info(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms.toFixed(1)}ms`, { id: req.id });
  });
  next();
}
