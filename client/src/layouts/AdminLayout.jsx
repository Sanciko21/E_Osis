import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import Logo from '../components/brand/Logo.jsx';
import Icon from '../components/ui/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_LABELS } from '../utils/election.js';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: 'chart', end: true },
  { to: '/admin/live', label: 'Live Report', icon: 'monitor' },
  { to: '/admin/pemilihan', label: 'Pemilihan & Kandidat', icon: 'calendar' },
  { to: '/admin/audit-log', label: 'Audit Log', icon: 'list' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [path, setPath] = useState(location.pathname);

  // Tutup menu seluler saat berpindah halaman.
  if (path !== location.pathname) {
    setPath(location.pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  async function handleLogout() {
    await logout();
    navigate('/admin/login', { replace: true, state: { notice: 'logged-out' } });
  }

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main">
        Lewati ke konten utama
      </a>

      <header className="admin-topbar">
        <Link to="/admin" className="admin-topbar__brand">
          <Logo size={34} showSchool={false} />
        </Link>
        <button
          type="button"
          className="icon-btn"
          aria-expanded={menuOpen}
          aria-controls="admin-sidebar"
          aria-label={menuOpen ? 'Tutup menu admin' : 'Buka menu admin'}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <Icon name={menuOpen ? 'x' : 'menu'} />
        </button>
      </header>

      <aside id="admin-sidebar" className={`admin-sidebar ${menuOpen ? 'is-open' : ''}`}>
        <Link to="/admin" className="admin-sidebar__brand">
          <Logo inverted size={38} />
        </Link>
        <nav className="admin-nav" aria-label="Navigasi admin">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="admin-nav__link">
              <Icon name={item.icon} size={20} />
              {item.label}
            </NavLink>
          ))}
          <a href="/" className="admin-nav__link" target="_blank" rel="noopener noreferrer">
            <Icon name="home" size={20} />
            Situs publik
            <span className="sr-only"> (tab baru)</span>
          </a>
        </nav>
        <div className="admin-user">
          <p className="admin-user__name">{user?.name}</p>
          <p className="admin-user__email">{user?.email}</p>
          <span className="role-chip">{ROLE_LABELS[user?.role] ?? user?.role}</span>
          <button type="button" className="btn btn--ghost-light btn--block" onClick={handleLogout}>
            <Icon name="logout" size={18} /> Keluar
          </button>
        </div>
      </aside>
      {menuOpen && <button type="button" className="admin-backdrop" aria-label="Tutup menu" onClick={() => setMenuOpen(false)} />}

      <main id="admin-main" className="admin-main" tabIndex={-1}>
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}
