import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, setCsrfToken, setUnauthorizedListener } from './apiClient.js';
import { castVote } from './electionsApi.js';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe('apiClient', () => {
  it('mengirim cookie sesi dan token CSRF hanya pada method yang mengubah data', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, { data: 1 })));
    vi.stubGlobal('fetch', fetchMock);
    setCsrfToken('csrf-123');

    await apiRequest('/api/admin/elections');
    await apiRequest('/api/admin/elections', { method: 'POST', body: { title: 'x' } });

    const [, getOptions] = fetchMock.mock.calls[0];
    const [, postOptions] = fetchMock.mock.calls[1];
    expect(getOptions.credentials).toBe('include');
    expect(getOptions.headers['X-CSRF-Token']).toBeUndefined();
    expect(postOptions.headers['X-CSRF-Token']).toBe('csrf-123');
    expect(postOptions.headers['Content-Type']).toBe('application/json');
    expect(postOptions.body).toBe('{"title":"x"}');
  });

  it('error HTTP diubah menjadi ApiError dengan kode dari backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(409, { error: { code: 'ALREADY_VOTED', message: 'NISN ini sudah digunakan untuk memilih!', requestId: 'r-1' } }),
    ));
    const error = await apiRequest('/api/elections/x/vote', { method: 'POST', body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 409, code: 'ALREADY_VOTED', requestId: 'r-1' });
    expect(error.outcomeUnknown).toBe(false);
  });

  it('koneksi gagal → kind "network"; hasilnya dianggap tidak pasti', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await apiRequest('/api/x').catch((e) => e);
    expect(error.kind).toBe('network');
    expect(error.outcomeUnknown).toBe(true);
  });

  it('server tidak menjawab dalam batas waktu → kind "timeout"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, { signal }) =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    ));
    const error = await apiRequest('/api/x', { timeoutMs: 20 }).catch((e) => e);
    expect(error.kind).toBe('timeout');
    expect(error.outcomeUnknown).toBe(true);
  });

  it('5xx dari proxy dianggap tidak pasti, kecuali VOTE_NOT_RECORDED (rollback terjamin)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }))
      .mockResolvedValueOnce(jsonResponse(500, { error: { code: 'VOTE_NOT_RECORDED', message: 'x' } })));
    const gateway = await apiRequest('/api/x').catch((e) => e);
    expect(gateway).toMatchObject({ kind: 'http', status: 502, code: 'HTTP_502' });
    expect(gateway.outcomeUnknown).toBe(true);
    const rolledBack = await apiRequest('/api/x').catch((e) => e);
    expect(rolledBack.outcomeUnknown).toBe(false);
  });

  it('401 dari endpoint admin memberi tahu aplikasi (sesi berakhir); endpoint publik tidak', async () => {
    const listener = vi.fn();
    const unsubscribe = setUnauthorizedListener(listener);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(401, { error: { code: 'SESSION_EXPIRED', message: 'Sesi berakhir' } })),
    ));
    await apiRequest('/api/elections/current').catch(() => {});
    expect(listener).not.toHaveBeenCalled();
    await apiRequest('/api/admin/dashboard').catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('castVote hanya dianggap berhasil bila backend mengonfirmasi recorded: true', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(201, { data: { recorded: true } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: {} }))
      .mockResolvedValueOnce(new Response('bukan json', { status: 201 })));
    await expect(castVote('e1', { nisn: '0012345678', candidateId: 'c1' })).resolves.toMatchObject({ data: { recorded: true } });
    await expect(castVote('e1', { nisn: '0012345678', candidateId: 'c1' })).rejects.toMatchObject({ kind: 'invalid' });
    const unreadable = await castVote('e1', { nisn: '0012345678', candidateId: 'c1' }).catch((e) => e);
    expect(unreadable.kind).toBe('invalid');
    expect(unreadable.outcomeUnknown).toBe(true);
  });
});
