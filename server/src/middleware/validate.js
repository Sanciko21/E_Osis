import { Errors } from '../utils/errors.js';
import { toFieldErrors } from '../validators/common.js';

/**
 * Validasi request dengan skema zod. Hasil yang sudah dibersihkan disimpan di
 * req.valid.{params,query,body}; controller hanya membaca dari sana.
 * Parameter path yang tidak valid (mis. bukan UUID) dianggap "tidak ditemukan".
 */
export function validate({ params, query, body }) {
  return (req, _res, next) => {
    req.valid ??= {};
    if (params) {
      const result = params.safeParse(req.params);
      if (!result.success) throw Errors.notFound();
      req.valid.params = result.data;
    }
    if (query) {
      const result = query.safeParse(req.query);
      if (!result.success) throw Errors.validation(toFieldErrors(result.error), 'Parameter query tidak valid.');
      req.valid.query = result.data;
    }
    if (body) {
      if (req.body === undefined) throw Errors.validation([], 'Body permintaan wajib berupa JSON.');
      const result = body.safeParse(req.body);
      if (!result.success) throw Errors.validation(toFieldErrors(result.error));
      req.valid.body = result.data;
    }
    next();
  };
}

/** Menolak body non-JSON pada method yang mengubah data (kecuali endpoint upload). */
export function requireJsonBody(req, _res, next) {
  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding') !== undefined;
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && hasBody && !req.is('application/json')) {
    throw Errors.unsupportedMediaType();
  }
  next();
}
