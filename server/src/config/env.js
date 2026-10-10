import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Memuat server/.env (atau server/.env.test saat NODE_ENV=test) dengan fitur bawaan Node.js.
 * Variabel yang sudah ada di environment proses TIDAK ditimpa, sehingga nilai dari
 * sistem/hosting selalu lebih diutamakan daripada isi file.
 */
export function loadEnvFile() {
  const fileName = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
  try {
    process.loadEnvFile(path.join(SERVER_ROOT, fileName));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

// Nilai kosong ("KEY=") diperlakukan sama dengan tidak diisi agar default berlaku.
const optional = (schema) => z.preprocess((value) => (value === '' ? undefined : value), schema);
const integer = (min, max, fallback) => optional(z.coerce.number().int().min(min).max(max).default(fallback));
const flag = (fallback) => optional(z.stringbool().default(fallback));

/**
 * Skema bawaan PostgreSQL/Supabase yang tidak boleh dipakai sebagai skema aplikasi.
 * "public" di Supabase otomatis dibuka lewat Data API (PostgREST), dan skema lain
 * dikelola Supabase sendiri — db:reset menghapus skema aplikasi beserta isinya.
 */
const RESERVED_SCHEMA = /^(public|information_schema|pg_.*|auth|storage|realtime|extensions|graphql|graphql_public|vault|net|cron|pgbouncer|pgsodium.*|supabase.*)$/;
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const EnvSchema = z.object({
  NODE_ENV: optional(z.enum(['development', 'test', 'production']).default('development')),
  HOST: optional(z.string().min(1).default('127.0.0.1')),
  PORT: integer(1, 65535, 4000),
  TRUST_PROXY: optional(z.string().default('false')),
  CORS_ORIGINS: optional(z.string().default('http://localhost:5173')),

  DB_HOST: optional(z.string().min(1).default('127.0.0.1')),
  DB_PORT: integer(1, 65535, 5432),
  DB_NAME: optional(
    z
      .string()
      .regex(/^[A-Za-z0-9_]{1,63}$/, 'DB_NAME hanya boleh berisi huruf, angka, dan garis bawah.')
      .default('postgres'),
  ),
  DB_SCHEMA: optional(
    z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,62}$/, 'DB_SCHEMA hanya boleh berisi huruf kecil, angka, dan garis bawah (diawali huruf).')
      .refine((name) => !RESERVED_SCHEMA.test(name), 'DB_SCHEMA tidak boleh memakai skema bawaan PostgreSQL/Supabase (mis. public, auth).')
      .default('eosis'),
  ),
  DB_USER: z.string({ error: 'DB_USER wajib diisi.' }).min(1, 'DB_USER wajib diisi.'),
  DB_PASSWORD: z.string().default(''),
  DB_SSL: optional(z.enum(['disable', 'require', 'verify-full'], { error: 'DB_SSL harus disable, require, atau verify-full.' }).optional()),
  DB_SSL_CA: optional(z.string().optional()),
  DB_CONNECTION_LIMIT: integer(1, 100, 10),

  COOKIE_SECURE: optional(z.stringbool().optional()),
  SESSION_IDLE_MINUTES: integer(5, 24 * 60, 30),
  SESSION_ABSOLUTE_HOURS: integer(1, 72, 8),

  LOGIN_RATE_LIMIT_MAX: integer(1, 100_000, 10),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: integer(1, 24 * 60, 15),
  VOTE_RATE_LIMIT_MAX: integer(1, 100_000, 60),
  VOTE_RATE_LIMIT_WINDOW_MINUTES: integer(1, 24 * 60, 1),
  API_RATE_LIMIT_MAX: integer(1, 1_000_000, 600),

  NISN_PATTERN: optional(z.string().default('^[0-9]{10}$')),

  UPLOAD_DIR: optional(z.string().default('uploads')),
  UPLOAD_MAX_MB: integer(1, 10, 2),

  SERVE_CLIENT: flag(false),
  CLIENT_DIST_DIR: optional(z.string().default('../client/dist')),
  LOG_REQUESTS: optional(z.stringbool().optional()),
});

function parseTrustProxy(raw) {
  const value = raw.trim();
  if (value === 'false' || value === '0') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value; // contoh: "loopback" atau daftar IP/subnet dipisah koma
}

function compileNisnPattern(source) {
  let regex;
  try {
    regex = new RegExp(source);
  } catch {
    throw new Error(`NISN_PATTERN bukan regular expression yang valid: ${source}`);
  }
  if (!source.startsWith('^') || !source.endsWith('$')) {
    throw new Error('NISN_PATTERN harus diawali "^" dan diakhiri "$" agar seluruh NISN divalidasi.');
  }
  return regex;
}

/** Membangun objek konfigurasi tervalidasi dari environment. Gagal cepat jika tidak valid. */
export function buildConfig(env = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Konfigurasi environment tidak valid:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const corsOrigins = e.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (isProduction && corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGINS tidak boleh "*" di production karena cookie sesi admin dikirim lintas origin.');
  }

  const cookieSecure = e.COOKIE_SECURE ?? isProduction;

  return Object.freeze({
    env: e.NODE_ENV,
    isProduction,
    isTest: e.NODE_ENV === 'test',
    host: e.HOST,
    port: e.PORT,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    corsOrigins,
    db: Object.freeze({
      host: e.DB_HOST,
      port: e.DB_PORT,
      database: e.DB_NAME,
      schema: e.DB_SCHEMA,
      user: e.DB_USER,
      password: e.DB_PASSWORD,
      connectionLimit: e.DB_CONNECTION_LIMIT,
      // Supabase (dan PostgreSQL jarak jauh lain) wajib terenkripsi; PostgreSQL lokal biasanya tanpa SSL.
      ssl: Object.freeze({
        mode: e.DB_SSL ?? (LOCAL_DB_HOSTS.has(e.DB_HOST) ? 'disable' : 'require'),
        caPath: e.DB_SSL_CA ? path.resolve(SERVER_ROOT, e.DB_SSL_CA) : null,
      }),
    }),
    session: Object.freeze({
      // Prefiks __Host- hanya diterima browser bila cookie Secure (HTTPS), Path=/, tanpa Domain.
      cookieName: cookieSecure ? '__Host-eosis_sid' : 'eosis_sid',
      cookieSecure,
      idleMinutes: e.SESSION_IDLE_MINUTES,
      absoluteHours: e.SESSION_ABSOLUTE_HOURS,
    }),
    rateLimit: Object.freeze({
      login: Object.freeze({ max: e.LOGIN_RATE_LIMIT_MAX, windowMs: e.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000 }),
      vote: Object.freeze({ max: e.VOTE_RATE_LIMIT_MAX, windowMs: e.VOTE_RATE_LIMIT_WINDOW_MINUTES * 60_000 }),
      api: Object.freeze({ max: e.API_RATE_LIMIT_MAX, windowMs: 60_000 }),
    }),
    nisnPattern: compileNisnPattern(e.NISN_PATTERN),
    uploads: Object.freeze({
      dir: path.resolve(SERVER_ROOT, e.UPLOAD_DIR),
      maxBytes: e.UPLOAD_MAX_MB * 1024 * 1024,
    }),
    client: Object.freeze({
      serve: e.SERVE_CLIENT,
      distDir: path.resolve(SERVER_ROOT, e.CLIENT_DIST_DIR),
    }),
    logRequests: e.LOG_REQUESTS ?? e.NODE_ENV !== 'test',
  });
}

let cachedConfig;

/** Konfigurasi aplikasi (dimuat sekali per proses). */
export function getConfig() {
  if (!cachedConfig) {
    loadEnvFile();
    cachedConfig = buildConfig();
  }
  return cachedConfig;
}
