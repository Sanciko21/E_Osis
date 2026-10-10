import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { countRows, resetDatabase, sql } from './helpers/db.js';
import { TEST_PASSWORD, createAdmin } from './helpers/factories.js';
import { buildApp, loginAs } from './helpers/http.js';

const app = buildApp();

beforeEach(resetDatabase);

function sessionCookie(response) {
  return (response.headers['set-cookie'] ?? []).find((cookie) => cookie.startsWith('eosis_sid='));
}

describe('Autentikasi admin', () => {
  it('login berhasil: cookie HttpOnly + SameSite=Strict, token sesi tidak ada di body', async () => {
    const admin = await createAdmin({ email: 'ketua@sekolah.test' });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'KETUA@Sekolah.test', password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({ id: admin.id, email: 'ketua@sekolah.test', role: 'admin' });
    expect(response.body.data.user.permissions).toContain('elections:manage');
    expect(response.body.data.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.body.data.user).not.toHaveProperty('passwordHash');

    const cookie = sessionCookie(response);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
    const token = cookie.split(';')[0].split('=')[1];
    expect(JSON.stringify(response.body)).not.toContain(token);

    // Database hanya menyimpan hash SHA-256 token, bukan token aslinya.
    const sessions = await sql('SELECT id FROM admin_sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toMatch(/^[0-9a-f]{64}$/);
    expect(sessions[0].id).not.toBe(token);
  });

  it('password disimpan sebagai hash Argon2id, bukan plaintext', async () => {
    await createAdmin({ email: 'hash@sekolah.test' });
    const [row] = await sql("SELECT password_hash FROM admin_users WHERE email = 'hash@sekolah.test'");
    expect(row.password_hash.startsWith('$argon2id$')).toBe(true);
    expect(row.password_hash).not.toContain(TEST_PASSWORD);
    await expect(
      sql("INSERT INTO admin_users (id, name, email, password_hash) VALUES (gen_random_uuid(), 'X', 'plain@sekolah.test', 'rahasia123')"),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chk_admin_users_hash' }); // check_violation
  });

  it('password salah, email tidak terdaftar, dan akun nonaktif mendapat pesan yang sama', async () => {
    await createAdmin({ email: 'aktif@sekolah.test' });
    await createAdmin({ email: 'nonaktif@sekolah.test', isActive: false });

    const attempts = await Promise.all([
      request(app).post('/api/auth/login').send({ email: 'aktif@sekolah.test', password: 'salah-password-1' }),
      request(app).post('/api/auth/login').send({ email: 'tidakada@sekolah.test', password: TEST_PASSWORD }),
      request(app).post('/api/auth/login').send({ email: 'nonaktif@sekolah.test', password: TEST_PASSWORD }),
    ]);
    for (const response of attempts) {
      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Email atau kata sandi salah.' });
      expect(sessionCookie(response)).toBeUndefined();
    }
    expect(await countRows('admin_sessions')).toBe(0);
    expect(await countRows('audit_logs', "action = 'auth.login_failed'")).toBe(3);
  });

  it('validasi input login', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: 'bukan-email', password: '' });
    expect(response.status).toBe(400);
    expect(response.body.error.details.map((detail) => detail.field).sort()).toEqual(['email', 'password']);
  });

  it('membatasi percobaan login yang gagal (HTTP 429)', async () => {
    const limitedApp = buildApp({ LOGIN_RATE_LIMIT_MAX: '3' });
    await createAdmin({ email: 'target@sekolah.test' });
    const attempt = () =>
      request(limitedApp).post('/api/auth/login').send({ email: 'target@sekolah.test', password: 'tebakan-salah-1' });
    for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('login ulang dari peramban yang sama mencabut sesi lama (rotasi sesi)', async () => {
    const admin = await createAdmin();
    const { agent } = await loginAs(app, admin);
    const [{ id: oldSessionId }] = await sql('SELECT id FROM admin_sessions');

    const again = await agent.post('/api/auth/login').send({ email: admin.email, password: admin.password });
    expect(again.status).toBe(200);
    const sessions = await sql('SELECT id FROM admin_sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).not.toBe(oldSessionId);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('GET /auth/me memulihkan sesi setelah refresh halaman (beserta token CSRF)', async () => {
    const admin = await createAdmin();
    const { agent, csrfToken } = await loginAs(app, admin);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(admin.email);
    expect(me.body.data.csrfToken).toBe(csrfToken);
  });

  it('logout wajib token CSRF, menghapus sesi, dan membuat cookie lama tidak berlaku', async () => {
    const admin = await createAdmin();
    const { agent, csrfToken } = await loginAs(app, admin);

    expect((await agent.post('/api/auth/logout')).status).toBe(403);
    const logout = await agent.post('/api/auth/logout').set('X-CSRF-Token', csrfToken);
    expect(logout.status).toBe(204);
    expect(await countRows('admin_sessions')).toBe(0);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect(await countRows('audit_logs', "action = 'auth.logout'")).toBe(1);
  });

  it('audit log login tidak memuat password', async () => {
    const admin = await createAdmin();
    await loginAs(app, admin);
    await request(app).post('/api/auth/login').send({ email: admin.email, password: 'password-salah-xyz' });
    const logs = await sql('SELECT metadata::text AS metadata FROM audit_logs');
    for (const log of logs) {
      expect(log.metadata).not.toContain(TEST_PASSWORD);
      expect(log.metadata).not.toContain('password-salah-xyz');
    }
  });
});

describe('Masa berlaku sesi', () => {
  it('sesi yang melewati batas idle ditolak (401 SESSION_EXPIRED)', async () => {
    const admin = await createAdmin();
    const { agent } = await loginAs(app, admin);
    await sql("UPDATE admin_sessions SET last_seen_at = now() - interval '2 hours'");
    const response = await agent.get('/api/admin/dashboard');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('sesi yang melewati batas absolut ditolak', async () => {
    const admin = await createAdmin();
    const { agent } = await loginAs(app, admin);
    await sql("UPDATE admin_sessions SET expires_at = now() - interval '1 minute'");
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('admin yang dinonaktifkan langsung kehilangan akses walau sesinya masih ada', async () => {
    const admin = await createAdmin();
    const { agent } = await loginAs(app, admin);
    await sql('UPDATE admin_users SET is_active = FALSE WHERE id = $1', [admin.id]);
    expect((await agent.get('/api/admin/dashboard')).status).toBe(401);
  });

  it('cookie palsu ditolak', async () => {
    const response = await request(app).get('/api/admin/dashboard').set('Cookie', 'eosis_sid=' + 'A'.repeat(43));
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });
});
