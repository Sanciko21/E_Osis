import crypto from 'node:crypto';
import { TransactionOutcomeUnknownError, withTransaction } from '../config/database.js';
import * as ballotRepository from '../repositories/ballot.repository.js';
import * as candidateRepository from '../repositories/candidate.repository.js';
import * as electionRepository from '../repositories/election.repository.js';
import { computeElectionPhase } from '../utils/electionRules.js';
import { AppError, Errors, isDuplicateKeyError } from '../utils/errors.js';

/**
 * Mencatat satu suara secara atomik (voting on-the-fly tanpa registrasi NISN):
 *
 *   BEGIN ISOLATION LEVEL READ COMMITTED
 *     1. SELECT pemilihan ... FOR SHARE      → validasi status & jadwal memakai jam database
 *     2. SELECT kandidat ... FOR SHARE       → kandidat wajib milik pemilihan ini
 *     3. INSERT voter_participation          → UNIQUE(election_id, nisn) menolak NISN ganda
 *     4. INSERT votes                        → hanya tercapai jika langkah 3 berhasil
 *   COMMIT  (error apa pun sebelum COMMIT → ROLLBACK, tidak ada data parsial)
 *
 * Kebenaran tidak bergantung pada isolation level karena dijamin oleh UNIQUE constraint,
 * foreign key komposit, dan kunci FOR SHARE pada baris pemilihan. READ COMMITTED membuat
 * pemilih yang sempat menunggu kunci (mis. saat panitia menutup pemilihan) membaca status
 * terbaru, bukan snapshot lama.
 *
 * @param deps Dependensi repository — dapat diganti dalam pengujian (fault injection).
 */
export async function castVote({ electionId, candidateId, nisn }, deps = {}) {
  const ballots = deps.ballotRepository ?? ballotRepository;

  try {
    await withTransaction(
      async (connection) => {
        const election = await electionRepository.findForVoting(connection, electionId);
        if (!election || election.status === 'draft') throw Errors.electionNotFound();

        const phase = computeElectionPhase(election, election.now);
        if (phase === 'upcoming') throw Errors.electionNotStarted();
        if (phase !== 'open') throw Errors.electionEnded();

        const candidateValid = await candidateRepository.existsInElectionForVoting(connection, candidateId, electionId);
        if (!candidateValid) throw Errors.invalidCandidate();

        try {
          await ballots.insertParticipation(connection, { electionId, nisn });
        } catch (error) {
          if (isDuplicateKeyError(error, 'uq_participation_election_nisn')) throw Errors.alreadyVoted();
          throw error;
        }

        // UUID v4 acak: tidak berurutan sehingga tidak membocorkan urutan pemilih.
        await ballots.insertVote(connection, { id: crypto.randomUUID(), electionId, candidateId });
      },
      { isolationLevel: 'READ COMMITTED' },
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof TransactionOutcomeUnknownError) throw Errors.voteStatusUnknown(error);
    // Transaksi sudah di-ROLLBACK oleh withTransaction: dipastikan tidak ada suara tersimpan.
    throw Errors.voteNotRecorded(error);
  }

  return { recorded: true };
}
