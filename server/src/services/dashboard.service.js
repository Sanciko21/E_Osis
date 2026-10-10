import { getPool } from '../config/database.js';
import * as electionRepository from '../repositories/election.repository.js';
import { Errors } from '../utils/errors.js';
import { getAdminResults } from './results.service.js';

/**
 * Ringkasan dashboard: jumlah pemilihan per status + rekap pemilihan yang dipilih
 * (default: pemilihan aktif → terjadwal → selesai terbaru → draft terbaru).
 */
export async function getDashboard({ electionId }) {
  const pool = getPool();
  const [electionCounts, focus] = await Promise.all([
    electionRepository.countByStatus(pool),
    electionId ? electionRepository.findById(pool, electionId) : electionRepository.findDashboardFocus(pool),
  ]);
  if (electionId && !focus) throw Errors.electionNotFound();
  return {
    electionCounts,
    focusElectionId: focus?.id ?? null,
    results: focus ? await getAdminResults(focus.id) : null,
  };
}
