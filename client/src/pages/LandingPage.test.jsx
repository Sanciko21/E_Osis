import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/apiClient.js';
import * as electionsApi from '../services/electionsApi.js';
import { CANDIDATES, makeElection } from '../test/fixtures.js';
import * as alerts from '../utils/alerts.js';
import LandingPage from './LandingPage.jsx';

vi.mock('../services/electionsApi.js', () => ({
  getCurrentElection: vi.fn(),
  getElectionCandidates: vi.fn(),
  castVote: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

const popup = () => document.querySelector('.swal2-popup');
const swalButton = (name) => within(popup()).getByRole('button', { name });
const swalShows = (text) => waitFor(() => expect(within(popup()).getByText(text)).toBeInTheDocument());

/** Kartu paslon 02 → isi NISN → Lanjut, hingga dialog konfirmasi tampil. */
async function chooseSecondPair(user, nisn = '0012345678') {
  await user.click(await screen.findByRole('button', { name: 'Pilih Paslon 02' }));
  await swalShows('Masukkan NISN-mu');
  await user.type(within(popup()).getByLabelText('Nomor Induk Siswa Nasional (NISN)'), nisn);
  await user.click(swalButton('Lanjut'));
  await swalShows('Yakin dengan pilihanmu?');
}

beforeEach(() => {
  vi.mocked(electionsApi.getCurrentElection).mockResolvedValue({ election: makeElection(), clockOffsetMs: 0 });
  vi.mocked(electionsApi.getElectionCandidates).mockResolvedValue(CANDIDATES);
  vi.mocked(electionsApi.castVote).mockReset();
});

describe('Memilih langsung dari kartu pasangan calon', () => {
  it('saat voting dibuka: setiap kartu punya tombol Pilih dan hero tidak lagi punya tombol login', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Pilih Paslon 01' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pilih Paslon 02' })).toBeEnabled();
    expect(screen.queryByText(/Login untuk Memilih/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pilih Pasangan Calon' })).toHaveAttribute('href', '#kandidat');
    expect(document.querySelector('.hero__copyright')).toHaveTextContent(/^©\s*Hak cipta PTI AM 2026 UNDIKSHA$/);
  });

  it('di luar jadwal tidak ada tombol Pilih (hanya visi & misi)', async () => {
    vi.mocked(electionsApi.getCurrentElection).mockResolvedValue({
      election: makeElection({ status: 'scheduled', phase: 'upcoming', votingOpen: false }),
      clockOffsetMs: 0,
    });
    renderPage();
    expect(await screen.findByRole('button', { name: /Lihat visi & misi lengkap pasangan nomor 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pilih Paslon/ })).not.toBeInTheDocument();
  });

  it('[15] NISN divalidasi di dialog; "Kembali" pada konfirmasi tidak mengirim request', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Pilih Paslon 02' }));
    await swalShows('Masukkan NISN-mu');
    expect(within(popup()).getByText('Citra Maharani')).toBeInTheDocument();

    const input = within(popup()).getByLabelText('Nomor Induk Siswa Nasional (NISN)');
    await user.type(input, '12345');
    await user.click(swalButton('Lanjut'));
    await swalShows('NISN harus terdiri dari 10 digit (sekarang 5 digit).');

    // Spasi yang terketik dibuang; konfirmasi menampilkan nomor urut, Ketua, dan Wakil Ketua.
    await user.clear(input);
    await user.type(input, '0012 345 678');
    await user.click(swalButton('Lanjut'));
    await swalShows('Yakin dengan pilihanmu?');
    expect(within(popup()).getByText('02')).toBeInTheDocument();
    expect(within(popup()).getByText('Dimas Pratama')).toBeInTheDocument();
    expect(electionsApi.castVote).not.toHaveBeenCalled();

    await user.click(swalButton('Kembali'));
    await waitFor(() => expect(popup()).not.toBeInTheDocument());
    expect(electionsApi.castVote).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pilih Paslon 02' })).toBeEnabled();
  });

  it('"Ya, Saya Yakin" mengirim tepat satu request; tombol terkunci sampai server menjawab', async () => {
    let finishVote;
    vi.mocked(electionsApi.castVote).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishVote = () => resolve({ recorded: true });
        }),
    );
    const user = userEvent.setup();
    renderPage();
    await chooseSecondPair(user, '0012 345 678');
    await user.click(swalButton('Ya, Saya Yakin'));

    await waitFor(() => expect(electionsApi.castVote).toHaveBeenCalledTimes(1));
    expect(electionsApi.castVote).toHaveBeenCalledWith(makeElection().id, { nisn: '0012345678', candidateId: CANDIDATES[1].id });
    expect(within(popup()).getByText('Menyimpan suaramu…')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /^Pilih Paslon/, hidden: true })) expect(button).toBeDisabled();

    finishVote();
    await swalShows('Suara berhasil disimpan!');
    await user.click(swalButton('Selesai'));
    await waitFor(() => expect(popup()).not.toBeInTheDocument());
    // Perangkat bersama: tombol kembali aktif untuk siswa berikutnya.
    expect(screen.getByRole('button', { name: 'Pilih Paslon 02' })).toBeEnabled();
    expect(electionsApi.castVote).toHaveBeenCalledTimes(1);
  });

  it('NISN yang sudah memilih ditolak dengan pesan yang jelas', async () => {
    vi.mocked(electionsApi.castVote).mockRejectedValue(
      new ApiError({ kind: 'http', status: 409, code: 'ALREADY_VOTED', message: 'NISN ini sudah digunakan untuk memilih!' }),
    );
    const user = userEvent.setup();
    renderPage();
    await chooseSecondPair(user);
    await user.click(swalButton('Ya, Saya Yakin'));
    await swalShows('NISN ini sudah digunakan untuk memilih!');
  });

  it('klik ganda pada tombol Pilih hanya membuka satu dialog', async () => {
    const promptSpy = vi.spyOn(alerts, 'promptNisn');
    renderPage();
    const button = await screen.findByRole('button', { name: 'Pilih Paslon 02' });
    fireEvent.click(button);
    fireEvent.click(button);
    await swalShows('Masukkan NISN-mu');
    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('.swal2-popup')).toHaveLength(1);
  });

  it('[17] NISN kosong ditolak; huruf, spasi, dan tanda baca dibuang otomatis (maks. 10 digit)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Pilih Paslon 01' }));
    await swalShows('Masukkan NISN-mu');
    await user.click(swalButton('Lanjut'));
    await swalShows('NISN wajib diisi.');

    const input = within(popup()).getByLabelText('Nomor Induk Siswa Nasional (NISN)');
    await user.type(input, 'ab12-34 5678 90123');
    expect(input).toHaveValue('1234567890');
    expect(electionsApi.castVote).not.toHaveBeenCalled();
  });

  it.each([
    ['timeout/jaringan putus', new ApiError({ kind: 'timeout', message: 'timeout' }), 'Status suara belum dapat dipastikan'],
    [
      'VOTE_NOT_RECORDED (server menjamin rollback)',
      new ApiError({ kind: 'http', status: 500, code: 'VOTE_NOT_RECORDED', message: 'Suara BELUM tercatat.' }),
      'Suara belum tersimpan',
    ],
  ])('%s → pesan yang jujur tentang status suara', async (_label, problem, title) => {
    vi.mocked(electionsApi.castVote).mockRejectedValue(problem);
    const user = userEvent.setup();
    renderPage();
    await chooseSecondPair(user);
    await user.click(swalButton('Ya, Saya Yakin'));
    await swalShows(title);
    expect(popup().textContent).not.toMatch(/berhasil disimpan/i);
  });

  it('waktu memilih habis → pesan pemilihan berakhir lalu status pemilihan dimuat ulang', async () => {
    vi.mocked(electionsApi.castVote).mockRejectedValue(
      new ApiError({ kind: 'http', status: 403, code: 'ELECTION_ENDED', message: 'Pemungutan suara sudah berakhir.' }),
    );
    const user = userEvent.setup();
    renderPage();
    await chooseSecondPair(user);
    await user.click(swalButton('Ya, Saya Yakin'));
    await swalShows('Pemungutan suara sudah berakhir');
    await user.click(swalButton('Mengerti'));
    await waitFor(() => expect(electionsApi.getCurrentElection).toHaveBeenCalledTimes(2));
  });

  it('"Pilih pasangan ini" pada dialog visi & misi membuka dialog NISN', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Lihat visi & misi lengkap pasangan nomor 1/ }));
    await user.click(await screen.findByRole('button', { name: 'Pilih pasangan ini' }));
    await swalShows('Masukkan NISN-mu');
    expect(within(popup()).getByText('Andi Saputra')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pilih pasangan ini' })).not.toBeInTheDocument();
  });
});

describe('Tampilan beranda', () => {
  it('FAQ berupa accordion: satu jawaban terbuka dalam satu waktu dan isinya tidak berubah', async () => {
    const user = userEvent.setup();
    renderPage();
    const first = screen.getByRole('button', { name: 'Apakah pilihanku rahasia?' });
    const second = screen.getByRole('button', { name: 'Bisakah aku mengubah pilihan?' });
    // Section bernama juga ber-role region, jadi panel jawaban dicari di dalam daftar FAQ saja.
    const faq = within(document.querySelector('.faq'));
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(faq.queryByRole('region')).not.toBeInTheDocument();

    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    const panel = faq.getByRole('region', { name: 'Apakah pilihanku rahasia?' });
    expect(first).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveTextContent(/NISN hanya dipakai untuk memastikan setiap siswa memilih satu kali/);

    await user.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(faq.getAllByRole('region')).toHaveLength(1));

    await user.click(second);
    await waitFor(() => expect(faq.queryByRole('region')).not.toBeInTheDocument());
  });

  it('jadwal & tahapan memakai data pemilihan asli dengan status tahap tertulis', async () => {
    renderPage();
    const stages = await screen.findByRole('list', { name: 'Tahapan pemilihan' });
    expect(within(stages).getAllByRole('listitem')).toHaveLength(4);
    expect(within(stages).getByText('Tahap saat ini')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lihat Jadwal' })).toHaveAttribute('href', '#jadwal');
  });
});
