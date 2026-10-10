import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as realBallotRepository from '../src/repositories/ballot.repository.js';
import { castVote } from '../src/services/vote.service.js';
import { countRows, installFailingTrigger, resetDatabase, sql } from './helpers/db.js';
import { createCandidate, createElection, createOpenElection, nextNisn } from './helpers/factories.js';
import { buildApp, vote } from './helpers/http.js';

const HOUR = 60 * 60 * 1000;
const app = buildApp();

beforeEach(resetDatabase);

describe('Voting on-the-fly', () => {
  it('[1] NISN baru dapat memilih ketika pemilihan aktif, dan NISN disimpan sebagai teks utuh', async () => {
    const { election, candidates } = await createOpenElection();
    const nisn = '0012345678';

    const response = await vote(app, election.id, { nisn, candidateId: candidates[1].id });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({ recorded: true });
    // Respons tidak menggemakan NISN maupun pilihan.
    expect(JSON.stringify(response.body)).not.toContain(nisn);
    expect(JSON.stringify(response.body)).not.toContain(candidates[1].id);

    const [participation] = await sql('SELECT nisn FROM voter_participation WHERE election_id = $1', [election.id]);
    expect(participation.nisn).toBe('0012345678'); // nol di depan tidak hilang
    const votes = await sql('SELECT candidate_id FROM votes WHERE election_id = $1', [election.id]);
    expect(votes).toHaveLength(1);
    expect(votes[0].candidate_id).toBe(candidates[1].id);
  });

  it('[1b] waktu suara hanya berupa tanggal UTC (privasi) dan id suara adalah UUID v4 acak', async () => {
    const { election, candidates } = await createOpenElection();
    const before = new Date().toISOString().slice(0, 10);
    await vote(app, election.id, { nisn: nextNisn(), candidateId: candidates[0].id }).expect(201);
    const after = new Date().toISOString().slice(0, 10);
    const [row] = await sql('SELECT id, created_on::text AS day, pg_typeof(created_on)::text AS type FROM votes');
    expect(row.type).toBe('date'); // tipe date tidak dapat menyimpan jam
    expect([before, after]).toContain(row.day);
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('[2] NISN yang sama ditolak pada pemilihan yang sama (HTTP 409 ALREADY_VOTED)', async () => {
    const { election, candidates } = await createOpenElection();
    const nisn = nextNisn();
    await vote(app, election.id, { nisn, candidateId: candidates[0].id }).expect(201);

    const second = await vote(app, election.id, { nisn, candidateId: candidates[1].id });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_VOTED');
    expect(second.body.error.message).toBe('NISN ini sudah digunakan untuk memilih!');
    expect(await countRows('voter_participation')).toBe(1);
    expect(await countRows('votes')).toBe(1);
    const [onlyVote] = await sql('SELECT candidate_id FROM votes');
    expect(onlyVote.candidate_id).toBe(candidates[0].id); // suara pertama tidak tertimpa
  });

  it('[2b] spasi pada NISN dinormalisasi sehingga tidak bisa dipakai untuk memilih ulang', async () => {
    const { election, candidates } = await createOpenElection();
    await vote(app, election.id, { nisn: '0098765432', candidateId: candidates[0].id }).expect(201);
    const retry = await vote(app, election.id, { nisn: ' 0098 765 432 ', candidateId: candidates[0].id });
    expect(retry.status).toBe(409);
  });

  it('[3] NISN yang sama dapat mengikuti pemilihan yang berbeda', async () => {
    const nisn = nextNisn();
    const first = await createOpenElection();
    await vote(app, first.election.id, { nisn, candidateId: first.candidates[0].id }).expect(201);
    await sql("UPDATE elections SET status = 'completed' WHERE id = $1", [first.election.id]);

    const second = await createOpenElection({ title: 'Pemilihan Ulang Uji' });
    const response = await vote(app, second.election.id, { nisn, candidateId: second.candidates[1].id });

    expect(response.status).toBe(201);
    expect(await countRows('voter_participation', 'nisn = $1', [nisn])).toBe(2);
    expect(await countRows('votes', 'election_id = $1', [second.election.id])).toBe(1);
  });

  it('[4] dua (atau lebih) request paralel dengan NISN & pemilihan sama hanya menghasilkan satu suara', async () => {
    const { election, candidates } = await createOpenElection();
    const nisn = nextNisn();
    const server = app.listen(0);
    try {
      const url = `http://127.0.0.1:${server.address().port}/api/elections/${election.id}/vote`;
      const send = (candidateId) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nisn, candidateId }),
        }).then(async (res) => ({ status: res.status, body: await res.json() }));

      const results = await Promise.all(Array.from({ length: 12 }, (_, i) => send(candidates[i % 2].id)));
      const statuses = results.map((result) => result.status);

      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(11);
      expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'ALREADY_VOTED')).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    expect(await countRows('voter_participation')).toBe(1);
    expect(await countRows('votes')).toBe(1);
  });

  it('[4b] banyak NISN berbeda secara paralel tercatat semua tanpa error/deadlock', async () => {
    const { election, candidates } = await createOpenElection({ candidates: 3 });
    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, i) => vote(app, election.id, { nisn: nextNisn(), candidateId: candidates[i % 3].id })),
    );
    expect(responses.map((response) => response.status)).toEqual(Array(30).fill(201));
    expect(await countRows('voter_participation')).toBe(30);
    expect(await countRows('votes')).toBe(30);
  });

  it('[5] kandidat dari pemilihan lain ditolak tanpa membuat catatan apa pun', async () => {
    const { election } = await createOpenElection();
    const other = await createElection({ status: 'draft', title: 'Pemilihan Lain' });
    const foreignCandidate = await createCandidate(other.id, 1);
    const nisn = nextNisn();

    const response = await vote(app, election.id, { nisn, candidateId: foreignCandidate.id });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_CANDIDATE');

    const unknown = await vote(app, election.id, { nisn, candidateId: '7d1c3f2e-9a4b-4c1d-8e2f-3a4b5c6d7e8f' });
    expect(unknown.status).toBe(422);

    expect(await countRows('voter_participation')).toBe(0); // NISN tidak "terbakar"
    expect(await countRows('votes')).toBe(0);
  });

  it('[5b] database sendiri menolak suara yang kandidatnya berasal dari pemilihan lain (FK komposit)', async () => {
    const { election } = await createOpenElection();
    const other = await createElection({ status: 'draft' });
    const foreignCandidate = await createCandidate(other.id, 1);
    await expect(
      sql('INSERT INTO votes (id, election_id, candidate_id) VALUES (gen_random_uuid(), $1, $2)', [election.id, foreignCandidate.id]),
    ).rejects.toMatchObject({ code: '23503', constraint: 'fk_votes_candidate_same_election' }); // foreign_key_violation
  });

  describe('[6] pemilihan yang tidak sedang dibuka menolak voting', () => {
    const now = Date.now();
    const cases = [
      { label: 'draft', overrides: { status: 'draft' }, status: 404, code: 'ELECTION_NOT_FOUND' },
      { label: 'scheduled', overrides: { status: 'scheduled' }, status: 403, code: 'ELECTION_NOT_STARTED' },
      { label: 'completed', overrides: { status: 'completed' }, status: 403, code: 'ELECTION_ENDED' },
      {
        label: 'active, sebelum jadwal mulai',
        overrides: { status: 'active', startAt: new Date(now + HOUR), endAt: new Date(now + 2 * HOUR) },
        status: 403,
        code: 'ELECTION_NOT_STARTED',
      },
      {
        label: 'active, setelah jadwal selesai',
        overrides: { status: 'active', startAt: new Date(now - 2 * HOUR), endAt: new Date(now - HOUR) },
        status: 403,
        code: 'ELECTION_ENDED',
      },
    ];

    it.each(cases)('$label → $status $code', async ({ overrides, status, code }) => {
      const { election, candidates } = await createOpenElection(overrides);
      const response = await vote(app, election.id, { nisn: nextNisn(), candidateId: candidates[0].id });
      expect(response.status).toBe(status);
      expect(response.body.error.code).toBe(code);
      expect(await countRows('voter_participation')).toBe(0);
      expect(await countRows('votes')).toBe(0);
    });

    it('pemilihan yang tidak ada → 404', async () => {
      const response = await vote(app, '9b2e6c1a-3d4f-4a5b-8c6d-7e8f9a0b1c2d', {
        nisn: nextNisn(),
        candidateId: '7d1c3f2e-9a4b-4c1d-8e2f-3a4b5c6d7e8f',
      });
      expect(response.status).toBe(404);
    });
  });

  describe('[7] kegagalan penyimpanan suara me-ROLLBACK catatan partisipasi', () => {
    it('kegagalan di database (trigger) pada INSERT votes', async () => {
      const { election, candidates } = await createOpenElection();
      const nisn = nextNisn();
      const dropTrigger = await installFailingTrigger('votes');
      try {
        const response = await vote(app, election.id, { nisn, candidateId: candidates[0].id });
        expect(response.status).toBe(500);
        expect(response.body.error.code).toBe('VOTE_NOT_RECORDED');
        expect(await countRows('voter_participation')).toBe(0);
        expect(await countRows('votes')).toBe(0);
      } finally {
        await dropTrigger();
      }
      // NISN tidak "terbakar": setelah gangguan selesai siswa tetap bisa memilih.
      await vote(app, election.id, { nisn, candidateId: candidates[0].id }).expect(201);
    });

    it('kegagalan di aplikasi setelah partisipasi tersimpan', async () => {
      const { election, candidates } = await createOpenElection();
      const failingVoteInsert = {
        insertParticipation: realBallotRepository.insertParticipation,
        insertVote: vi.fn().mockRejectedValue(new Error('Simulasi koneksi terputus')),
      };

      await expect(
        castVote({ electionId: election.id, candidateId: candidates[0].id, nisn: nextNisn() }, { ballotRepository: failingVoteInsert }),
      ).rejects.toMatchObject({ code: 'VOTE_NOT_RECORDED', status: 500 });

      expect(failingVoteInsert.insertVote).toHaveBeenCalledOnce();
      expect(await countRows('voter_participation')).toBe(0);
      expect(await countRows('votes')).toBe(0);
    });
  });

  describe('[8] kegagalan penyimpanan partisipasi tidak menghasilkan suara', () => {
    it('kegagalan di database (trigger) pada INSERT voter_participation', async () => {
      const { election, candidates } = await createOpenElection();
      const dropTrigger = await installFailingTrigger('voter_participation');
      try {
        const response = await vote(app, election.id, { nisn: nextNisn(), candidateId: candidates[0].id });
        expect(response.status).toBe(500);
        expect(response.body.error.code).toBe('VOTE_NOT_RECORDED');
      } finally {
        await dropTrigger();
      }
      expect(await countRows('voter_participation')).toBe(0);
      expect(await countRows('votes')).toBe(0);
    });

    it('INSERT suara tidak pernah dijalankan bila INSERT partisipasi gagal', async () => {
      const { election, candidates } = await createOpenElection();
      const repository = {
        insertParticipation: vi.fn().mockRejectedValue(new Error('Simulasi gagal')),
        insertVote: vi.fn(realBallotRepository.insertVote),
      };
      await expect(
        castVote({ electionId: election.id, candidateId: candidates[0].id, nisn: nextNisn() }, { ballotRepository: repository }),
      ).rejects.toMatchObject({ code: 'VOTE_NOT_RECORDED' });
      expect(repository.insertVote).not.toHaveBeenCalled();
      expect(await countRows('votes')).toBe(0);
    });
  });

  it('penutupan pemilihan saat voting paralel tetap konsisten (tidak ada data parsial)', async () => {
    const { election, candidates } = await createOpenElection();
    const voting = Array.from({ length: 25 }, (_, i) =>
      vote(app, election.id, { nisn: nextNisn(), candidateId: candidates[i % 2].id }),
    );
    const closing = new Promise((resolve) => setTimeout(resolve, 5)).then(() =>
      sql("UPDATE elections SET status = 'completed' WHERE id = $1", [election.id]),
    );
    const responses = await Promise.all([...voting, closing]).then((all) => all.slice(0, 25));

    for (const response of responses) {
      expect([201, 403]).toContain(response.status);
      if (response.status === 403) expect(response.body.error.code).toBe('ELECTION_ENDED');
    }
    const accepted = responses.filter((response) => response.status === 201).length;
    expect(await countRows('votes')).toBe(accepted);
    expect(await countRows('voter_participation')).toBe(accepted);
  });

  describe('validasi input voting', () => {
    let fixture;
    beforeEach(async () => {
      fixture = await createOpenElection();
    });

    it.each([
      ['huruf', '12345abcde', 'NISN hanya boleh berisi angka.'],
      ['9 digit', '123456789', 'NISN harus terdiri dari 10 digit.'],
      ['11 digit', '12345678901', 'NISN harus terdiri dari 10 digit.'],
      ['kosong', '', 'NISN wajib diisi.'],
      ['simbol', '12345-6789', 'NISN hanya boleh berisi angka.'],
    ])('NISN %s ditolak dengan satu pesan yang jelas', async (_label, nisn, message) => {
      const response = await vote(app, fixture.election.id, { nisn, candidateId: fixture.candidates[0].id });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual([{ field: 'nisn', message }]);
    });

    it('NISN berupa angka (bukan teks) ditolak agar nol di depan tidak hilang', async () => {
      const response = await vote(app, fixture.election.id, { nisn: 12345678, candidateId: fixture.candidates[0].id });
      expect(response.status).toBe(400);
    });

    it('menolak field tambahan, body kosong, JSON rusak, dan content-type non-JSON', async () => {
      const url = `/api/elections/${fixture.election.id}/vote`;
      const base = { nisn: nextNisn(), candidateId: fixture.candidates[0].id };
      expect((await vote(app, fixture.election.id, { ...base, voteCount: 999 })).status).toBe(400);
      expect((await request(app).post(url)).status).toBe(400);
      const broken = await request(app).post(url).set('Content-Type', 'application/json').send('{"nisn":');
      expect(broken.status).toBe(400);
      expect(broken.body.error.code).toBe('INVALID_JSON');
      const form = await request(app).post(url).type('form').send(base);
      expect(form.status).toBe(415);
      expect(await countRows('votes')).toBe(0);
    });

    it('menerapkan pola NISN sekolah dari konfigurasi (NISN_PATTERN)', async () => {
      const strictApp = buildApp({ NISN_PATTERN: '^01[0-4][0-9]{7}$' });
      const rejected = await vote(strictApp, fixture.election.id, { nisn: '0091234567', candidateId: fixture.candidates[0].id });
      expect(rejected.status).toBe(400);
      expect(rejected.body.error.details[0].message).toBe('NISN tidak sesuai ketentuan sekolah.');
      await vote(strictApp, fixture.election.id, { nisn: '0121234567', candidateId: fixture.candidates[0].id }).expect(201);
    });

    it('membatasi laju request voting per IP (HTTP 429)', async () => {
      const limitedApp = buildApp({ VOTE_RATE_LIMIT_MAX: '2' });
      const send = () => vote(limitedApp, fixture.election.id, { nisn: nextNisn(), candidateId: fixture.candidates[0].id });
      expect((await send()).status).toBe(201);
      expect((await send()).status).toBe(201);
      const limited = await send();
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
    });
  });
});
