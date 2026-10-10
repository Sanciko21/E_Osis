import { act, render, screen, waitFor } from '@testing-library/react';
import AOS from 'aos';
import { gsap } from 'gsap';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Hero from './components/landing/Hero.jsx';
import { AnimatedNumber } from './components/ui/StatCard.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { routes } from './routes.jsx';
import * as electionsApi from './services/electionsApi.js';
import { setReducedMotion } from './test/motion.js';
import { CANDIDATES, makeElection } from './test/fixtures.js';
import { formatNumber } from './utils/format.js';
import { aos } from './utils/motion.js';

vi.mock('aos', () => ({ default: { init: vi.fn(), refresh: vi.fn(), refreshHard: vi.fn() } }));
vi.mock('./services/electionsApi.js', () => ({
  getCurrentElection: vi.fn(),
  getElectionCandidates: vi.fn(),
  getPublicElection: vi.fn(),
  getPublicResults: vi.fn(),
  castVote: vi.fn(),
}));

const activeTweens = () => gsap.globalTimeline.getChildren(true, true, true).length;

beforeEach(() => {
  vi.mocked(electionsApi.getCurrentElection).mockResolvedValue({ election: makeElection(), clockOffsetMs: 0 });
  vi.mocked(electionsApi.getElectionCandidates).mockResolvedValue(CANDIDATES);
});

describe('[16] animasi dibersihkan saat komponen dilepas', () => {
  it('Hero: timeline GSAP dibuat dalam gsap.context() dan di-revert saat unmount', () => {
    const contextSpy = vi.spyOn(gsap, 'context');
    const { unmount, container } = render(<Hero election={makeElection()} loading={false} />, {
      wrapper: ({ children }) => (
        <RouterProvider router={createMemoryRouter([{ path: '/', element: children }])} />
      ),
    });

    expect(contextSpy).toHaveBeenCalledTimes(1);
    const [, scope] = contextSpy.mock.calls[0];
    expect(scope.current ?? scope).toBe(container.querySelector('.hero'));
    const context = contextSpy.mock.results[0].value;
    const revertSpy = vi.spyOn(context, 'revert');
    expect(activeTweens()).toBeGreaterThan(0);

    unmount();
    expect(revertSpy).toHaveBeenCalledTimes(1);
    expect(activeTweens()).toBe(0); // tidak ada tween yang tertinggal
  });

  it('Hero dengan prefers-reduced-motion tidak membuat animasi sama sekali', () => {
    setReducedMotion(true);
    const contextSpy = vi.spyOn(gsap, 'context');
    render(<Hero election={makeElection()} loading={false} />, {
      wrapper: ({ children }) => <RouterProvider router={createMemoryRouter([{ path: '/', element: children }])} />,
    });
    expect(contextSpy).not.toHaveBeenCalled();
    expect(activeTweens()).toBe(0);
    // Atribut AOS juga tidak dipasang sehingga konten tidak pernah tersembunyi.
    expect(aos('fade-up')).toEqual({});
  });

  it('angka statistik (GSAP) di-revert saat dilepas dan nilai akhir tetap tersedia', () => {
    const { unmount, rerender, container } = render(<AnimatedNumber value={120} format={formatNumber} />);
    expect(screen.getByText('120')).toHaveClass('sr-only');
    expect(activeTweens()).toBe(1);
    rerender(<AnimatedNumber value={140} format={formatNumber} />);
    expect(activeTweens()).toBe(1); // tween lama dibersihkan sebelum yang baru dibuat
    unmount();
    expect(activeTweens()).toBe(0);
    expect(container.innerHTML).toBe('');
  });
});

describe('[16] berpindah halaman tidak menimbulkan error', () => {
  it('beranda ↔ hasil ↔ halaman 404: AOS hanya diinisialisasi sekali, GSAP dibersihkan', async () => {
    const errors = vi.spyOn(console, 'error');
    const contextSpy = vi.spyOn(gsap, 'context');
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { name: /Suaramu Menentukan/ })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /Andi Saputra/ })).toBeInTheDocument();
    const firstHeroContext = contextSpy.mock.results[0].value;
    const revertSpy = vi.spyOn(firstHeroContext, 'revert');

    await act(() => router.navigate('/hasil'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Pemilihan Ketua OSIS Uji' })).toBeInTheDocument();
    expect(revertSpy).toHaveBeenCalled();
    expect(activeTweens()).toBe(0);

    // Alamat bilik suara lama dialihkan ke kartu pasangan calon di beranda.
    await act(() => router.navigate('/pilih'));
    expect(await screen.findByRole('heading', { name: /Suaramu Menentukan/ })).toBeInTheDocument();
    expect(router.state.location).toMatchObject({ pathname: '/', hash: '#kandidat' });
    await act(() => router.navigate('/halaman-yang-tidak-ada'));
    expect(await screen.findByText('Halaman tidak ditemukan')).toBeInTheDocument();
    await act(() => router.navigate('/'));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Suaramu Menentukan/ })).toBeInTheDocument());

    expect(AOS.init).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });
});
