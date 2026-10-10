import { getPool } from '../config/database.js';
import * as auditRepository from '../repositories/audit.repository.js';
import { sanitizeMetadata } from '../utils/sanitize.js';

export const AUDIT_ACTIONS = Object.freeze({
  LOGIN_SUCCESS: 'auth.login_success',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  ELECTION_CREATED: 'election.created',
  ELECTION_UPDATED: 'election.updated',
  ELECTION_STATUS_CHANGED: 'election.status_changed',
  ELECTION_RESULTS_VISIBILITY_CHANGED: 'election.results_visibility_changed',
  ELECTION_DELETED: 'election.deleted',
  CANDIDATE_CREATED: 'candidate.created',
  CANDIDATE_UPDATED: 'candidate.updated',
  CANDIDATE_PHOTO_UPDATED: 'candidate.photo_updated',
  CANDIDATE_DELETED: 'candidate.deleted',
});

/**
 * Mencatat aktivitas administratif. `db` dapat berupa koneksi transaksi sehingga
 * perubahan data dan catatan auditnya tersimpan (atau batal) bersama-sama.
 * Proses voting siswa sengaja TIDAK pernah memanggil fungsi ini.
 */
export async function recordAudit(db, { actorId = null, action, entityType, entityId = null, electionId = null, metadata }) {
  await auditRepository.insert(db ?? getPool(), {
    adminUserId: actorId,
    action,
    entityType,
    entityId,
    electionId,
    metadata: metadata ? sanitizeMetadata(metadata) : null,
  });
}

export async function listAuditLogs({ electionId, page, pageSize }) {
  const { items, total } = await auditRepository.list(getPool(), {
    electionId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return { items, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}
