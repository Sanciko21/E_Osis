import crypto from 'node:crypto';
import argon2 from 'argon2';

/** Parameter Argon2id mengikuti rekomendasi OWASP (m=19 MiB minimum; di sini 64 MiB). */
const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
});

export function hashPassword(plain) {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHashPromise;
/**
 * Hash palsu untuk menyamakan waktu respons login ketika email tidak terdaftar
 * (mencegah enumerasi akun lewat perbedaan waktu).
 */
export function getDummyPasswordHash() {
  dummyHashPromise ??= hashPassword(crypto.randomBytes(32).toString('hex'));
  return dummyHashPromise;
}

/** Token acak 256-bit dalam base64url (43 karakter). */
export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

/** Kebijakan password admin: minimal 12 karakter, kombinasi huruf & angka. */
export function validatePasswordPolicy(password) {
  const problems = [];
  if (typeof password !== 'string' || password.length < 12) problems.push('minimal 12 karakter');
  if (!/[A-Za-z]/.test(password ?? '')) problems.push('mengandung huruf');
  if (!/[0-9]/.test(password ?? '')) problems.push('mengandung angka');
  if ((password ?? '').length > 200) problems.push('maksimal 200 karakter');
  return problems;
}
