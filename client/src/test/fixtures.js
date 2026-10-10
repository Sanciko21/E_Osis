const HOUR = 3_600_000;

export function makeElection(overrides = {}) {
  return {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    title: 'Pemilihan Ketua OSIS Uji',
    description: 'Pemilihan untuk pengujian.',
    startAt: new Date(Date.now() - HOUR).toISOString(),
    endAt: new Date(Date.now() + HOUR).toISOString(),
    status: 'active',
    phase: 'open',
    votingOpen: true,
    resultsAvailable: false,
    ...overrides,
  };
}

export const CANDIDATES = [
  {
    id: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
    electionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    candidateNumber: 1,
    chairpersonName: 'Andi Saputra',
    viceChairpersonName: 'Bunga Lestari',
    photoUrl: null,
    vision: 'OSIS yang aktif dan peduli.',
    mission: 'Misi satu.\nMisi dua.',
  },
  {
    id: '6fa459ea-ee8a-4ca4-894e-db77e160355e',
    electionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    candidateNumber: 2,
    chairpersonName: 'Citra Maharani',
    viceChairpersonName: 'Dimas Pratama',
    photoUrl: null,
    vision: 'OSIS yang jujur dan terbuka.',
    mission: 'Misi pertama.\nMisi kedua.',
  },
];

export function makeResults({ votes = [6, 4], eligibleVoters = null } = {}) {
  const total = votes.reduce((sum, value) => sum + value, 0);
  const top = Math.max(...votes);
  return {
    election: makeElection(),
    isFinal: false,
    totals: {
      validVotes: total,
      uniqueVoters: total,
      eligibleVoters,
      turnoutPercentage: eligibleVoters ? Math.round((total / eligibleVoters) * 10000) / 100 : null,
    },
    candidates: CANDIDATES.map((candidate, index) => ({
      id: candidate.id,
      candidateNumber: candidate.candidateNumber,
      chairpersonName: candidate.chairpersonName,
      viceChairpersonName: candidate.viceChairpersonName,
      photoUrl: null,
      votes: votes[index],
      percentage: total ? Math.round((votes[index] / total) * 10000) / 100 : 0,
      isLeading: total > 0 && votes[index] === top,
    })),
    isTie: false,
    timeline: {
      bucketSeconds: 900,
      points: total
        ? [
            { bucketStart: '2026-10-20T00:00:00.000Z', voters: 4, cumulativeVoters: 4 },
            { bucketStart: '2026-10-20T00:30:00.000Z', voters: total - 4, cumulativeVoters: total },
          ]
        : [],
    },
    integrity: { consistent: true, validVotes: total, participationRecords: total },
    generatedAt: new Date().toISOString(),
  };
}
