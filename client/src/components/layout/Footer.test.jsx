import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import Footer from './Footer.jsx';

describe('Footer', () => {
  it('menampilkan hak cipta PTI AM 2026 UNDIKSHA dan tidak lagi menautkan ke bilik suara lama', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.getByText(/PTI AM 2026 UNDIKSHA/)).toHaveTextContent(/^©\s*Hak cipta PTI AM 2026 UNDIKSHA$/);
    expect(screen.queryByRole('link', { name: /Bilik suara/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/pilih"]')).toBeNull();
  });
});
