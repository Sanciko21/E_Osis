import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getConfig } from './config/env.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestId, requestLogger } from './middleware/requestContext.js';
import { createApiRouter } from './routes/index.js';

/** CSP untuk build frontend yang disajikan Express (SERVE_CLIENT=true). */
function clientCsp(httpsDeployment) {
  return {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      // SweetAlert2 & animasi menyetel atribut style secara dinamis.
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      // Hanya untuk deployment HTTPS: di HTTP (mis. IP LAN sekolah) direktif ini membuat
      // browser meminta aset lewat https:// sehingga halaman gagal dimuat.
      'upgrade-insecure-requests': httpsDeployment ? [] : null,
    },
  };
}

function corsOptions(allowedOrigins) {
  return {
    origin(origin, callback) {
      // Tanpa header Origin = request same-origin / non-browser.
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  };
}

export function createApp({ config = getConfig() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');
  app.locals.config = config;

  app.use(requestId);
  if (config.logRequests) app.use(requestLogger);
  app.use(
    helmet({
      contentSecurityPolicy: config.client.serve ? clientCsp(config.session.cookieSecure) : undefined,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use('/api', cors(corsOptions(config.corsOrigins)));
  app.use('/api', express.json({ limit: '64kb', strict: true }));
  app.use('/api', cookieParser());
  app.use('/api', createApiRouter(config));
  app.use('/api', notFoundHandler);

  // Foto kandidat hasil upload: disajikan sebagai file statis dengan header ketat.
  app.use(
    '/uploads',
    express.static(config.uploads.dir, {
      index: false,
      dotfiles: 'deny',
      fallthrough: false,
      maxAge: '1d',
      setHeaders(res) {
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
      },
    }),
  );

  // Opsional: menyajikan hasil build React (client/dist) dari server yang sama.
  if (config.client.serve) {
    const indexHtml = path.join(config.client.distDir, 'index.html');
    if (!fs.existsSync(indexHtml)) {
      throw new Error(`SERVE_CLIENT=true tetapi ${indexHtml} tidak ditemukan. Jalankan "npm run build" di folder client.`);
    }
    app.use(express.static(config.client.distDir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(indexHtml));
  }

  app.use(createErrorHandler(config));
  return app;
}
