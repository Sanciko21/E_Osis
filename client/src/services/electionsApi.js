import { appConfig } from '../config/appConfig.js';
import { ApiError, apiRequest } from './apiClient.js';

const encode = encodeURIComponent;

/** Selisih jam server terhadap jam perangkat (ms), dihitung saat respons diterima. */
function clockOffset(serverTime) {
  const parsed = serverTime ? new Date(serverTime).getTime() : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed - Date.now();
}

/** Pemilihan publik yang paling relevan (aktif → terjadwal → selesai terbaru), atau null. */
export async function getCurrentElection(signal) {
  const payload = await apiRequest('/api/elections/current', { signal });
  return { election: payload.data, clockOffsetMs: clockOffset(payload.meta?.serverTime) };
}

export async function getPublicElection(electionId, signal) {
  const payload = await apiRequest(`/api/elections/${encode(electionId)}`, { signal });
  return { election: payload.data, clockOffsetMs: clockOffset(payload.meta?.serverTime) };
}

export async function getElectionCandidates(electionId, signal) {
  const payload = await apiRequest(`/api/elections/${encode(electionId)}/candidates`, { signal });
  return payload.data;
}

export async function getPublicResults(electionId, signal) {
  const payload = await apiRequest(`/api/elections/${encode(electionId)}/results`, { signal });
  return payload.data;
}

/**
 * Mengirim suara. Fungsi ini hanya selesai normal bila backend menjawab 201 dengan
 * { data: { recorded: true } } — artinya transaksi sudah COMMIT di database.
 */
export async function castVote(electionId, { nisn, candidateId }) {
  const payload = await apiRequest(`/api/elections/${encode(electionId)}/vote`, {
    method: 'POST',
    body: { nisn, candidateId },
    timeoutMs: appConfig.voteTimeoutMs,
  });
  if (payload?.data?.recorded !== true) {
    throw new ApiError({ kind: 'invalid', message: 'Server tidak memberikan konfirmasi penyimpanan suara.' });
  }
  return payload;
}
