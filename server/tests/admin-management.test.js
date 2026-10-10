import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { getConfig } from '../src/config/env.js';
import { countRows, resetDatabase, sql } from './helpers/db.js';
import { createAdmin, createCandidate, createElection, createOpenElection, nextNisn } from './helpers/factories.js';
import { buildApp, loginAs, vote } from './helpers/http.js';

const app = buildApp();
const HOUR = 3_600_000;
const iso = (offsetHours) => new Date(Date.now() + offsetHours * HOUR).toISOString();
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201c56a3a0f0000000049454e44ae426082',
  'hex',
);

let session;
const api = {
  get: (url) => session.agent.get(url),
  post: (url, body) => session.agent.post(url).set('X-CSRF-Token', session.csrfToken).send(body),
  patch: (url, body) => session.agent.patch(url).set('X-CSRF-Token', session.csrfToken).send(body),
  delete: (url) => session.agent.delete(url).set('X-CSRF-Token', session.csrfToken),
};

const candidateBody = (number, extra = {}) => ({
  candidateNumber: number,
  chairpersonName: `Ketua Calon ${number}`,
  viceChairpersonName: `Wakil Calon ${number}`,
  vision: 'Visi untuk sekolah yang lebih baik.',
  mission: 'Misi pertama.\nMisi kedua.',
  ...extra,
});

beforeEach(async () => {
  await resetDatabase();
  session = await loginAs(app, await createAdmin());
});

describe('Manajemen pemilihan & jadwal', () => {
  it('membuat pemilihan baru selalu berstatus draft dan tercatat di audit log', async () => {
    const response = await api.post('/api/admin/elections', {
      title: '  Pemilihan Ketua OSIS 2026  ',
      description: 'Periode 2026/2027',
      startAt: iso(24),
      endAt: iso(30),
      eligibleVoterCount: 450,
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      title: 'Pemilihan Ketua OSIS 2026',
      status: 'draft',
      resultsPublic: false,
      eligibleVoterCount: 450,
      allowedTransitions: ['scheduled', 'active'],
    });
    const [log] = await sql("SELECT admin_user_id, election_id FROM audit_logs WHERE action = 'election.created'");
    expect(log.admin_user_id).toBe(session.user.id);
    expect(log.election_id).toBe(response.body.data.id);
  });

  it('validasi: jadwal terbalik, judul pendek, dan field asing ditolak', async () => {
    const reversed = await api.post('/api/admin/elections', { title: 'Pemilihan Uji', startAt: iso(5), endAt: iso(2) });
    expect(reversed.status).toBe(400);
    expect(reversed.body.error.details).toContainEqual({ field: 'endAt', message: 'Waktu selesai harus setelah waktu mulai.' });
    expect((await api.post('/api/admin/elections', { title: 'Abc', startAt: iso(1), endAt: iso(2) })).status).toBe(400);
    expect(
      (await api.post('/api/admin/elections', { title: 'Pemilihan Uji', startAt: iso(1), endAt: iso(2), status: 'active' }))
        .status,
    ).toBe(400);
    expect(await countRows('elections')).toBe(0);
  });

  it('alur status: draft → scheduled → active → completed, dengan audit log', async () => {
    const election = await createElection({ status: 'draft', startAt: new Date(Date.now() - HOUR), endAt: new Date(Date.now() + HOUR) });
    const url = `/api/admin/elections/${election.id}`;

    expect((await api.patch(url, { status: 'scheduled' })).body.data.status).toBe('scheduled');
    const noCandidate = await api.patch(url, { status: 'active' });
    expect(noCandidate.status).toBe(409);
    expect(noCandidate.body.error.code).toBe('NO_CANDIDATES');

    await createCandidate(election.id, 1);
    const opened = await api.patch(url, { status: 'active' });
    expect(opened.status).toBe(200);
    expect(opened.body.data).toMatchObject({ status: 'active', phase: 'open', votingOpen: true, candidatesEditable: false });

    const backToDraft = await api.patch(url, { status: 'draft' });
    expect(backToDraft.status).toBe(409);
    expect(backToDraft.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    expect((await api.patch(url, { status: 'completed' })).body.data.status).toBe('completed');
    expect((await api.patch(url, { status: 'active' })).status).toBe(409);

    const transitions = await sql(
      "SELECT metadata->>'to' AS next FROM audit_logs WHERE action = 'election.status_changed' ORDER BY id",
    );
    expect(transitions.map((row) => row.next)).toEqual(['scheduled', 'active', 'completed']);
  });

  it('database menjamin hanya ada satu pemilihan aktif', async () => {
    await createOpenElection();
    const second = await createElection({ status: 'scheduled', title: 'Pemilihan Kedua' });
    await createCandidate(second.id, 1);
    const response = await api.patch(`/api/admin/elections/${second.id}`, { status: 'active' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ANOTHER_ELECTION_ACTIVE');
  });

  it('pemilihan dengan waktu selesai yang sudah lewat tidak bisa dibuka', async () => {
    const election = await createElection({
      status: 'draft',
      startAt: new Date(Date.now() - 3 * HOUR),
      endAt: new Date(Date.now() - HOUR),
    });
    await createCandidate(election.id, 1);
    const response = await api.patch(`/api/admin/elections/${election.id}`, { status: 'active' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SCHEDULE_INVALID');
  });

  it('saat aktif: waktu mulai dikunci, waktu selesai boleh diperpanjang', async () => {
    const { election } = await createOpenElection();
    const url = `/api/admin/elections/${election.id}`;
    const locked = await api.patch(url, { startAt: iso(-5) });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('ELECTION_LOCKED');
    const extended = await api.patch(url, { endAt: iso(3) });
    expect(extended.status).toBe(200);
    expect(new Date(extended.body.data.endAt).getTime()).toBeGreaterThan(Date.now() + 2 * HOUR);
    const past = await api.patch(url, { endAt: iso(-0.1) });
    expect(past.status).toBe(409);
  });

  it('pengaturan publikasi hasil tercatat di audit log', async () => {
    const { election } = await createOpenElection({ status: 'completed' });
    const response = await api.patch(`/api/admin/elections/${election.id}`, { resultsPublic: true });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ resultsPublic: true, resultsAvailable: true });
    expect(await countRows('audit_logs', "action = 'election.results_visibility_changed'")).toBe(1);
  });

  it('hanya pemilihan draft/terjadwal yang boleh dihapus (beserta kandidatnya)', async () => {
    const draft = await createElection({ status: 'draft' });
    await createCandidate(draft.id, 1);
    expect((await api.delete(`/api/admin/elections/${draft.id}`)).status).toBe(204);
    expect(await countRows('candidates')).toBe(0);
    expect(await countRows('audit_logs', "action = 'election.deleted'")).toBe(1);

    const { election, candidates } = await createOpenElection();
    await vote(app, election.id, { nisn: nextNisn(), candidateId: candidates[0].id }).expect(201);
    const active = await api.delete(`/api/admin/elections/${election.id}`);
    expect(active.status).toBe(409);
    await sql("UPDATE elections SET status = 'completed' WHERE id = $1", [election.id]);
    expect((await api.delete(`/api/admin/elections/${election.id}`)).status).toBe(409);
    expect(await countRows('votes')).toBe(1);
  });

  it('daftar pemilihan menyertakan jumlah kandidat & pemilih, dengan pagination', async () => {
    const { election, candidates } = await createOpenElection({ candidates: 3 });
    await vote(app, election.id, { nisn: nextNisn(), candidateId: candidates[0].id }).expect(201);
    await createElection({ status: 'draft', title: 'Pemilihan Draft' });
    const response = await api.get('/api/admin/elections?page=1&pageSize=1');
    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(response.body.data[0]).toMatchObject({ id: election.id, candidateCount: 3, voterCount: 1 });
  });
});

describe('CRUD pasangan calon', () => {
  it('membuat, mengubah, dan menghapus pasangan calon pada pemilihan draft', async () => {
    const election = await createElection({ status: 'draft' });
    const created = await api.post(`/api/admin/elections/${election.id}/candidates`, candidateBody(1));
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const duplicate = await api.post(`/api/admin/elections/${election.id}/candidates`, candidateBody(1));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CANDIDATE_NUMBER_TAKEN');

    const updated = await api.patch(`/api/admin/candidates/${id}`, { viceChairpersonName: 'Wakil Diperbarui' });
    expect(updated.body.data.viceChairpersonName).toBe('Wakil Diperbarui');

    const list = await api.get(`/api/admin/elections/${election.id}/candidates`);
    expect(list.body.data).toHaveLength(1);

    expect((await api.delete(`/api/admin/candidates/${id}`)).status).toBe(204);
    expect(await countRows('candidates')).toBe(0);
    const actions = await sql("SELECT action FROM audit_logs WHERE entity_type = 'candidate' ORDER BY id");
    expect(actions.map((row) => row.action)).toEqual(['candidate.created', 'candidate.updated', 'candidate.deleted']);
  });

  it('data kandidat dikunci setelah pemungutan suara dibuka', async () => {
    const { election, candidates } = await createOpenElection();
    const attempts = [
      await api.post(`/api/admin/elections/${election.id}/candidates`, candidateBody(3)),
      await api.patch(`/api/admin/candidates/${candidates[0].id}`, { chairpersonName: 'Nama Baru' }),
      await api.delete(`/api/admin/candidates/${candidates[1].id}`),
    ];
    for (const response of attempts) {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ELECTION_LOCKED');
    }
    expect(await countRows('candidates')).toBe(2);
  });

  it('URL foto hanya https:// atau hasil upload; skema berbahaya ditolak', async () => {
    const election = await createElection({ status: 'draft' });
    const url = `/api/admin/elections/${election.id}/candidates`;
    for (const photoUrl of ['javascript:alert(1)', 'http://contoh.test/a.jpg', 'data:image/png;base64,AAAA']) {
      expect((await api.post(url, candidateBody(1, { photoUrl }))).status).toBe(400);
    }
    expect((await api.post(url, candidateBody(1, { photoUrl: 'https://cdn.sekolah.test/foto.jpg' }))).status).toBe(201);
  });

  it('upload foto: hanya gambar asli (dicek dari isi file), dengan batas ukuran', async () => {
    const election = await createElection({ status: 'draft' });
    const candidate = await createCandidate(election.id, 1);
    const url = `/api/admin/candidates/${candidate.id}/photo`;
    const upload = (buffer, filename, contentType) =>
      session.agent.put(url).set('X-CSRF-Token', session.csrfToken).attach('photo', buffer, { filename, contentType });

    const fake = await upload(Buffer.from('<script>alert(1)</script>'), 'foto.png', 'image/png');
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_IMAGE');

    const tooBig = await upload(Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]), 'besar.png', 'image/png');
    expect(tooBig.status).toBe(413);

    const ok = await upload(PNG, 'foto.png', 'image/png');
    expect(ok.status).toBe(200);
    const photoUrl = ok.body.data.photoUrl;
    expect(photoUrl).toMatch(/^\/uploads\/candidates\/[0-9a-f-]{36}\.png$/);

    const served = await request(app).get(photoUrl);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');

    // Foto lama dihapus saat diganti.
    const filePath = path.join(getConfig().uploads.dir, 'candidates', path.basename(photoUrl));
    expect(fs.existsSync(filePath)).toBe(true);
    const replaced = await upload(PNG, 'baru.png', 'image/png');
    expect(replaced.status).toBe(200);
    expect(fs.existsSync(filePath)).toBe(false);

    await api.delete(`/api/admin/candidates/${candidate.id}`).expect(204);
    expect(fs.existsSync(path.join(getConfig().uploads.dir, 'candidates', path.basename(replaced.body.data.photoUrl)))).toBe(false);
  });
});

describe('Audit log', () => {
  it('dapat difilter per pemilihan dan dipaginasi', async () => {
    const election = await createElection({ status: 'draft' });
    for (let i = 1; i <= 3; i += 1) await api.post(`/api/admin/elections/${election.id}/candidates`, candidateBody(i));
    await api.patch(`/api/admin/elections/${election.id}`, { title: 'Judul Baru Pemilihan' });

    const response = await api.get(`/api/admin/elections/${election.id}/audit-logs?pageSize=2`);
    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 4, totalPages: 2 });
    expect(response.body.data[0]).toMatchObject({ action: 'election.updated', admin: { id: session.user.id } });
    expect(response.body.data[0].metadata.changes.title.to).toBe('Judul Baru Pemilihan');

    const all = await api.get('/api/admin/audit-logs');
    expect(all.body.data.some((log) => log.action === 'auth.login_success')).toBe(true);
  });
});
