import Icon from './Icon.jsx';

/** Status memuat: diumumkan ke pembaca layar lewat role="status". */
export function LoadingState({ message = 'Memuat data…', compact = false }) {
  return (
    <div className={`state state--loading ${compact ? 'state--compact' : ''}`} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function describe(error) {
  if (!error) return 'Terjadi kesalahan.';
  if (error.kind === 'network') return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
  if (error.kind === 'timeout') return 'Server terlalu lama merespons.';
  if (error.status >= 500) return 'Server sedang mengalami gangguan. Coba beberapa saat lagi.';
  return error.message || 'Terjadi kesalahan.';
}

export function ErrorState({ title = 'Data gagal dimuat', error, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <Icon name="alert" size={28} />
      <div>
        <p className="state__title">{title}</p>
        <p className="state__text">{describe(error)}</p>
        {error?.requestId && <p className="state__meta">Kode referensi: {error.requestId}</p>}
      </div>
      {onRetry && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
          <Icon name="refresh" size={16} />
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = 'info', title, children, action }) {
  return (
    <div className="state state--empty">
      <span className="state__icon">
        <Icon name={icon} size={28} />
      </span>
      <p className="state__title">{title}</p>
      {children && <div className="state__text">{children}</div>}
      {action}
    </div>
  );
}
