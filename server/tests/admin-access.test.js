import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { countRows, resetDatabase, sql } from './helpers/db.js';
import { createAdmin, createCandidate, createElection } from './helpers/factories.js';
import { buildApp, loginAs } from './helpers/http.js';

const app = buildApp();
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

let election;
let candidate;

beforeEach(async () => {
  await resetDatabase();
  election = await createElection({ status: 'draft' });
  candidate = await createCandidate(election.id, 1);
});

/** Seluruh endpoint administratif beserta body contoh yang valid. */
function adminEndpoints() {
  const future = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();
  return [
    { method: 'get', path: '/api/admin/dashboard' },
    { method: 'get', path: '/api/admin/elections' },
    { method: 'get', path: `/api/admin/elections/${election.id}` },
    { method: 'get', path: `/api/admin/elections/${election.id}/candidates` },
    { method: 'get', path: `/api/admin/elections/${election.id}/results` },
    { method: 'get', path: `/api/admin/elections/${election.id}/audit-logs` },
    { method: 'get', path: '/api/admin/audit-logs' },
    {
      method: 'post',
      path: '/api/admin/elections',
      body: { title: 'Pemilihan Baru', startAt: future(24), endAt: future(30) },
      mutates: true,
    },
    { method: 'patch', path: `/api/admin/elections/${election.id}`, body: { title: 'Judul Diubah Orang' }, mutates: true },
    { method: 'patch', path: `/api/admin/elections/${election.id}`, body: { startAt: future(2), endAt: future(5) }, mutates: true },
    { method: 'patch', path: `/api/admin/elections/${election.id}`, body: { status: 'active', endAt: future(5) }, mutates: true },
    { method: 'patch', path: `/api/admin/elections/${election.id}`, body: { resultsPublic: true }, mutates: true },
    { method: 'delete', path: `/api/admin/elections/${election.id}`, mutates: true },
    {
      method: 'post',
      path: `/api/admin/elections/${election.id}/candidates`,
      body: {
        candidateNumber: 2,
        chairpersonName: 'Calon Ketua',
        viceChairpersonName: 'Calon Wakil',
        vision: 'Visi yang cukup panjang.',
        mission: 'Misi yang cukup panjang.',
      },
      mutates: true,
    },
    { method: 'patch', path: `/api/admin/candidates/${candidate.id}`, body: { chairpersonName: 'Nama Palsu' }, mutates: true },
    { method: 'delete', path: `/api/admin/candidates/${candidate.id}`, mutates: true },
    { method: 'put', path: `/api/admin/candidates/${candidate.id}/photo`, file: true, mutates: true },
  ];
}

function send(client, endpoint, csrfToken) {
  let req = client[endpoint.method](endpoint.path);
  if (csrfToken) req = req.set('X-CSRF-Token', csrfToken);
  if (endpoint.file) return req.attach('photo', PNG, { filename: 'foto.png', contentType: 'image/png' });
  return endpoint.body ? req.send(endpoint.body) : req;
}

async function snapshot() {
  return {
    elections: await sql('SELECT id, title, status, start_at, end_at, results_public FROM elections ORDER BY id'),
    candidates: await sql('SELECT id, chairperson_name, photo_url FROM candidates ORDER BY id'),
  };
}

describe('[9] pengguna tanpa autentikasi tidak dapat mengakses endpoint admin', () => {
  it('setiap endpoint admin mengembalikan 401 dan data tidak berubah', async () => {
    const before = await snapshot();
    for (const endpoint of adminEndpoints()) {
      const response = await send(request(app), endpoint);
      expect(response.status, `${endpoint.method.toUpperCase()} ${endpoint.path}`).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }
    expect(await snapshot()).toEqual(before);
  });
});

describe('[10] pengguna biasa (peran pengawas) tidak dapat mengelola jadwal dan kandidat', () => {
  it('semua aksi yang mengubah data ditolak 403, data tidak berubah', async () => {
    const observer = await createAdmin({ role: 'observer' });
    const { agent, csrfToken } = await loginAs(app, observer);
    const before = await snapshot();

    for (const endpoint of adminEndpoints().filter((item) => item.mutates)) {
      const response = await send(agent, endpoint, csrfToken);
      expect(response.status, `${endpoint.method.toUpperCase()} ${endpoint.path}`).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
    expect(await snapshot()).toEqual(before);
    expect(await countRows('audit_logs', "action LIKE 'election.%' OR action LIKE 'candidate.%'")).toBe(0);
  });

  it('pengawas tetap dapat melihat dashboard, hasil sementara, dan audit log', async () => {
    const observer = await createAdmin({ role: 'observer' });
    const { agent } = await loginAs(app, observer);
    for (const endpoint of adminEndpoints().filter((item) => !item.mutates)) {
      const response = await send(agent, endpoint);
      expect(response.status, `${endpoint.method.toUpperCase()} ${endpoint.path}`).toBe(200);
    }
  });

  it('admin (panitia) diizinkan melakukan aksi yang sama', async () => {
    const admin = await createAdmin({ role: 'admin' });
    const { agent, csrfToken } = await loginAs(app, admin);
    const response = await send(agent, adminEndpoints().find((item) => item.method === 'post'), csrfToken);
    expect(response.status).toBe(201);
  });
});

describe('Proteksi CSRF pada endpoint admin', () => {
  it('request yang mengubah data tanpa/ dengan token CSRF salah ditolak', async () => {
    const admin = await createAdmin();
    const { agent } = await loginAs(app, admin);
    const endpoint = { method: 'patch', path: `/api/admin/elections/${election.id}`, body: { title: 'Judul Diubah CSRF' } };

    const missing = await send(agent, endpoint);
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('CSRF_INVALID');
    expect((await send(agent, endpoint, 'x'.repeat(43))).status).toBe(403);

    const [row] = await sql('SELECT title FROM elections WHERE id = $1', [election.id]);
    expect(row.title).toBe(election.title);
  });

  it('CORS hanya mengizinkan origin yang terdaftar', async () => {
    const allowed = await request(app).options('/api/auth/login').set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const blocked = await request(app).options('/api/auth/login').set('Origin', 'https://situs-jahat.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
