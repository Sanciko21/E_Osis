import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext.jsx';
import { LoadingState } from '../ui/States.jsx';

/** Halaman admin hanya untuk sesi yang valid; selain itu diarahkan ke halaman login. */
export default function ProtectedRoute({ children }) {
  const { status, notice, ensureSession } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (status === 'unknown') ensureSession();
  }, [status, ensureSession]);

  if (status === 'unknown' || status === 'checking') {
    return (
      <div className="page-center">
        <LoadingState message="Memeriksa sesi admin…" />
      </div>
    );
  }
  if (status !== 'authenticated') {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search, notice }} />;
  }
  return children;
}
