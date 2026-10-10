import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setCsrfToken, setUnauthorizedListener } from '../services/apiClient.js';
import * as authApi from '../services/authApi.js';

const AuthContext = createContext(null);

/**
 * State sesi admin. Sesi itu sendiri disimpan server (cookie HttpOnly); frontend hanya
 * menyimpan profil & token CSRF di memori. Saat halaman di-refresh, sesi dipulihkan
 * lewat GET /api/auth/me. Halaman siswa tidak pernah memicu pemeriksaan sesi.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'unknown', user: null, notice: null });
  const pendingCheck = useRef(null);

  const applySession = useCallback(({ user, csrfToken }) => {
    setCsrfToken(csrfToken);
    setState({ status: 'authenticated', user, notice: null });
  }, []);

  const clearSession = useCallback((notice = null) => {
    setCsrfToken(null);
    setState({ status: 'anonymous', user: null, notice });
  }, []);

  // Endpoint admin menjawab 401 → sesi habis/dicabut → kembali ke halaman login.
  useEffect(() => setUnauthorizedListener(() => clearSession('expired')), [clearSession]);

  const ensureSession = useCallback(() => {
    if (pendingCheck.current) return pendingCheck.current;
    setState((previous) => (previous.status === 'unknown' ? { ...previous, status: 'checking' } : previous));
    pendingCheck.current = authApi
      .fetchSession()
      .then((session) => {
        applySession(session);
        return true;
      })
      .catch((error) => {
        clearSession(error?.code === 'SESSION_EXPIRED' ? 'expired' : error?.kind === 'http' ? null : 'offline');
        return false;
      })
      .finally(() => {
        pendingCheck.current = null;
      });
    return pendingCheck.current;
  }, [applySession, clearSession]);

  const login = useCallback(
    async (credentials) => {
      const session = await authApi.login(credentials);
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession('logged-out');
    }
  }, [clearSession]);

  const can = useCallback((permission) => state.user?.permissions?.includes(permission) ?? false, [state.user]);

  const value = useMemo(
    () => ({ ...state, ensureSession, login, logout, can }),
    [state, ensureSession, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook pendamping provider
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus dipakai di dalam <AuthProvider>.');
  return context;
}
