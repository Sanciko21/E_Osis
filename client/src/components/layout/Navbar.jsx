import { useEffect, useId, useState } from 'react';
import { Link, NavLink } from 'react-router';
import Logo from '../brand/Logo.jsx';
import Icon from '../ui/Icon.jsx';

const LINKS = [
  { to: '/', label: 'Beranda', icon: 'home', end: true },
  { to: '/#kandidat', label: 'Pasangan Calon', icon: 'users', hash: true },
  { to: '/#jadwal', label: 'Jadwal', icon: 'calendar', hash: true },
  { to: '/hasil', label: 'Hasil', icon: 'chart' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuId = useId();
  const close = () => setOpen(false);

  // Bayangan navbar muncul setelah halaman digulir sedikit.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header className={`navbar ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container navbar__inner">
        <Link to="/" className="navbar__brand" aria-label="E-OSIS, kembali ke beranda" onClick={close}>
          <Logo size={38} />
        </Link>

        <button
          type="button"
          className="icon-btn navbar__toggle"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? 'x' : 'menu'} />
        </button>

        <nav id={menuId} className={`navbar__menu ${open ? 'is-open' : ''}`} aria-label="Navigasi utama">
          <ul className="navbar__links">
            {LINKS.map((link) => (
              <li key={link.to}>
                {link.hash ? (
                  <Link to={link.to} className="navbar__link" onClick={close}>
                    <Icon name={link.icon} size={18} />
                    {link.label}
                  </Link>
                ) : (
                  <NavLink to={link.to} end={link.end} className="navbar__link" onClick={close}>
                    <Icon name={link.icon} size={18} />
                    {link.label}
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
          <Link to="/#kandidat" className="btn btn--accent navbar__cta" onClick={close}>
            <Icon name="ballot" size={18} />
            Pilih Sekarang
          </Link>
        </nav>
      </div>
    </header>
  );
}
