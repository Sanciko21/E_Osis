import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import Footer from '../components/layout/Footer.jsx';
import Navbar from '../components/layout/Navbar.jsx';
import { initAos, refreshAos } from '../lib/aos.js';

export default function PublicLayout() {
  const location = useLocation();

  // AOS diinisialisasi sekali per halaman (dijaga di lib/aos.js), bukan di setiap render.
  useEffect(() => {
    initAos();
  }, []);

  // Posisi elemen dihitung ulang saat route berganti.
  useEffect(() => {
    refreshAos();
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#konten-utama">
        Lewati ke konten utama
      </a>
      <Navbar />
      <main id="konten-utama" tabIndex={-1} className="app-main">
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
