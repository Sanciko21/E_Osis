import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CANDIDATES } from '../../test/fixtures.js';
import CandidateCard from './CandidateCard.jsx';

const withPhoto = { ...CANDIDATES[0], photoUrl: '/uploads/candidates/foto-paslon.png' };

function renderCard(candidate = withPhoto, props = {}) {
  const onShowDetail = vi.fn();
  const view = render(<CandidateCard candidate={candidate} onShowDetail={onShowDetail} {...props} />);
  return { ...view, onShowDetail, wrap: view.container.querySelector('.candidate-card-wrap') };
}

describe('Kartu pasangan calon (foto berlatar logo sekolah)', () => {
  it('menampilkan foto paslon di depan logo sekolah dekoratif', () => {
    const { container } = renderCard();
    expect(screen.getByRole('img', { name: /Foto pasangan calon nomor 1: Andi Saputra dan Bunga Lestari/ })).toHaveAttribute(
      'src',
      withPhoto.photoUrl,
    );
    const logo = container.querySelector('.candidate-photo__logo');
    expect(logo).toHaveAttribute('src', '/logo-sekolah.png');
    expect(logo).toHaveAttribute('alt', ''); // dekoratif: tidak dibacakan pembaca layar
  });

  it('tanpa foto atau foto gagal dimuat → inisial; logo yang tidak ada disembunyikan', () => {
    const { unmount } = renderCard(CANDIDATES[0]);
    expect(screen.getByRole('img', { name: /Foto pasangan calon nomor 1/ })).toHaveTextContent('ASBL');
    unmount();

    const { container } = renderCard();
    fireEvent.error(screen.getByRole('img', { name: /Foto pasangan calon nomor 1/ }));
    expect(screen.getByRole('img', { name: /Foto pasangan calon nomor 1/ })).toHaveClass('candidate-photo__placeholder');
    fireEvent.error(container.querySelector('.candidate-photo__logo'));
    expect(container.querySelector('.candidate-photo__logo')).toBeNull();
  });

  it('efek melayang mengikuti posisi mouse, mengabaikan sentuhan, dan kembali datar saat kursor keluar', () => {
    const { wrap } = renderCard();
    wrap.getBoundingClientRect = () => ({ left: 100, top: 50, width: 200, height: 400 });

    fireEvent.pointerMove(wrap, { pointerType: 'touch', clientX: 300, clientY: 450 });
    expect(wrap.style.getPropertyValue('--px')).toBe('');

    fireEvent.pointerMove(wrap, { pointerType: 'mouse', clientX: 300, clientY: 50 });
    expect(wrap.style.getPropertyValue('--px')).toBe('1.000'); // tepi kanan
    expect(wrap.style.getPropertyValue('--py')).toBe('-1.000'); // tepi atas

    fireEvent.pointerLeave(wrap);
    expect(wrap.style.getPropertyValue('--px')).toBe('');
    expect(wrap.style.getPropertyValue('--py')).toBe('');
  });

  it('kartu tampil utuh tanpa grid induk (animasi masuk hanya dipicu grid) dan tombol detail berfungsi', async () => {
    const { wrap, onShowDetail } = renderCard();
    expect(wrap.style.opacity).toBe('');
    expect(wrap.querySelector('.candidate-card')).not.toHaveAttribute('style');

    await userEvent.setup().click(screen.getByRole('button', { name: /Lihat visi & misi lengkap/ }));
    expect(onShowDetail).toHaveBeenCalledWith(withPhoto);
  });

  it('tombol "Pilih" setiap paslon seragam (penekanan setara) dan memanggil onVote dengan paslon tersebut', async () => {
    const onVote = vi.fn();
    const { unmount } = renderCard(withPhoto, { votingOpen: true, onVote });
    const first = screen.getByRole('button', { name: 'Pilih Paslon 01' });
    const firstClass = first.className;
    await userEvent.setup().click(first);
    expect(onVote).toHaveBeenCalledWith(withPhoto);
    unmount();

    renderCard(CANDIDATES[1], { votingOpen: true, onVote });
    expect(screen.getByRole('button', { name: 'Pilih Paslon 02' }).className).toBe(firstClass);
  });
});
