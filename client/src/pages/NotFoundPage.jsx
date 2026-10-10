import { Link } from 'react-router';
import Icon from '../components/ui/Icon.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export default function NotFoundPage() {
  useDocumentTitle('Halaman Tidak Ditemukan');
  return (
    <div className="page-center">
      <div className="error-page">
        <p className="error-page__code">404</p>
        <h1>Halaman tidak ditemukan</h1>
        <p>Alamat yang kamu buka tidak tersedia. Periksa kembali tautannya atau kembali ke beranda.</p>
        <div className="button-row">
          <Link to="/" className="btn btn--primary">
            <Icon name="home" size={18} /> Ke beranda
          </Link>
          <Link to="/#kandidat" className="btn btn--secondary">
            <Icon name="ballot" size={18} /> Pilih pasangan calon
          </Link>
        </div>
      </div>
    </div>
  );
}
