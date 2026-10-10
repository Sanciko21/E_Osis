/**
 * Aturan status & fase pemilihan (sumber kebenaran tunggal untuk backend).
 *
 * status (disimpan, diubah panitia):
 *   draft      -> belum dipublikasikan, tidak terlihat publik
 *   scheduled  -> jadwal diumumkan, pemungutan suara belum dibuka panitia
 *   active     -> pemungutan suara dibuka; suara diterima HANYA di dalam rentang start_at..end_at
 *   completed  -> pemilihan ditutup permanen
 *
 * phase (dihitung dari status + waktu server):
 *   draft | upcoming | open | closed | completed
 */
export const ELECTION_STATUSES = Object.freeze(['draft', 'scheduled', 'active', 'completed']);

const TRANSITIONS = Object.freeze({
  draft: Object.freeze(['scheduled', 'active']),
  scheduled: Object.freeze(['draft', 'active']),
  active: Object.freeze(['completed']),
  completed: Object.freeze([]),
});

export function allowedTransitions(status) {
  return TRANSITIONS[status] ?? [];
}

export function canTransition(from, to) {
  return allowedTransitions(from).includes(to);
}

export function computeElectionPhase(election, now = new Date()) {
  switch (election.status) {
    case 'draft':
      return 'draft';
    case 'scheduled':
      return 'upcoming';
    case 'completed':
      return 'completed';
    case 'active':
      if (now < election.startAt) return 'upcoming';
      if (now >= election.endAt) return 'closed';
      return 'open';
    default:
      throw new Error(`Status pemilihan tidak dikenal: ${election.status}`);
  }
}

/** Kandidat hanya boleh diubah sebelum pemungutan suara dibuka. */
export function candidatesEditable(status) {
  return status === 'draft' || status === 'scheduled';
}

/** Hasil publik hanya untuk pemilihan yang SELESAI dan diizinkan panitia. */
export function resultsArePublic(election) {
  return election.status === 'completed' && election.resultsPublic === true;
}

/** Field pemilihan yang boleh diubah pada setiap status. */
export const EDITABLE_FIELDS_BY_STATUS = Object.freeze({
  draft: Object.freeze(['title', 'description', 'startAt', 'endAt', 'eligibleVoterCount', 'resultsPublic']),
  scheduled: Object.freeze(['title', 'description', 'startAt', 'endAt', 'eligibleVoterCount', 'resultsPublic']),
  active: Object.freeze(['title', 'description', 'endAt', 'eligibleVoterCount', 'resultsPublic']),
  completed: Object.freeze(['title', 'description', 'eligibleVoterCount', 'resultsPublic']),
});
