import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../src/config/database.js';
import { getAdminDbSettings, isSharedPrivilegedAccount } from '../scripts/lib/db-admin.js';
import { countRows, installFailingTrigger, resetDatabase, sql } from './helpers/db.js';
import { createAdmin, createOpenElection, nextNisn } from './helpers/factories.js';
import { buildApp, loginAs, vote } from './helpers/http.js';

const app = buildApp();

beforeEach(resetDatabase);

async function electionWithVotes() {
  const fixture = await createOpenElection();
  const nisns = [nextNisn(), nextNisn(), nextNisn()];
  for (const [index, nisn] of nisns.entries()) {
    await vote(app, fixture.election.id, { nisn, candidateId: fixture.candidates[index % 2].id }).expect(201);
  }
  return { ...fixture, nisns };
}

describe('[11] pengguna publik tidak dapat membaca NISN atau mengubah suara', () => {
  it('tidak ada endpoint publik yang mengembalikan NISN', async () => {
    const { election, nisns } = await electionWithVotes();
    const paths = [
      '/api/elections/current',
      '/api/elections/active',
      `/api/elections/${election.id}`,
      `/api/elections/${election.id}/candidates`,
      `/api/elections/${election.id}/results`,
    ];
    for (const path of paths) {
      const response = await request(app).get(path);
      const text = JSON.stringify(response.body);
      for (const nisn of nisns) expect(text, path).not.toContain(nisn);
    }
  });

  it('API admin pun tidak pernah mengembalikan NISN atau pilihan per pemilih', async () => {
    const { election, nisns } = await electionWithVotes();
    const { agent } = await loginAs(app, await createAdmin());
    const paths = [
      '/api/admin/dashboard',
      '/api/admin/elections',
      `/api/admin/elections/${election.id}`,
      `/api/admin/elections/${election.id}/results`,
      `/api/admin/elections/${election.id}/audit-logs`,
      '/api/admin/audit-logs',
    ];
    for (const path of paths) {
      const response = await agent.get(path).expect(200);
      const text = JSON.stringify(response.body);
      for (const nisn of nisns) expect(text, path).not.toContain(nisn);
    }
  });

  it('tidak ada endpoint untuk mengubah, menghapus, atau membaca suara secara langsung', async () => {
    const { election } = await electionWithVotes();
    const { agent, csrfToken } = await loginAs(app, await createAdmin());
    const attempts = [
      request(app).get(`/api/elections/${election.id}/vote`),
      request(app).put(`/api/elections/${election.id}/vote`).send({ nisn: '0012345678' }),
      request(app).patch(`/api/elections/${election.id}/vote`).send({ candidateId: 'x' }),
      request(app).delete(`/api/elections/${election.id}/vote`),
      request(app).get('/api/votes'),
      request(app).delete('/api/votes'),
      request(app).get(`/api/elections/${election.id}/votes`),
      request(app).get(`/api/elections/${election.id}/participation`),
      agent.get(`/api/admin/elections/${election.id}/votes`),
      agent.delete(`/api/admin/elections/${election.id}/votes`).set('X-CSRF-Token', csrfToken),
      agent.get('/api/admin/votes/0012345678'),
    ];
    for (const response of await Promise.all(attempts)) expect(response.status).toBe(404);
    expect(await countRows('votes')).toBe(3);
  });

  it('akun database aplikasi tidak bisa membaca NISN/suara maupun mengubah/menghapus suara', async (context) => {
    if (isSharedPrivilegedAccount(getAdminDbSettings())) {
      context.skip('DB_USER memakai akun migrasi/postgres; jalankan dengan akun aplikasi terpisah untuk tes hak akses.');
    }
    await electionWithVotes();
    const pool = getPool();
    const forbidden = [
      'SELECT nisn FROM voter_participation',
      'SELECT * FROM votes',
      'UPDATE votes SET candidate_id = candidate_id',
      'DELETE FROM votes',
      'UPDATE voter_participation SET nisn = nisn',
      'DELETE FROM voter_participation',
      'UPDATE audit_logs SET action = action',
      'DELETE FROM audit_logs',
      "UPDATE admin_users SET role = 'admin'",
    ];
    for (const statement of forbidden) {
      // 42501 = insufficient_privilege
      await expect(pool.query(statement), statement).rejects.toMatchObject({ code: '42501' });
    }
    // Yang diizinkan hanya membaca agregat lewat view.
    const { rows } = await pool.query('SELECT SUM(vote_count) AS total FROM v_candidate_vote_counts');
    expect(Number(rows[0].total)).toBe(3);
  });

  it('proses voting tidak menulis audit log, dan audit log tidak memuat NISN', async () => {
    const { nisns } = await electionWithVotes();
    expect(await countRows('audit_logs')).toBe(0);
    const { agent, csrfToken } = await loginAs(app, await createAdmin());
    const [{ id }] = await sql("SELECT id FROM elections WHERE status = 'active'");
    await agent.patch(`/api/admin/elections/${id}`).set('X-CSRF-Token', csrfToken).send({ status: 'completed' }).expect(200);
    const logs = await sql('SELECT metadata::text AS metadata FROM audit_logs');
    expect(logs.length).toBeGreaterThan(0);
    for (const log of logs) for (const nisn of nisns) expect(log.metadata ?? '').not.toContain(nisn);
  });

  it('pemilihan draft tidak terlihat oleh publik', async () => {
    const { election } = await createOpenElection({ status: 'draft' });
    expect((await request(app).get(`/api/elections/${election.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/elections/${election.id}/candidates`)).status).toBe(404);
    const current = await request(app).get('/api/elections/current');
    expect(current.body.data).toBeNull();
    expect((await request(app).get('/api/elections/active')).status).toBe(404);
  });

  it('respons API memakai header keamanan dan tidak di-cache', async () => {
    const response = await request(app).get('/api/elections/current');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('error server tidak membocorkan stack trace atau detail SQL', async () => {
    const { election, candidates } = await createOpenElection();
    const dropTrigger = await installFailingTrigger('votes', 'rahasia internal');
    try {
      const response = await vote(app, election.id, { nisn: nextNisn(), candidateId: candidates[0].id });
      expect(response.status).toBe(500);
      const text = JSON.stringify(response.body);
      expect(text).not.toMatch(/rahasia internal|INSERT INTO|stack|at .*\.js/);
      expect(response.body.error.requestId).toBeTruthy();
    } finally {
      await dropTrigger();
    }
  });
});
