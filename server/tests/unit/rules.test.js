import { describe, expect, it } from 'vitest';
import { roleFromLogin, scramSha256Verifier } from '../../scripts/lib/db-admin.js';
import { applyPasswordKeys } from '../../scripts/lib/passwords.js';
import { buildConfig } from '../../src/config/env.js';
import { hasPermission, permissionsFor } from '../../src/config/permissions.js';
import { detectImageType } from '../../src/services/upload.service.js';
import { timelineBucketSeconds } from '../../src/services/results.service.js';
import { allowedTransitions, canTransition, computeElectionPhase, resultsArePublic } from '../../src/utils/electionRules.js';
import { redact } from '../../src/utils/logger.js';
import { createNisnValidator, normalizeNisn } from '../../src/utils/nisn.js';
import { sanitizeMetadata } from '../../src/utils/sanitize.js';
import { validatePasswordPolicy } from '../../src/utils/security.js';
import { createVoteSchema } from '../../src/validators/vote.validators.js';

const HOUR = 3_600_000;

describe('Aturan NISN', () => {
  const national = createNisnValidator(/^[0-9]{10}$/);
  it('menerima tepat 10 digit, termasuk yang diawali nol', () => {
    expect(national('0012345678')).toBe(true);
    expect(national('1234567890')).toBe(true);
  });
  it('menolak panjang/karakter yang salah dan tipe non-string', () => {
    for (const value of ['123456789', '12345678901', '12345abcde', '', 1234567890, null]) expect(national(value)).toBe(false);
  });
  it('pola sekolah hanya bisa memperketat aturan nasional', () => {
    const school = createNisnValidator(/^01[0-4][0-9]{7}$/);
    expect(school('0121234567')).toBe(true);
    expect(school('0091234567')).toBe(false);
    expect(createNisnValidator(/^.*$/)('123')).toBe(false);
  });
  it('menghapus spasi yang tidak sengaja diketik', () => {
    expect(normalizeNisn(' 0012 345 678 ')).toBe('0012345678');
  });
  it('skema voting menolak NISN numerik dan field tambahan', () => {
    const schema = createVoteSchema(/^[0-9]{10}$/);
    const candidateId = '3f1c1d2e-8b4a-4c3d-9e2f-1a2b3c4d5e6f';
    expect(schema.safeParse({ nisn: '0012345678', candidateId }).success).toBe(true);
    expect(schema.safeParse({ nisn: 12345678, candidateId }).success).toBe(false);
    expect(schema.safeParse({ nisn: '0012345678', candidateId, status: 'completed' }).success).toBe(false);
  });
});

describe('Fase & transisi status pemilihan', () => {
  const now = new Date('2026-10-20T03:00:00Z');
  const window = { startAt: new Date(now.getTime() - HOUR), endAt: new Date(now.getTime() + HOUR) };

  it.each([
    ['draft', window, 'draft'],
    ['scheduled', window, 'upcoming'],
    ['completed', window, 'completed'],
    ['active', window, 'open'],
    ['active', { startAt: new Date(now.getTime() + HOUR), endAt: new Date(now.getTime() + 2 * HOUR) }, 'upcoming'],
    ['active', { startAt: new Date(now.getTime() - 2 * HOUR), endAt: now }, 'closed'],
  ])('status %s → fase sesuai', (status, schedule, phase) => {
    expect(computeElectionPhase({ status, ...schedule }, now)).toBe(phase);
  });

  it('transisi yang diizinkan eksplisit; completed bersifat final', () => {
    expect(canTransition('draft', 'active')).toBe(true);
    expect(canTransition('active', 'draft')).toBe(false);
    expect(canTransition('active', 'scheduled')).toBe(false);
    expect(allowedTransitions('completed')).toEqual([]);
  });

  it('hasil publik hanya untuk pemilihan selesai yang dipublikasikan', () => {
    expect(resultsArePublic({ status: 'completed', resultsPublic: true })).toBe(true);
    expect(resultsArePublic({ status: 'completed', resultsPublic: false })).toBe(false);
    expect(resultsArePublic({ status: 'active', resultsPublic: true })).toBe(false);
  });

  it('interval grafik partisipasi menyesuaikan durasi', () => {
    const at = (hours) => ({ startAt: new Date(0), endAt: new Date(hours * HOUR) });
    expect(timelineBucketSeconds(at(5))).toBe(900);
    expect(timelineBucketSeconds(at(24))).toBe(3600);
    expect(timelineBucketSeconds(at(24 * 7))).toBe(86400);
  });
});

describe('Izin peran', () => {
  it('pengawas hanya memiliki izin baca', () => {
    expect(hasPermission('observer', 'results:view-interim')).toBe(true);
    expect(hasPermission('observer', 'elections:manage')).toBe(false);
    expect(hasPermission('observer', 'candidates:manage')).toBe(false);
    expect(permissionsFor('observer').every((permission) => /view/.test(permission))).toBe(true);
  });
  it('peran tidak dikenal tidak memiliki izin apa pun', () => {
    expect(hasPermission('student', 'dashboard:view')).toBe(false);
    expect(permissionsFor(undefined)).toEqual([]);
  });
});

describe('Sanitasi & privasi log', () => {
  it('membuang kunci sensitif dan menyamarkan nilai berpola NISN', () => {
    const result = sanitizeMetadata({
      title: 'Pemilihan',
      password: 'rahasia',
      passwordHash: '$argon2id$...',
      csrfToken: 'abc',
      nisn: '0012345678',
      nested: { note: '0012345678', ok: 5, sessionId: 'x' },
    });
    expect(result).toEqual({ title: 'Pemilihan', nested: { note: '[REDACTED]', ok: 5 } });
  });
  it('memotong teks yang sangat panjang', () => {
    expect(sanitizeMetadata({ text: 'a'.repeat(1000) }).text.length).toBeLessThan(310);
  });
  it('logger menyamarkan deretan 10 digit', () => {
    expect(redact('Key (election_id, nisn)=(abc, 0012345678) already exists.')).toBe(
      'Key (election_id, nisn)=(abc, [REDACTED]) already exists.',
    );
  });
});

describe('Keamanan lain', () => {
  it('prompt password CLI: tampil "*", Backspace menghapus, tombol kontrol diabaikan', () => {
    let state = applyPasswordKeys('', 'Rahasia1');
    expect(state).toEqual({ value: 'Rahasia1', echo: '********' });
    state = applyPasswordKeys(state.value, '\u007f\u0016'); // Backspace lalu Ctrl+V mentah
    expect(state).toEqual({ value: 'Rahasia', echo: '\b \b' });
    expect(applyPasswordKeys('Rahasia', '\u001b[D').value).toBe('Rahasia'); // panah kiri
    expect(applyPasswordKeys('', '\b').echo).toBe(''); // Backspace saat kosong
    expect(applyPasswordKeys('Rahasia', '2026\r')).toEqual({ value: 'Rahasia2026', echo: '****', done: 'enter' });
    expect(applyPasswordKeys('abc', '\u0003').done).toBe('cancel');
    // --show: karakter terlihat apa adanya.
    expect(applyPasswordKeys('', 'Rahasia1', { mask: false })).toEqual({ value: 'Rahasia1', echo: 'Rahasia1' });
  });

  it('kebijakan password admin', () => {
    expect(validatePasswordPolicy('pendek1')).not.toEqual([]);
    expect(validatePasswordPolicy('hanyahurufsaja')).not.toEqual([]);
    expect(validatePasswordPolicy('PasswordKuat2026')).toEqual([]);
  });
  it('deteksi gambar berdasarkan magic bytes, bukan ekstensi', () => {
    expect(detectImageType(Buffer.from('ffd8ffe000104a464946', 'hex'))?.contentType).toBe('image/jpeg');
    expect(detectImageType(Buffer.from('89504e470d0a1a0a00000000', 'hex'))?.contentType).toBe('image/png');
    expect(detectImageType(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'binary'))?.contentType).toBe('image/webp');
    expect(detectImageType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a......'))).toBeNull();
  });
  it('konfigurasi: gagal cepat untuk nilai berbahaya', () => {
    const base = { DB_USER: 'app', NODE_ENV: 'production' };
    expect(() => buildConfig({ ...base, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
    expect(() => buildConfig({ ...base, NISN_PATTERN: '[0-9]{10}' })).toThrow(/NISN_PATTERN/);
    expect(() => buildConfig({ NODE_ENV: 'development' })).toThrow(/DB_USER/);
    const config = buildConfig({ ...base, CORS_ORIGINS: 'https://osis.sekolah.sch.id' });
    expect(config.session.cookieSecure).toBe(true);
    expect(config.session.cookieName).toBe('__Host-eosis_sid');
    // Prefiks __Host- mensyaratkan Secure; tanpa HTTPS nama cookie biasa dipakai.
    const insecure = buildConfig({ ...base, CORS_ORIGINS: 'https://osis.sekolah.sch.id', COOKIE_SECURE: 'false' });
    expect(insecure.session.cookieName).toBe('eosis_sid');
  });
});

describe('Konfigurasi PostgreSQL / Supabase', () => {
  const base = { DB_USER: 'eosis_app', NODE_ENV: 'development' };

  it('skema aplikasi bawaan "eosis"; skema bawaan PostgreSQL/Supabase ditolak', () => {
    expect(buildConfig(base).db.schema).toBe('eosis');
    for (const schema of ['public', 'auth', 'storage', 'pg_catalog', 'information_schema', 'Eosis', 'eosis-uji', '1eosis']) {
      expect(() => buildConfig({ ...base, DB_SCHEMA: schema }), schema).toThrow(/DB_SCHEMA/);
    }
  });

  it('SSL: mati untuk host lokal, wajib (require) untuk host jarak jauh seperti Supabase', () => {
    expect(buildConfig({ ...base, DB_HOST: 'localhost' }).db.ssl.mode).toBe('disable');
    expect(buildConfig({ ...base, DB_HOST: 'aws-0-ap-southeast-1.pooler.supabase.com' }).db.ssl.mode).toBe('require');
    expect(buildConfig({ ...base, DB_HOST: 'localhost', DB_SSL: 'verify-full' }).db.ssl.mode).toBe('verify-full');
    expect(() => buildConfig({ ...base, DB_SSL: 'prefer' })).toThrow(/DB_SSL/);
  });

  it('nama role diambil dari user pooler Supabase berformat role.project_ref', () => {
    expect(roleFromLogin('postgres.abcdefghijklmnop')).toBe('postgres');
    expect(roleFromLogin('eosis_app')).toBe('eosis_app');
    expect(() => roleFromLogin('Robert"; DROP ROLE x; --')).toThrow(/role/);
  });

  it('password akun aplikasi dikirim ke server sebagai verifier SCRAM, bukan teks biasa', () => {
    const verifier = scramSha256Verifier('RahasiaAplikasi2026');
    expect(verifier).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/);
    expect(verifier).not.toContain('RahasiaAplikasi2026');
    expect(scramSha256Verifier('RahasiaAplikasi2026')).not.toBe(verifier); // salt acak
  });
});
