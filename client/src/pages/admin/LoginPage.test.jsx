import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from '../../components/routing/ProtectedRoute.jsx';
import { AuthProvider } from '../../context/AuthContext.jsx';
import { ApiError, apiRequest } from '../../services/apiClient.js';
import * as authApi from '../../services/authApi.js';
import LoginPage from './LoginPage.jsx';

vi.mock('../../services/authApi.js', () => ({ login: vi.fn(), logout: vi.fn(), fetchSession: vi.fn() }));

const USER = { id: 'u1', name: 'Bu Ratna', email: 'ratna@sekolah.sch.id', role: 'admin', permissions: ['dashboard:view'] };
const unauthorized = () => new ApiError({ kind: 'http', status: 401, code: 'UNAUTHENTICATED', message: 'Silakan login' });

function renderApp(initialEntry) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/admin/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <h1>Konten admin</h1>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const popup = () => document.querySelector('.swal2-popup');

beforeEach(() => {
  vi.mocked(authApi.fetchSession).mockRejectedValue(unauthorized());
});

describe('Login admin', () => {
  it('validasi input sebelum request', async () => {
    const user = userEvent.setup();
    renderApp('/admin/login');
    await user.click(await screen.findByRole('button', { name: 'Masuk' }));
    expect(screen.getByText('Email wajib diisi.')).toBeInTheDocument();
    expect(screen.getByText('Kata sandi wajib diisi.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'bukan-email');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));
    expect(screen.getByText('Format email tidak valid.')).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('login berhasil → notifikasi SweetAlert2 dan masuk ke dashboard', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ user: USER, csrfToken: 'csrf' });
    const user = userEvent.setup();
    renderApp('/admin/login');
    await user.type(await screen.findByLabelText('Email'), USER.email);
    await user.type(screen.getByLabelText('Kata sandi'), 'PasswordKuat2026');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(await screen.findByRole('heading', { name: 'Konten admin' })).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledWith({ email: USER.email, password: 'PasswordKuat2026' });
    await waitFor(() => expect(within(popup()).getByText(/Login berhasil/)).toBeInTheDocument());
  });

  it('login gagal → SweetAlert2 "Login gagal" dan kata sandi dikosongkan', async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiError({ kind: 'http', status: 401, code: 'INVALID_CREDENTIALS', message: 'Email atau kata sandi salah.' }),
    );
    const user = userEvent.setup();
    renderApp('/admin/login');
    await user.type(await screen.findByLabelText('Email'), USER.email);
    await user.type(screen.getByLabelText('Kata sandi'), 'salah-sekali-123');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    await waitFor(() => expect(within(popup()).getByText('Login gagal')).toBeInTheDocument());
    expect(within(popup()).getByText('Email atau kata sandi salah.')).toBeInTheDocument();
    expect(screen.getByLabelText('Kata sandi')).toHaveValue('');
  });
});

describe('Sesi admin: refresh, sesi kedaluwarsa, dan perpindahan route', () => {
  it('tanpa sesi, halaman admin dialihkan ke login', async () => {
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Masuk sebagai admin' })).toBeInTheDocument();
    expect(screen.queryByText('Konten admin')).not.toBeInTheDocument();
  });

  it('refresh halaman memulihkan sesi dari cookie (GET /api/auth/me)', async () => {
    vi.mocked(authApi.fetchSession).mockResolvedValue({ user: USER, csrfToken: 'csrf' });
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Konten admin' })).toBeInTheDocument();
  });

  it('API admin menjawab 401 di tengah sesi → kembali ke login dengan pesan sesi berakhir', async () => {
    vi.mocked(authApi.fetchSession).mockResolvedValue({ user: USER, csrfToken: 'csrf' });
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Konten admin' })).toBeInTheDocument();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'SESSION_EXPIRED', message: 'Sesi berakhir' } }), { status: 401 }),
    ));
    await apiRequest('/api/admin/dashboard').catch(() => {});
    vi.unstubAllGlobals();

    expect(await screen.findByText('Sesi Anda telah berakhir. Silakan login kembali.')).toBeInTheDocument();
    expect(screen.queryByText('Konten admin')).not.toBeInTheDocument();
  });
});
