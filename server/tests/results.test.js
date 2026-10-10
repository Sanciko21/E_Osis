import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, sql } from './helpers/db.js';
import { createAdmin, createOpenElection, nextNisn } from './helpers/factories.js';
import { buildApp, loginAs, vote } from './helpers/http.js';

const app = buildApp();

beforeEach(resetDatabase);

async function castVotes(election, distribution) {
  const nisns = [];
  for (const [candidate, count] of distribution) {
    for (let i = 0; i < count; i += 1) {
      const nisn = nextNisn();
      nisns.push(nisn);
      await vote(app, election.id, { nisn, candidateId: candidate.id }).expect(201);
    }
  }
  return nisns;
}

describe('[12] hasil agregasi sesuai dengan data votes', () => {
  it('jumlah, persentase, total suara sah, dan pemilih unik dihitung dari database', async () => {
    const { election, candidates } = await createOpenElection({ candidates: 3, eligibleVoterCount: 40 });
    await castVotes(election, [
      [candidates[0], 5],
      [candidates[1], 3],
    ]);
    const admin = await createAdmin({ role: 'observer' });
    const { agent } = await loginAs(app, admin);

    const response = await agent.get(`/api/admin/elections/${election.id}/results`);
    expect(response.status).toBe(200);
    const results = response.body.data;

    // Bandingkan dengan perhitungan langsung pada tabel votes.
    const direct = await sql('SELECT candidate_id, COUNT(*) AS total FROM votes WHERE election_id = $1 GROUP BY candidate_id', [
      election.id,
    ]);
    const directMap = Object.fromEntries(direct.map((row) => [row.candidate_id, Number(row.total)]));
    for (const candidate of results.candidates) expect(candidate.votes).toBe(directMap[candidate.id] ?? 0);

    expect(results.candidates.map((c) => [c.candidateNumber, c.votes, c.percentage])).toEqual([
      [1, 5, 62.5],
      [2, 3, 37.5],
      [3, 0, 0], // kandidat tanpa suara tetap tampil
    ]);
    expect(results.totals).toEqual({ validVotes: 8, uniqueVoters: 8, eligibleVoters: 40, turnoutPercentage: 20 });
    expect(results.integrity).toEqual({ consistent: true, validVotes: 8, participationRecords: 8 });
    expect(results.isFinal).toBe(false); // hasil sementara
    expect(results.candidates[0].isLeading).toBe(true);
    expect(results.timeline.points.reduce((sum, point) => sum + point.voters, 0)).toBe(8);
    expect(results.timeline.points.at(-1).cumulativeVoters).toBe(8);
  });

  it('tanpa jumlah siswa resmi, persentase partisipasi tidak dikarang (null)', async () => {
    const { election, candidates } = await createOpenElection({ eligibleVoterCount: null });
    await castVotes(election, [[candidates[0], 2]]);
    const { agent } = await loginAs(app, await createAdmin());
    const { body } = await agent.get(`/api/admin/elections/${election.id}/results`).expect(200);
    expect(body.data.totals).toEqual({ validVotes: 2, uniqueVoters: 2, eligibleVoters: null, turnoutPercentage: null });
  });

  it('data kosong: semua kandidat 0 suara, 0%, tanpa pembagian dengan nol', async () => {
    const { election } = await createOpenElection({ candidates: 2 });
    const { agent } = await loginAs(app, await createAdmin());
    const { body } = await agent.get(`/api/admin/elections/${election.id}/results`).expect(200);
    expect(body.data.totals.validVotes).toBe(0);
    expect(body.data.candidates.every((c) => c.votes === 0 && c.percentage === 0 && c.isLeading === false)).toBe(true);
    expect(body.data.timeline.points).toEqual([]);
  });

  it('hasil seri ditandai isTie', async () => {
    const { election, candidates } = await createOpenElection();
    await castVotes(election, [
      [candidates[0], 2],
      [candidates[1], 2],
    ]);
    const { agent } = await loginAs(app, await createAdmin());
    const { body } = await agent.get(`/api/admin/elections/${election.id}/results`).expect(200);
    expect(body.data.isTie).toBe(true);
    expect(body.data.candidates.filter((c) => c.isLeading)).toHaveLength(2);
  });

  it('dashboard memakai rekap yang sama untuk pemilihan aktif', async () => {
    const { election, candidates } = await createOpenElection();
    await castVotes(election, [[candidates[1], 3]]);
    const { agent } = await loginAs(app, await createAdmin());
    const { body } = await agent.get('/api/admin/dashboard').expect(200);
    expect(body.data.focusElectionId).toBe(election.id);
    expect(body.data.electionCounts.active).toBe(1);
    expect(body.data.results.totals.validVotes).toBe(3);
  });
});

describe('[13] hasil publik mengikuti results_public dan status pemilihan', () => {
  it('ditolak ketika results_public = false walaupun pemilihan sudah selesai', async () => {
    const { election, candidates } = await createOpenElection();
    await castVotes(election, [[candidates[0], 1]]);
    await sql("UPDATE elections SET status = 'completed', results_public = FALSE WHERE id = $1", [election.id]);

    const response = await request(app).get(`/api/elections/${election.id}/results`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('RESULTS_NOT_PUBLIC');
    expect(response.body).not.toHaveProperty('data');
  });

  it('ditolak saat pemilihan masih berlangsung walaupun results_public = true (hasil sementara hanya untuk admin)', async () => {
    const { election, candidates } = await createOpenElection({ resultsPublic: true });
    await castVotes(election, [[candidates[0], 1]]);
    const response = await request(app).get(`/api/elections/${election.id}/results`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('RESULTS_NOT_PUBLIC');
  });

  it('pemilihan draft tidak terlihat sama sekali (404)', async () => {
    const { election } = await createOpenElection({ status: 'draft', resultsPublic: true });
    expect((await request(app).get(`/api/elections/${election.id}/results`)).status).toBe(404);
  });

  it('tersedia setelah selesai dan dipublikasikan, tanpa NISN maupun data internal', async () => {
    const { election, candidates } = await createOpenElection();
    const nisns = await castVotes(election, [
      [candidates[0], 1],
      [candidates[1], 3],
    ]);
    await sql("UPDATE elections SET status = 'completed', results_public = TRUE WHERE id = $1", [election.id]);

    const response = await request(app).get(`/api/elections/${election.id}/results`);
    expect(response.status).toBe(200);
    expect(response.body.data.isFinal).toBe(true);
    expect(response.body.data.candidates.map((c) => c.votes)).toEqual([1, 3]);
    expect(response.body.data.totals.validVotes).toBe(4);
    expect(response.body.data).not.toHaveProperty('integrity');
    expect(response.body.data).not.toHaveProperty('timeline');
    const text = JSON.stringify(response.body);
    for (const nisn of nisns) expect(text).not.toContain(nisn);
  });
});
