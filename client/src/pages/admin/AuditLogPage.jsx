import { useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useResource } from '../../hooks/useResource.js';
import { listAuditLogs, listElections } from '../../services/adminApi.js';
import { ROLE_LABELS, STATUS_LABELS } from '../../utils/election.js';
import { formatShortDateTime } from '../../utils/format.js';

const ACTION_LABELS = {
  'auth.login_success': 'Login berhasil',
  'auth.login_failed': 'Login gagal',
  'auth.logout': 'Logout',
  'election.created': 'Membuat pemilihan',
  'election.updated': 'Mengubah data pemilihan',
  'election.status_changed': 'Mengubah status pemilihan',
  'election.results_visibility_changed': 'Mengatur publikasi hasil',
  'election.deleted': 'Menghapus pemilihan',
  'candidate.created': 'Menambah pasangan calon',
  'candidate.updated': 'Mengubah pasangan calon',
  'candidate.photo_updated': 'Mengganti foto pasangan calon',
  'candidate.deleted': 'Menghapus pasangan calon',
};

const FAILURE_REASONS = {
  unknown_account: 'akun tidak terdaftar',
  invalid_password: 'kata sandi salah',
  inactive_account: 'akun nonaktif',
};

const FIELD_LABELS = {
  title: 'judul',
  description: 'deskripsi',
  startAt: 'waktu mulai',
  endAt: 'waktu selesai',
  eligibleVoterCount: 'jumlah siswa',
  candidateNumber: 'nomor urut',
  chairpersonName: 'nama ketua',
  viceChairpersonName: 'nama wakil',
  vision: 'visi',
  mission: 'misi',
  photoUrl: 'foto',
};

/** Ringkasan metadata yang sudah disanitasi server menjadi kalimat singkat. */
function summarize(log) {
  const meta = log.metadata ?? {};
  switch (log.action) {
    case 'auth.login_failed':
      return `Alasan: ${FAILURE_REASONS[meta.reason] ?? 'tidak diketahui'}${meta.ip ? ` · IP ${meta.ip}` : ''}`;
    case 'auth.login_success':
    case 'auth.logout':
      return meta.ip ? `IP ${meta.ip}` : '';
    case 'election.status_changed':
      return `${STATUS_LABELS[meta.from] ?? meta.from} → ${STATUS_LABELS[meta.to] ?? meta.to}`;
    case 'election.results_visibility_changed':
      return meta.resultsPublic ? 'Hasil dipublikasikan' : 'Hasil disembunyikan';
    case 'election.updated':
      return `Kolom: ${Object.keys(meta.changes ?? {})
        .map((field) => FIELD_LABELS[field] ?? field)
        .join(', ')}`;
    case 'election.created':
    case 'election.deleted':
      return meta.title ?? '';
    case 'candidate.updated':
      return `No. ${meta.candidateNumber} · ${(meta.changedFields ?? []).map((field) => FIELD_LABELS[field] ?? field).join(', ')}`;
    default:
      return meta.candidateNumber ? `No. ${meta.candidateNumber} · ${meta.chairpersonName} & ${meta.viceChairpersonName}` : '';
  }
}

export default function AuditLogPage() {
  useDocumentTitle('Audit Log');
  const [electionId, setElectionId] = useState('');
  const [page, setPage] = useState(1);
  const elections = useResource((signal) => listElections({}, signal), []);
  const logs = useResource((signal) => listAuditLogs({ electionId: electionId || undefined, page }, signal), [electionId, page]);
  const meta = logs.data?.meta;
  const items = logs.data?.items ?? [];

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <p className="eyebrow">Keamanan</p>
          <h1 className="admin-page__title">Audit log aktivitas admin</h1>
          <p className="muted">Catatan tidak memuat password, token, NISN, maupun pilihan suara.</p>
        </div>
        <label className="toolbar__field">
          <span className="field__label field__label--small">Filter pemilihan</span>
          <select
            value={electionId}
            onChange={(event) => {
              setElectionId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua aktivitas</option>
            {(elections.data?.items ?? []).map((election) => (
              <option key={election.id} value={election.id}>
                {election.title}
              </option>
            ))}
          </select>
        </label>
      </header>

      {logs.loading && <LoadingState message="Memuat audit log…" />}
      {!logs.loading && logs.error && <ErrorState error={logs.error} onRetry={logs.reload} />}
      {!logs.loading && !logs.error && items.length === 0 && <EmptyState icon="list" title="Belum ada aktivitas tercatat" />}

      {items.length > 0 && (
        <div className={`table-wrap ${logs.refreshing ? 'is-refreshing' : ''}`}>
          <table className="table table--audit">
            <caption className="sr-only">Daftar aktivitas administratif</caption>
            <thead>
              <tr>
                <th scope="col">Waktu</th>
                <th scope="col">Admin</th>
                <th scope="col">Aktivitas</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map((log) => (
                <tr key={log.id}>
                  <td className="nowrap">
                    <time dateTime={log.createdAt}>{formatShortDateTime(log.createdAt)}</time>
                  </td>
                  <td>
                    {log.admin ? (
                      <>
                        <span className="table__strong">{log.admin.name}</span>
                        <span className="table__sub">{ROLE_LABELS[log.admin.role] ?? log.admin.role}</span>
                      </>
                    ) : (
                      <span className="muted">Tidak dikenal</span>
                    )}
                  </td>
                  <td>
                    <span className={`action-tag ${log.action === 'auth.login_failed' ? 'action-tag--warn' : ''}`}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="table__detail">{summarize(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <nav className="pagination" aria-label="Halaman audit log">
          <button type="button" className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            <Icon name="arrowLeft" size={16} /> Sebelumnya
          </button>
          <span aria-live="polite">
            Halaman {meta.page} dari {meta.totalPages}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Berikutnya <Icon name="arrowRight" size={16} />
          </button>
        </nav>
      )}
    </div>
  );
}
