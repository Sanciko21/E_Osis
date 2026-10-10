import { apiRequest } from './apiClient.js';

const encode = encodeURIComponent;

function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export async function getDashboard({ electionId } = {}, signal) {
  const payload = await apiRequest(`/api/admin/dashboard${query({ electionId })}`, { signal });
  return { ...payload.data, serverTime: payload.meta?.serverTime ?? null };
}

export async function listElections(params = {}, signal) {
  const payload = await apiRequest(`/api/admin/elections${query({ pageSize: 100, ...params })}`, { signal });
  return { items: payload.data, meta: payload.meta };
}

export async function getElection(id, signal) {
  return (await apiRequest(`/api/admin/elections/${encode(id)}`, { signal })).data;
}

export async function createElection(body) {
  return (await apiRequest('/api/admin/elections', { method: 'POST', body })).data;
}

export async function updateElection(id, body) {
  return (await apiRequest(`/api/admin/elections/${encode(id)}`, { method: 'PATCH', body })).data;
}

export async function deleteElection(id) {
  await apiRequest(`/api/admin/elections/${encode(id)}`, { method: 'DELETE' });
}

export async function listCandidates(electionId, signal) {
  return (await apiRequest(`/api/admin/elections/${encode(electionId)}/candidates`, { signal })).data;
}

export async function createCandidate(electionId, body) {
  return (await apiRequest(`/api/admin/elections/${encode(electionId)}/candidates`, { method: 'POST', body })).data;
}

export async function updateCandidate(id, body) {
  return (await apiRequest(`/api/admin/candidates/${encode(id)}`, { method: 'PATCH', body })).data;
}

export async function deleteCandidate(id) {
  await apiRequest(`/api/admin/candidates/${encode(id)}`, { method: 'DELETE' });
}

export async function uploadCandidatePhoto(id, file) {
  const formData = new FormData();
  formData.append('photo', file);
  return (await apiRequest(`/api/admin/candidates/${encode(id)}/photo`, { method: 'PUT', formData, timeoutMs: 60_000 })).data;
}

export async function getElectionResults(id, signal) {
  return (await apiRequest(`/api/admin/elections/${encode(id)}/results`, { signal })).data;
}

export async function listAuditLogs({ electionId, page = 1, pageSize = 25 } = {}, signal) {
  const path = electionId
    ? `/api/admin/elections/${encode(electionId)}/audit-logs${query({ page, pageSize })}`
    : `/api/admin/audit-logs${query({ page, pageSize })}`;
  const payload = await apiRequest(path, { signal });
  return { items: payload.data, meta: payload.meta };
}
