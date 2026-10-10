import { allowedTransitions, candidatesEditable, computeElectionPhase, resultsArePublic } from '../utils/electionRules.js';

/** Bentuk data pemilihan untuk publik (tanpa pengaturan internal). */
export function toPublicElection(election, now = new Date()) {
  const phase = computeElectionPhase(election, now);
  return {
    id: election.id,
    title: election.title,
    description: election.description,
    startAt: election.startAt,
    endAt: election.endAt,
    status: election.status,
    phase,
    votingOpen: phase === 'open',
    resultsAvailable: resultsArePublic(election),
  };
}

/** Bentuk data pemilihan untuk admin (termasuk aksi yang diperbolehkan). */
export function toAdminElection(election, extras = {}, now = new Date()) {
  return {
    ...toPublicElection(election, now),
    resultsPublic: election.resultsPublic,
    eligibleVoterCount: election.eligibleVoterCount,
    allowedTransitions: allowedTransitions(election.status),
    candidatesEditable: candidatesEditable(election.status),
    createdAt: election.createdAt,
    updatedAt: election.updatedAt,
    ...extras,
  };
}

export function toPublicCandidate(candidate) {
  return {
    id: candidate.id,
    electionId: candidate.electionId,
    candidateNumber: candidate.candidateNumber,
    chairpersonName: candidate.chairpersonName,
    viceChairpersonName: candidate.viceChairpersonName,
    photoUrl: candidate.photoUrl,
    vision: candidate.vision,
    mission: candidate.mission,
  };
}

export function toAdminCandidate(candidate) {
  return { ...toPublicCandidate(candidate), createdAt: candidate.createdAt, updatedAt: candidate.updatedAt };
}
