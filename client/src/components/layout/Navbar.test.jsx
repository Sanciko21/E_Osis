import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import Navbar from './Navbar.jsx';

describe('[17] navigasi responsif', () => {
  it('menu seluler dapat dibuka/ditutup dengan tombol, Escape, dan memilih tautan', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );
    const toggle = screen.getByRole('button', { name: 'Buka menu navigasi' });
    const menu = screen.getByRole('navigation', { name: 'Navigasi utama' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', menu.id);
    expect(menu).not.toHaveClass('is-open');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Tutup menu navigasi');
    expect(menu).toHaveClass('is-open');

    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    await user.click(screen.getByRole('link', { name: 'Hasil' }));
    expect(menu).not.toHaveClass('is-open');
  });

  it('tombol utama "Pilih Sekarang" menuju kartu pasangan calon (memilih langsung di kartu)', () => {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Pilih Sekarang/ })).toHaveAttribute('href', '/#kandidat');
  });
});
