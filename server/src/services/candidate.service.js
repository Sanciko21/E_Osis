import crypto from 'node:crypto';
import { getPool, withTransaction } from '../config/database.js';
import * as candidateRepository from '../repositories/candidate.repository.js';
import * as electionRepository from '../repositories/election.repository.js';
import { candidatesEditable } from '../utils/electionRules.js';
import { Errors, isDuplicateKeyError, isForeignKeyViolation } from '../utils/errors.js';
import { AUDIT_ACTIONS, recordAudit } from './audit.service.js';
import { toAdminCandidate } from './presenters.js';
import { deleteLocalPhoto, saveCandidatePhoto } from './upload.service.js';

const LOCKED_MESSAGE = 'Data pasangan calon dikunci karena pemungutan suara sudah dibuka atau selesai.';

/**
 * Mengunci baris pemilihan (FOR SHARE) agar status tidak berubah selama kandidat diubah:
 * pembukaan pemilihan (FOR UPDATE) menunggu, sehingga kandidat tidak bisa berubah
 * di tengah proses pembukaan.
 */
async function lockEditableElection(connection, electionId) {
  const election = await electionRepository.findById(connection, electionId, { lock: 'share' });
  if (!election) throw Errors.electionNotFound();
  if (!candidatesEditable(election.status)) throw Errors.electionLocked(LOCKED_MESSAGE);
  return election;
}

async function findCandidateOrThrow(db, id) {
  const candidate = await candidateRepository.findById(db, id);
  if (!candidate) throw Errors.notFound('Pasangan calon tidak ditemukan.');
  return candidate;
}

function summary(candidate) {
  return {
    candidateNumber: candidate.candidateNumber,
    chairpersonName: candidate.chairpersonName,
    viceChairpersonName: candidate.viceChairpersonName,
  };
}

export async function listCandidatesForAdmin(electionId) {
  const pool = getPool();
  const election = await electionRepository.findById(pool, electionId);
  if (!election) throw Errors.electionNotFound();
  const candidates = await candidateRepository.listByElection(pool, electionId);
  return candidates.map(toAdminCandidate);
}

export async function createCandidate(electionId, input, actor) {
  const id = crypto.randomUUID();
  return withTransaction(async (connection) => {
    await lockEditableElection(connection, electionId);
    try {
      await candidateRepository.insert(connection, { ...input, id, electionId });
    } catch (error) {
      if (isDuplicateKeyError(error, 'uq_candidates_election_number')) throw Errors.candidateNumberTaken();
      throw error;
    }
    await recordAudit(connection, {
      actorId: actor.id,
      action: AUDIT_ACTIONS.CANDIDATE_CREATED,
      entityType: 'candidate',
      entityId: id,
      electionId,
      metadata: summary(input),
    });
    return toAdminCandidate(await candidateRepository.findById(connection, id));
  });
}

export async function updateCandidate(id, patch, actor) {
  const existing = await findCandidateOrThrow(getPool(), id);
  return withTransaction(async (connection) => {
    await lockEditableElection(connection, existing.electionId);
    const current = await findCandidateOrThrow(connection, id);
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([field, value]) => value !== undefined && current[field] !== value),
    );
    if (Object.keys(changes).length > 0) {
      try {
        await candidateRepository.update(connection, id, changes);
      } catch (error) {
        if (isDuplicateKeyError(error, 'uq_candidates_election_number')) throw Errors.candidateNumberTaken();
        throw error;
      }
      await recordAudit(connection, {
        actorId: actor.id,
        action: AUDIT_ACTIONS.CANDIDATE_UPDATED,
        entityType: 'candidate',
        entityId: id,
        electionId: current.electionId,
        metadata: { ...summary({ ...current, ...changes }), changedFields: Object.keys(changes) },
      });
    }
    return toAdminCandidate(await candidateRepository.findById(connection, id));
  });
}

export async function deleteCandidate(id, actor, uploadsDir) {
  const existing = await findCandidateOrThrow(getPool(), id);
  const removed = await withTransaction(async (connection) => {
    await lockEditableElection(connection, existing.electionId);
    const current = await findCandidateOrThrow(connection, id);
    try {
      await candidateRepository.remove(connection, id);
    } catch (error) {
      if (isForeignKeyViolation(error)) throw Errors.electionLocked(LOCKED_MESSAGE);
      throw error;
    }
    await recordAudit(connection, {
      actorId: actor.id,
      action: AUDIT_ACTIONS.CANDIDATE_DELETED,
      entityType: 'candidate',
      entityId: id,
      electionId: current.electionId,
      metadata: summary(current),
    });
    return current;
  });
  await deleteLocalPhoto(removed.photoUrl, uploadsDir);
}

/** Menyimpan file foto lalu memperbarui photo_url; file baru dihapus lagi jika transaksi gagal. */
export async function updateCandidatePhoto(id, fileBuffer, actor, uploadsDir) {
  const existing = await findCandidateOrThrow(getPool(), id);
  const saved = await saveCandidatePhoto(fileBuffer, uploadsDir);
  let previousUrl;
  try {
    const result = await withTransaction(async (connection) => {
      await lockEditableElection(connection, existing.electionId);
      const current = await findCandidateOrThrow(connection, id);
      previousUrl = current.photoUrl;
      await candidateRepository.update(connection, id, { photoUrl: saved.url });
      await recordAudit(connection, {
        actorId: actor.id,
        action: AUDIT_ACTIONS.CANDIDATE_PHOTO_UPDATED,
        entityType: 'candidate',
        entityId: id,
        electionId: current.electionId,
        metadata: { ...summary(current), contentType: saved.contentType, sizeBytes: fileBuffer.length },
      });
      return toAdminCandidate(await candidateRepository.findById(connection, id));
    });
    if (previousUrl && previousUrl !== saved.url) await deleteLocalPhoto(previousUrl, uploadsDir);
    return result;
  } catch (error) {
    await deleteLocalPhoto(saved.url, uploadsDir);
    throw error;
  }
}
