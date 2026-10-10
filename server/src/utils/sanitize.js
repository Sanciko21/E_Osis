/**
 * Sanitasi metadata audit log. Audit log TIDAK BOLEH memuat password, token, NISN,
 * maupun pilihan suara. Kunci sensitif dibuang dan nilai berpola NISN disamarkan.
 */
const SENSITIVE_KEY = /pass(word)?|token|secret|hash|cookie|session|authorization|csrf|nisn|ballot|choice/i;
const NISN_VALUE = /^\s*\d{10}\s*$/;
const MAX_DEPTH = 4;
const MAX_STRING = 300;
const MAX_ITEMS = 25;

export function sanitizeMetadata(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > MAX_DEPTH) return '[truncated]';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((item) => sanitizeMetadata(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_ITEMS)) {
      if (SENSITIVE_KEY.test(key)) continue;
      result[key] = sanitizeMetadata(item, depth + 1);
    }
    return result;
  }
  if (typeof value === 'string') {
    if (NISN_VALUE.test(value)) return '[REDACTED]';
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

// Regex ini memang sengaja mencocokkan karakter kontrol untuk dibuang.
/* eslint-disable no-control-regex */
const CONTROL_CHARS_KEEP_NEWLINE_TAB = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]+/g;
/* eslint-enable no-control-regex */

/** Menghapus karakter kontrol (kecuali baris baru & tab untuk teks panjang). */
export function stripControlChars(text, { multiline = false } = {}) {
  const cleaned = text.replace(/\r\n?/g, '\n');
  return multiline ? cleaned.replace(CONTROL_CHARS_KEEP_NEWLINE_TAB, '') : cleaned.replace(CONTROL_CHARS, ' ');
}
