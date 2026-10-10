import { getPool, withReadSnapshot } from '../config/database.js';
import * as electionRepository from '../repositories/election.repository.js';
import * as resultsRepository from '../repositories/results.repository.js';
import { resultsArePublic } from '../utils/electionRules.js';
import { Errors } from '../utils/errors.js';
import { toAdminElection, toPublicElection } from './presenters.js';

const round2 = (value) => Math.round(value * 100) / 100;

/** Interval grafik partisipasi menyesuaikan panjang jadwal pemilihan. */
export function timelineBucketSeconds(election) {
  const durationHours = (election.endAt - election.startAt) / 3_600_000;
  if (durationHours <= 6) return 15 * 60;
  if (durationHours <= 72) return 60 * 60;
  return 24 * 60 * 60;
}

/**
 * Rekap hasil dari database. Seluruh query dijalankan dalam SATU snapshot konsisten
 * sehingga total suara, perolehan kandidat, dan jumlah pemilih tidak saling bergeser.
 * Persentase suara = suara kandidat / total suara sah × 100.
 * Persentase partisipasi = pemilih unik / eligible_voter_count × 100, HANYA jika
 * sekolah mengisi eligible_voter_count (jika tidak, bernilai null — tidak dikarang).
 */
async function computeResults(election, { includeTimeline }) {
  return withReadSnapshot(async (connection) => {
    const tallies = await resultsRepository.candidateTallies(connection, election.id);
    const validVotes = await resultsRepository.totalValidVotes(connection, election.id);
    const participation = await resultsRepository.participationSummary(connection, election.id);
    const bucketSeconds = timelineBucketSeconds(election);
    const timelineRows = includeTimeline
      ? await resultsRepository.participationTimeline(connection, election.id, bucketSeconds)
      : [];

    const topVotes = Math.max(0, ...tallies.map((item) => item.votes));
    const leaders = topVotes > 0 ? tallies.filter((item) => item.votes === topVotes) : [];
    const candidates = tallies.map((item) => ({
      ...item,
      percentage: validVotes > 0 ? round2((item.votes / validVotes) * 100) : 0,
      isLeading: leaders.length > 0 && item.votes === topVotes,
    }));

    let cumulative = 0;
    const timeline = timelineRows.map((row) => {
      cumulative += row.voters;
      return { bucketStart: row.bucketStart, voters: row.voters, cumulativeVoters: cumulative };
    });

    const eligible = election.eligibleVoterCount;
    return {
      totals: {
        validVotes,
        uniqueVoters: participation.uniqueVoters,
        eligibleVoters: eligible ?? null,
        turnoutPercentage: eligible ? round2((participation.uniqueVoters / eligible) * 100) : null,
      },
      candidates,
      leaderCount: leaders.length,
      isTie: leaders.length > 1,
      timeline: includeTimeline ? { bucketSeconds, points: timeline } : undefined,
      participationWindow: {
        firstVotedAt: participation.firstVotedAt,
        lastVotedAt: participation.lastVotedAt,
      },
      integrity: {
        // Setiap suara sah selalu ditulis bersama satu catatan partisipasi dalam transaksi
        // yang sama, sehingga kedua angka ini wajib sama.
        consistent: validVotes === participation.uniqueVoters,
        validVotes,
        participationRecords: participation.uniqueVoters,
      },
    };
  });
}

/** Hasil untuk admin berwenang — termasuk hasil SEMENTARA saat pemilihan berlangsung. */
export async function getAdminResults(electionId) {
  const election = await electionRepository.findById(getPool(), electionId);
  if (!election) throw Errors.electionNotFound();
  const results = await computeResults(election, { includeTimeline: true });
  return {
    election: toAdminElection(election),
    isFinal: election.status === 'completed',
    ...results,
    generatedAt: new Date(),
  };
}

/** Hasil publik — hanya jika pemilihan SELESAI dan results_public = true. */
export async function getPublicResults(electionId) {
  const election = await electionRepository.findById(getPool(), electionId);
  if (!election || election.status === 'draft') throw Errors.electionNotFound();
  if (!resultsArePublic(election)) throw Errors.resultsNotPublic();
  const results = await computeResults(election, { includeTimeline: false });
  return {
    election: toPublicElection(election),
    isFinal: true,
    totals: results.totals,
    candidates: results.candidates,
    isTie: results.isTie,
    generatedAt: new Date(),
  };
}
