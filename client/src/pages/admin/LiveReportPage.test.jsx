import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '../../services/adminApi.js';
import { makeResults } from '../../test/fixtures.js';
import LiveReportPage from './LiveReportPage.jsx';

vi.mock('../../services/adminApi.js', () => ({ getDashboard: vi.fn() }));

function renderPage(entry = '/admin/live') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LiveReportPage />
    </MemoryRouter>,
  );
}

const card = (name) => screen.getByRole('article', { name: new RegExp(name) });

beforeEach(() => {
  vi.mocked(adminApi.getDashboard).mockResolvedValue({
    electionCounts: {},
    focusElectionId: 'e1',
    results: makeResults({ votes: [6, 4], eligibleVoters: 20 }),
  });
});

describe('Live Report (panel proyektor)', () => {
  it('menampilkan foto, suara, persentase, peringkat & selisih tiap paslon serta penanda suara terbanyak', async () => {
    renderPage();
    const first = await screen.findByRole('article', { name: /Andi Saputra/ });
    expect(within(first).getByRole('img', { name: /Foto pasangan calon nomor 1/ })).toBeInTheDocument();
    expect(first).toHaveTextContent('Nomor urut 01');
    expect(first).toHaveTextContent('6'); // nilai akhir angka beranimasi (teks sr-only)
    expect(first).toHaveTextContent('60%');
    expect(first).toHaveTextContent('Suara terbanyak');
    expect(within(first).getByText('Unggul').nextElementSibling).toHaveTextContent('+2 suara');
    expect(within(first).getByText('Peringkat').nextElementSibling).toHaveTextContent('1 dari 2');

    const second = card('Citra Maharani');
    expect(second).toHaveTextContent('40%');
    expect(second).not.toHaveTextContent('Suara terbanyak');
    expect(within(second).getByText('Selisih dari teratas').nextElementSibling).toHaveTextContent('2 suara');
  });

  it('menampilkan partisipasi, grafik perbandingan & persentase, serta label hasil sementara', async () => {
    renderPage();
    expect(await screen.findByText(/Live · hasil sementara/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Partisipasi pemilih' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByRole('img', { name: /Grafik batang jumlah suara/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Grafik donat persentase suara/ })).toBeInTheDocument();
    expect(screen.getByText('Belum memilih').nextElementSibling).toHaveTextContent('10');
  });

  it('memakai pemilihan dari alamat (?pemilihan=) dan menandai hasil akhir', async () => {
    vi.mocked(adminApi.getDashboard).mockResolvedValue({
      electionCounts: {},
      focusElectionId: 'e2',
      results: { ...makeResults({ votes: [0, 0] }), isFinal: true },
    });
    renderPage('/admin/live?pemilihan=e2');
    expect(await screen.findByText('Hasil akhir')).toBeInTheDocument();
    expect(adminApi.getDashboard).toHaveBeenCalledWith({ electionId: 'e2' }, expect.anything());
    // Belum ada suara: tidak ada grafik kosong, tidak ada pemenang.
    expect(screen.getAllByText('Menunggu suara pertama masuk…')).toHaveLength(2);
    expect(screen.queryByText('Suara terbanyak')).not.toBeInTheDocument();
  });
});
