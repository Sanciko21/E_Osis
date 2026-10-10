import { Suspense, lazy } from 'react';
import { Navigate } from 'react-router';
import ProtectedRoute from './components/routing/ProtectedRoute.jsx';
import RouteError from './components/routing/RouteError.jsx';
import { LoadingState } from './components/ui/States.jsx';
import PublicLayout from './layouts/PublicLayout.jsx';
import LandingPage from './pages/LandingPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

// Halaman yang memuat Chart.js / khusus admin dipecah (code splitting) agar beranda
// (tempat siswa memilih lewat kartu paslon) tetap ringan dibuka di ponsel/jaringan sekolah.
const ResultsPage = lazy(() => import('./pages/ResultsPage.jsx'));
const LoginPage = lazy(() => import('./pages/admin/LoginPage.jsx'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout.jsx'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage.jsx'));
const ElectionsPage = lazy(() => import('./pages/admin/ElectionsPage.jsx'));
const ElectionFormPage = lazy(() => import('./pages/admin/ElectionFormPage.jsx'));
const CandidatesPage = lazy(() => import('./pages/admin/CandidatesPage.jsx'));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage.jsx'));

function Lazy({ children }) {
  return (
    <Suspense
      fallback={
        <div className="page-center">
          <LoadingState message="Memuat halaman…" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export const routes = [
  {
    path: '/',
    element: <PublicLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <LandingPage /> },
      // Bilik suara lama: memilih kini langsung di kartu paslon beranda; tautan/bookmark lama tetap berguna.
      { path: 'pilih', element: <Navigate to="/#kandidat" replace /> },
      { path: 'hasil', element: <Lazy><ResultsPage /></Lazy> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/admin/login',
    element: <Lazy><LoginPage /></Lazy>,
    errorElement: <RouteError />,
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <Lazy>
          <AdminLayout />
        </Lazy>
      </ProtectedRoute>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Lazy><DashboardPage /></Lazy> },
      { path: 'pemilihan', element: <Lazy><ElectionsPage /></Lazy> },
      { path: 'pemilihan/baru', element: <Lazy><ElectionFormPage /></Lazy> },
      { path: 'pemilihan/:electionId/ubah', element: <Lazy><ElectionFormPage /></Lazy> },
      { path: 'pemilihan/:electionId/kandidat', element: <Lazy><CandidatesPage /></Lazy> },
      { path: 'audit-log', element: <Lazy><AuditLogPage /></Lazy> },
    ],
  },
];
