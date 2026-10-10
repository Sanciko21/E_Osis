import { appConfig } from '../config/appConfig.js';

/**
 * Error API yang seragam.
 * kind:
 *  - 'http'    : server menjawab dengan status error (code & message dari backend)
 *  - 'network' : tidak terhubung ke server (request tidak sampai / koneksi putus)
 *  - 'timeout' : server tidak menjawab dalam batas waktu (hasil TIDAK diketahui)
 *  - 'invalid' : server menjawab, tetapi isi respons tidak sesuai/ tidak terbaca
 */
export class ApiError extends Error {
  constructor({ kind, status = null, code = null, message, details = null, requestId = null }) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /**
   * True bila tidak bisa dipastikan apakah server sudah memproses request. Hanya
   * VOTE_NOT_RECORDED (server menjamin ROLLBACK) yang dianggap pasti gagal di antara 5xx.
   */
  get outcomeUnknown() {
    return (
      this.kind === 'timeout' ||
      this.kind === 'network' ||
      this.kind === 'invalid' ||
      (this.kind === 'http' && this.status >= 500 && this.code !== 'VOTE_NOT_RECORDED')
    );
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);
let csrfToken = null;
let unauthorizedListener = null;

/** Token CSRF hanya disimpan di memori (bukan localStorage) dan dikirim di header. */
export function setCsrfToken(token) {
  csrfToken = token ?? null;
}

/** Dipanggil saat endpoint admin menjawab 401 (sesi habis) agar UI kembali ke login. */
export function setUnauthorizedListener(listener) {
  unauthorizedListener = listener;
  return () => {
    if (unauthorizedListener === listener) unauthorizedListener = null;
  };
}

function fallbackMessage(status) {
  if (status === 404) return 'Data tidak ditemukan.';
  if (status === 429) return 'Terlalu banyak permintaan. Coba lagi sebentar lagi.';
  if (status >= 500) return 'Terjadi gangguan pada server. Silakan coba lagi.';
  return 'Permintaan tidak dapat diproses.';
}

/**
 * Wrapper fetch: JSON, cookie sesi (credentials), batas waktu, CSRF, dan error seragam.
 * @returns payload JSON ({ data, meta, message }) atau null untuk 204.
 */
export async function apiRequest(path, { method = 'GET', body, formData, signal, timeoutMs = appConfig.requestTimeoutMs } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!SAFE_METHODS.has(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  try {
    let response;
    try {
      response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
        method,
        headers,
        body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
        credentials: 'include',
        signal: controller.signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error; // dibatalkan pemanggil (mis. komponen dilepas)
      if (timedOut) {
        throw new ApiError({ kind: 'timeout', message: 'Server tidak merespons dalam batas waktu.' });
      }
      throw new ApiError({ kind: 'network', message: 'Tidak dapat terhubung ke server. Periksa koneksi internet.' });
    }

    if (response.status === 204) return null;

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timedOut) throw new ApiError({ kind: 'timeout', message: 'Server tidak merespons dalam batas waktu.' });
      if (response.ok) {
        throw new ApiError({ kind: 'invalid', status: response.status, message: 'Respons server tidak dapat dibaca.' });
      }
    }

    if (!response.ok) {
      const error = new ApiError({
        kind: 'http',
        status: response.status,
        code: payload?.error?.code ?? `HTTP_${response.status}`,
        message: payload?.error?.message ?? fallbackMessage(response.status),
        details: payload?.error?.details ?? null,
        requestId: payload?.error?.requestId ?? null,
      });
      if (response.status === 401 && path.startsWith('/api/admin')) unauthorizedListener?.(error);
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function isAbortError(error) {
  return error?.name === 'AbortError';
}
