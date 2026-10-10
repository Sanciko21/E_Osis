import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import Logo from '../../components/brand/Logo.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { showApiError, showLoginFailed, showLoginSuccess } from '../../utils/alerts.js';

const NOTICES = {
  expired: 'Sesi Anda telah berakhir. Silakan login kembali.',
  'logged-out': 'Anda telah keluar dari dashboard admin.',
  offline: 'Tidak dapat memeriksa sesi karena server tidak terjangkau.',
};

function validate({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Email wajib diisi.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Format email tidak valid.';
  if (!password) errors.password = 'Kata sandi wajib diisi.';
  return errors;
}

export default function LoginPage() {
  useDocumentTitle('Login Admin');
  const { status, notice, login, ensureSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = typeof location.state?.from === 'string' && location.state.from.startsWith('/admin') ? location.state.from : '/admin';
  const noticeKey = location.state?.notice ?? notice;

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (status === 'unknown') ensureSession();
  }, [status, ensureSession]);

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const update = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (errors[field]) setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    const problems = validate(values);
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      document.getElementById(problems.email ? 'login-email' : 'login-password')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const user = await login({ email: values.email.trim(), password: values.password });
      showLoginSuccess(user.name);
      navigate(from, { replace: true });
    } catch (error) {
      setValues((current) => ({ ...current, password: '' }));
      if (error.code === 'INVALID_CREDENTIALS') await showLoginFailed();
      else if (error.code === 'RATE_LIMITED') await showLoginFailed(error.message);
      else await showApiError(error, 'Login gagal');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <aside className="login-page__brand" aria-hidden="true">
        <Logo inverted size={52} />
        <div>
          <p className="login-page__headline">Dashboard Panitia Pemilihan</p>
          <p className="login-page__sub">Kelola jadwal, pasangan calon, dan pantau partisipasi secara real-time.</p>
        </div>
        <ul className="login-page__points">
          <li>
            <Icon name="shield" size={18} /> Akses dilindungi sesi aman
          </li>
          <li>
            <Icon name="list" size={18} /> Setiap aktivitas tercatat di audit log
          </li>
        </ul>
      </aside>

      <main className="login-page__main" id="konten-utama">
        <div className="login-card">
          <div className="login-card__logo">
            <Logo size={44} />
          </div>
          <h1 className="login-card__title">Masuk sebagai admin</h1>
          <p className="login-card__subtitle">Khusus panitia dan pengawas pemilihan OSIS.</p>

          {noticeKey && NOTICES[noticeKey] && (
            <p className={`notice notice--${noticeKey === 'expired' ? 'warning' : 'info'}`} role="status">
              <Icon name="info" size={18} /> {NOTICES[noticeKey]}
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate className="form-stack" aria-busy={submitting}>
            <div className={`field ${errors.email ? 'field--invalid' : ''}`}>
              <label htmlFor="login-email" className="field__label">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                value={values.email}
                onChange={update('email')}
                disabled={submitting}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
              />
              {errors.email && (
                <p id="login-email-error" className="field__error" role="alert">
                  <Icon name="alert" size={16} /> {errors.email}
                </p>
              )}
            </div>

            <div className={`field ${errors.password ? 'field--invalid' : ''}`}>
              <label htmlFor="login-password" className="field__label">
                Kata sandi
              </label>
              <div className="input-with-action">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={values.password}
                  onChange={update('password')}
                  disabled={submitting}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'login-password-error' : undefined}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  aria-pressed={showPassword}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </div>
              {errors.password && (
                <p id="login-password-error" className="field__error" role="alert">
                  <Icon name="alert" size={16} /> {errors.password}
                </p>
              )}
            </div>

            <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting}>
              {submitting ? <span className="spinner spinner--sm" aria-hidden="true" /> : <Icon name="lock" size={18} />}
              {submitting ? 'Memeriksa…' : 'Masuk'}
            </button>
          </form>

          <Link to="/" className="login-card__back">
            <Icon name="arrowLeft" size={16} /> Kembali ke halaman siswa
          </Link>
        </div>
      </main>
    </div>
  );
}
