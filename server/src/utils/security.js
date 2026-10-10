import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import { argon2Verify, argon2id } from 'hash-wasm';

/**
 * Parameter Argon2id mengikuti rekomendasi OWASP (m=19 MiB minimum; di sini 64 MiB).
 * Implementasi WebAssembly (hash-wasm) agar berjalan sama di Node.js maupun Supabase Edge
 * Functions (Deno, tanpa modul native). Formatnya string PHC standar
 * ($argon2id$v=19$m=…,t=…,p=…$salt$hash), sehingga hash lama dari modul argon2 native tetap valid.
 */
const ARGON2_OPTIONS = Object.freeze({
  memorySize: 64 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
});
const SALT_BYTES = 16;

export function hashPassword(plain) {
  return argon2id({ password: plain, salt: crypto.randomBytes(SALT_BYTES), ...ARGON2_OPTIONS, outputType: 'encoded' });
}

export async function verifyPassword(hash, plain) {
  try {
    return await argon2Verify({ password: plain, hash });
  } catch {
    return false;
  }
}

/**
 * Hash palsu untuk menyamakan waktu respons login ketika email tidak terdaftar
 * (mencegah enumerasi akun lewat perbedaan waktu). Dibuat sekali dari password acak 256-bit yang
 * dibuang, dengan parameter yang sama dengan ARGON2_OPTIONS; tidak ada akun yang memakainya.
 * Disimpan sebagai konstanta agar login pertama di worker Edge tidak menghitung dua hash Argon2.
 */
const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=1$KjQwIZTcv90dLnUCnU0iQg$FfzrWIrK3TEMnUDYaiZP5rbvOVCn7f14ADpHOrjy4Tk';

export function getDummyPasswordHash() {
  return Promise.resolve(DUMMY_PASSWORD_HASH);
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
