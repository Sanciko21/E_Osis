import { apiRequest } from './apiClient.js';

export async function login({ email, password }) {
  const payload = await apiRequest('/api/auth/login', { method: 'POST', body: { email, password } });
  return payload.data; // { user, csrfToken }
}

export async function logout() {
  await apiRequest('/api/auth/logout', { method: 'POST' });
}

export async function fetchSession(signal) {
  const payload = await apiRequest('/api/auth/me', { signal });
  return payload.data; // { user, csrfToken }
}
