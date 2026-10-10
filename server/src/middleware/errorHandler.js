import multer from 'multer';
import { AppError, Errors } from '../utils/errors.js';
import { describeError, logger } from '../utils/logger.js';

export function notFoundHandler(_req, _res, next) {
  next(Errors.routeNotFound());
}

function normalizeError(error, uploadMaxBytes) {
  if (error instanceof AppError) return error;
  if (error?.type === 'entity.parse.failed') return Errors.invalidJson();
  if (error?.type === 'entity.too.large') return Errors.payloadTooLarge();
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return Errors.payloadTooLarge(`Ukuran foto maksimal ${Math.round(uploadMaxBytes / 1024 / 1024)} MB.`);
    }
    return Errors.invalidImage('Unggah tepat satu file foto pada field "photo".');
  }
  // Error dari http-errors (mis. express.static: file tidak ada, body-parser: charset tak dikenal).
  const status = error?.status ?? error?.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return status === 404
      ? Errors.notFound('File tidak ditemukan.')
      : new AppError(status, 'BAD_REQUEST', 'Permintaan tidak dapat diproses.');
  }
  return null;
}

/**
 * Error handler terpusat. Klien hanya menerima kode & pesan yang aman; stack trace,
 * pesan SQL, dan detail internal hanya dicatat di log server (tanpa body request).
 */
export function createErrorHandler(config) {
  // Express mengenali error handler dari jumlah parameternya (4).
  return (error, req, res, _next) => {
    const known = normalizeError(error, config.uploads.maxBytes);
    const appError = known ?? new AppError(500, 'INTERNAL_ERROR', 'Terjadi kesalahan pada server. Silakan coba lagi.');

    if (appError.status >= 500) {
      logger.error(`${req.method} ${req.originalUrl.split('?')[0]} gagal`, {
        id: req.id,
        error: describeError(known?.cause ?? error, { includeStack: !config.isProduction }),
      });
    }

    if (res.headersSent) return;
    res.status(appError.status).json({
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
        requestId: req.id,
      },
    });
  };
}
