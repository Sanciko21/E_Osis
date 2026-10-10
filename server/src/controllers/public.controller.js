import * as electionService from '../services/election.service.js';
import * as resultsService from '../services/results.service.js';
import * as voteService from '../services/vote.service.js';

const meta = () => ({ serverTime: new Date() });

export async function getCurrentElection(_req, res) {
  res.json({ data: await electionService.getCurrentPublicElection(), meta: meta() });
}

export async function getActiveElection(_req, res) {
  res.json({ data: await electionService.getActiveElection(), meta: meta() });
}

export async function getElection(req, res) {
  res.json({ data: await electionService.getPublicElection(req.valid.params.id), meta: meta() });
}

export async function listCandidates(req, res) {
  res.json({ data: await electionService.listPublicCandidates(req.valid.params.id) });
}

export async function getResults(req, res) {
  res.json({ data: await resultsService.getPublicResults(req.valid.params.id) });
}

/**
 * Respons sukses (201) HANYA dikirim setelah transaksi COMMIT berhasil.
 * Respons sengaja tidak memuat NISN ataupun kandidat yang dipilih.
 */
export async function castVote(req, res) {
  const { nisn, candidateId } = req.valid.body;
  await voteService.castVote({ electionId: req.valid.params.id, candidateId, nisn });
  res.status(201).json({ data: { recorded: true }, message: 'Terima kasih! Suara Anda berhasil disimpan.' });
}
