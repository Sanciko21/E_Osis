import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../src/config/database.js';
import { getAdminDbSettings, isSharedPrivilegedAccount } from '../scripts/lib/db-admin.js';
import { resetDatabase, sql } from './helpers/db.js';
import { createAdmin, nextNisn } from './helpers/factories.js';
import { buildApp, loginAs, vote } from './helpers/http.js';

const app = buildApp();
const TABLES = ['elections', 'candidates', 'voter_participation', 'votes', 'admin_users', 'admin_sessions', 'audit_logs'];
const setRls = (enabled) =>
  Promise.all(TABLES.map((table) => sql(`ALTER TABLE ${table} ${enabled ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY`)));

/**
 * Dashboard Supabase dapat menyalakan RLS pada tabel (mis. opsi "enable RLS" saat Run di SQL
 * Editor). RLS tanpa policy menolak semua baris bagi akun aplikasi; policy dari db:grants /
 * setup.sql menjaga aplikasi tetap berfungsi, sementara batasan GRANT tetap berlaku.
 */
describe('Aplikasi tetap berfungsi saat RLS dinyalakan di semua tabel', () => {
  beforeAll(() => setRls(true));
  afterAll(() => setRls(false));
  beforeEach(resetDatabase);

  it('login admin, kelola pemilihan & paslon, voting, dan rekap hasil', async () => {
    const { agent, csrfToken } = await loginAs(app, await createAdmin());
    const send = (method, url, body) => agent[method](url).set('X-CSRF-Token', csrfToken).send(body);
    const hour = 3_600_000;

    const created = await send('post', '/api/admin/elections', {
      title: 'Pemilihan dengan RLS',
      startAt: new Date(Date.now() - hour).toISOString(),
      endAt: new Date(Date.now() + hour).toISOString(),
    });
    expect(created.status).toBe(201);
    const electionId = created.body.data.id;
    const candidate = await send('post', `/api/admin/elections/${electionId}/candidates`, {
      candidateNumber: 1,
      chairpersonName: 'Calon Ketua',
      viceChairpersonName: 'Calon Wakil',
      vision: 'Visi yang cukup panjang.',
      mission: 'Misi yang cukup panjang.',
    });
    expect(candidate.status).toBe(201);
    expect((await send('patch', `/api/admin/elections/${electionId}`, { status: 'active' })).status).toBe(200);

    const nisn = nextNisn();
    await vote(app, electionId, { nisn, candidateId: candidate.body.data.id }).expect(201);
    expect((await vote(app, electionId, { nisn, candidateId: candidate.body.data.id })).body.error.code).toBe('ALREADY_VOTED');

    const results = await agent.get(`/api/admin/elections/${electionId}/results`).expect(200);
    expect(results.body.data.totals).toMatchObject({ validVotes: 1, uniqueVoters: 1 });
    expect((await agent.get('/api/admin/audit-logs').expect(200)).body.meta.total).toBeGreaterThan(0);
  });

  it('policy RLS tidak melonggarkan GRANT: akun aplikasi tetap tidak bisa membaca suara/NISN', async (context) => {
    if (isSharedPrivilegedAccount(getAdminDbSettings())) context.skip('DB_USER memakai akun migrasi/postgres.');
    for (const statement of ['SELECT * FROM votes', 'SELECT nisn FROM voter_participation', 'DELETE FROM votes']) {
      await expect(getPool().query(statement), statement).rejects.toMatchObject({ code: '42501' });
    }
  });
});
