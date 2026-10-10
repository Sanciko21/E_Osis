/**
 * Logger sederhana. Aturan privasi:
 * - Tidak pernah mencatat body request (berisi NISN dan pilihan kandidat).
 * - Deretan 10 digit (pola NISN) pada pesan error disamarkan.
 */
const NISN_LIKE = /\b\d{10}\b/g;

export function redact(text) {
  return typeof text === 'string' ? text.replace(NISN_LIKE, '[REDACTED]') : text;
}

function write(level, message, meta) {
  if (process.env.NODE_ENV === 'test' && !process.env.LOG_IN_TESTS) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${redact(message)}`;
  const output = meta ? `${line} ${JSON.stringify(meta, (_key, value) => redact(value))}` : line;
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}

export const logger = Object.freeze({
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
});

/** Ringkasan error yang aman untuk log (tanpa SQL, parameter, maupun body). */
export function describeError(error, { includeStack = false } = {}) {
  if (!error) return undefined;
  return {
    name: error.name,
    code: error.code,
    errno: error.errno,
    message: redact(error.message),
    cause: error.cause ? describeError(error.cause) : undefined,
    stack: includeStack ? redact(error.stack) : undefined,
  };
}
