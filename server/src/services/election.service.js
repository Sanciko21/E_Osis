import crypto from 'node:crypto';
import { getPool, withTransaction } from '../config/database.js';
import { PERMISSIONS, hasPermission } from '../config/permissions.js';
import * as candidateRepository from '../repositories/candidate.repository.js';
import * as electionRepository from '../repositories/election.repository.js';
import { EDITABLE_FIELDS_BY_STATUS, canTransition } from '../utils/electionRules.js';
import { AppError, Errors, isDuplicateKeyError, isForeignKeyViolation } from '../utils/errors.js';
import { AUDIT_ACTIONS, recordAudit } from './audit.service.js';
import { toAdminElection, toPublicCandidate, toPublicElection } from './presenters.js';
import { deleteLocalPhoto } from './upload.service.js';

const FIELD_LABELS = Object.freeze({
  title: 'judul',
  description: 'deskripsi',
  startAt: 'waktu mulai',
  endAt: 'waktu selesai',
  eligibleVoterCount: 'jumlah siswa berhak pilih',
  resultsPublic: 'publikasi hasil',
});

const sameValue = (a, b) =>
  a instanceof Date || b instanceof Date ? new Date(a).getTime() === new Date(b).getTime() : a === b;

// ----------------------------------------------------------------- Publik

export async function getCurrentPublicElection() {
  const election = await electionRepository.findCurrentPublic(getPool());
  return election ? toPublicElection(election) : null;
}

export async function getActiveElection() {
  const election = await electionRepository.findActive(getPool());
  if (!election) throw new AppError(404, 'NO_ACTIVE_ELECTION', 'Belum ada pemilihan yang sedang aktif.');
  return toPublicElection(election);
}

async function findPublicElectionOrThrow(id) {
  const election = await electionRepository.findById(getPool(), id);
  // Draft tidak pernah terlihat publik (diperlakukan seperti tidak ada).
  if (!election || election.status === 'draft') throw Errors.electionNotFound();
  return election;
}

export async function getPublicElection(id) {
  return toPublicElection(await findPublicElectionOrThrow(id));
}

export async function listPublicCandidates(electionId) {
  await findPublicElectionOrThrow(electionId);
  const candidates = await candidateRepository.listByElection(getPool(), electionId);
  return candidates.map(toPublicCandidate);
}

// ------------------------------------------------------------------- Admin

// Berurutan, bukan Promise.all: `db` bisa berupa koneksi transaksi, dan satu koneksi
// PostgreSQL hanya menjalankan satu query pada satu waktu.
async function adminExtras(db, id) {
  const candidateCount = await candidateRepository.countByElection(db, id);
  const voterCount = await electionRepository.countVoters(db, id);
  return { candidateCount, voterCount };
}

export async function listElections({ status, page, pageSize }) {
  const { items, total } = await electionRepository.listForAdmin(getPool(), {
    status,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return {
    items: items.map(({ candidateCount, voterCount, ...election }) =>
      toAdminElection(election, { candidateCount, voterCount }),
    ),
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getElectionForAdmin(id) {
  const pool = getPool();
  const election = await electionRepository.findById(pool, id);
  if (!election) throw Errors.electionNotFound();
  return toAdminElection(election, await adminExtras(pool, id));
}

export async function createElection(input, actor) {
  const id = crypto.randomUUID();
  return withTransaction(async (connection) => {
    await electionRepository.insert(connection, { ...input, id, status: 'draft' });
    await recordAudit(connection, {
      actorId: actor.id,
      action: AUDIT_ACTIONS.ELECTION_CREATED,
      entityType: 'election',
      entityId: id,
      electionId: id,
      metadata: {
        title: input.title,
        startAt: input.startAt,
        endAt: input.endAt,
        eligibleVoterCount: input.eligibleVoterCount ?? null,
        resultsPublic: Boolean(input.resultsPublic),
      },
    });
    const election = await electionRepository.findById(connection, id);
    return toAdminElection(election, { candidateCount: 0, voterCount: 0 });
  });
}

/**
 * Memperbarui data, status, dan/atau publikasi hasil pemilihan dalam satu transaksi.
 * Baris pemilihan dikunci FOR UPDATE: penutupan pemilihan menunggu transaksi suara
 * yang sedang berjalan, dan suara berikutnya langsung melihat status baru.
 */
export async function updateElection(id, patch, actor) {
  const { status: requestedStatus, ...fields } = patch;

  return withTransaction(async (connection) => {
    const current = await electionRepository.findById(connection, id, { lock: 'update' });
    if (!current) throw Errors.electionNotFound();
    const now = new Date();

    const statusChange = requestedStatus !== undefined && requestedStatus !== current.status;
    if (statusChange && !hasPermission(actor.role, PERMISSIONS.ELECTIONS_CHANGE_STATUS)) {
      throw Errors.forbidden('Anda tidak berwenang membuka atau menutup pemilihan.');
    }

    const changes = {};
    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined || sameValue(current[field], value)) continue;
      if (!EDITABLE_FIELDS_BY_STATUS[current.status].includes(field)) {
        throw Errors.electionLocked(
          `Kolom ${FIELD_LABELS[field] ?? field} tidak dapat diubah saat pemilihan berstatus "${current.status}".`,
        );
      }
      changes[field] = value;
    }

    if ('resultsPublic' in changes && !hasPermission(actor.role, PERMISSIONS.RESULTS_PUBLISH)) {
      throw Errors.forbidden('Anda tidak berwenang mengatur publikasi hasil.');
    }

    const next = { ...current, ...changes };
    if (next.endAt <= next.startAt) {
      throw Errors.validation([{ field: 'endAt', message: 'Waktu selesai harus setelah waktu mulai.' }]);
    }
    if (current.status === 'active' && 'endAt' in changes && changes.endAt <= now) {
      throw Errors.scheduleInvalid('Waktu selesai yang baru harus berada di masa depan.');
    }

    if (statusChange) {
      if (!canTransition(current.status, requestedStatus)) {
        throw Errors.invalidStatusTransition(current.status, requestedStatus);
      }
      if ((requestedStatus === 'scheduled' || requestedStatus === 'active') && next.endAt <= now) {
        throw Errors.scheduleInvalid('Waktu selesai pemilihan sudah lewat. Perbarui jadwal terlebih dahulu.');
      }
      if (requestedStatus === 'active' && (await candidateRepository.countByElection(connection, id)) < 1) {
        throw Errors.noCandidates();
      }
      changes.status = requestedStatus;
    }

    if (Object.keys(changes).length > 0) {
      try {
        await electionRepository.update(connection, id, changes);
      } catch (error) {
        if (isDuplicateKeyError(error, 'uq_elections_single_active')) throw Errors.anotherElectionActive();
        throw error;
      }

      const auditBase = { actorId: actor.id, entityType: 'election', entityId: id, electionId: id };
      const { status, resultsPublic, ...dataChanges } = changes;
      if (Object.keys(dataChanges).length > 0) {
        const diff = Object.fromEntries(
          Object.entries(dataChanges).map(([field, value]) => [field, { from: current[field], to: value }]),
        );
        await recordAudit(connection, { ...auditBase, action: AUDIT_ACTIONS.ELECTION_UPDATED, metadata: { changes: diff } });
      }
      if (status !== undefined) {
        await recordAudit(connection, {
          ...auditBase,
          action: AUDIT_ACTIONS.ELECTION_STATUS_CHANGED,
          metadata: { from: current.status, to: status },
        });
      }
      if (resultsPublic !== undefined) {
        await recordAudit(connection, {
          ...auditBase,
          action: AUDIT_ACTIONS.ELECTION_RESULTS_VISIBILITY_CHANGED,
          metadata: { resultsPublic },
        });
      }
    }

    const updated = await electionRepository.findById(connection, id);
    return toAdminElection(updated, await adminExtras(connection, id));
  });
}

/** Hanya pemilihan draft/terjadwal (yang pasti belum memiliki suara) yang boleh dihapus. */
export async function deleteElection(id, actor, uploadsDir) {
  const photoUrls = await withTransaction(async (connection) => {
    const current = await electionRepository.findById(connection, id, { lock: 'update' });
    if (!current) throw Errors.electionNotFound();
    if (current.status !== 'draft' && current.status !== 'scheduled') {
      throw Errors.electionLocked('Pemilihan yang sudah dibuka atau selesai tidak dapat dihapus demi integritas data.');
    }
    const candidates = await candidateRepository.listByElection(connection, id);
    try {
      await electionRepository.remove(connection, id);
    } catch (error) {
      // Lapisan pengaman terakhir: FK RESTRICT menolak penghapusan jika ada suara.
      if (isForeignKeyViolation(error)) throw Errors.electionLocked();
      throw error;
    }
    await recordAudit(connection, {
      actorId: actor.id,
      action: AUDIT_ACTIONS.ELECTION_DELETED,
      entityType: 'election',
      entityId: id,
      electionId: id,
      metadata: { title: current.title, status: current.status, candidateCount: candidates.length },
    });
    return candidates.map((candidate) => candidate.photoUrl).filter(Boolean);
  });
  await Promise.all(photoUrls.map((url) => deleteLocalPhoto(url, uploadsDir)));
}
