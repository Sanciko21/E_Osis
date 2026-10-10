import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import Icon from '../ui/Icon.jsx';

/** Ditampilkan bila sebuah halaman gagal dirender atau gagal dimuat (mis. koneksi putus). */
export default function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const chunkFailed = /dynamically imported module|Failed to fetch|Importing a module script failed/i.test(
    String(error?.message ?? ''),
  );

  return (
    <div className="page-center">
      <div className="error-page" role="alert">
        <Icon name="alert" size={40} />
        <h1>{notFound ? 'Halaman tidak ditemukan' : 'Terjadi kesalahan'}</h1>
        <p>
          {chunkFailed
            ? 'Bagian halaman gagal dimuat, kemungkinan karena koneksi terputus. Muat ulang halaman untuk mencoba lagi.'
            : 'Maaf, halaman ini tidak dapat ditampilkan. Silakan kembali ke beranda atau muat ulang.'}
        </p>
        <div className="button-row">
          <button type="button" className="btn btn--secondary" onClick={() => window.location.reload()}>
            <Icon name="refresh" size={18} />
            Muat ulang
          </button>
          <Link className="btn btn--primary" to="/">
            <Icon name="home" size={18} />
            Ke beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
