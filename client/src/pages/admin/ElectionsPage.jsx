import { useState } from 'react';
import { Link } from 'react-router';
import Icon from '../../components/ui/Icon.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useResource } from '../../hooks/useResource.js';
import { deleteElection, listElections, updateElection } from '../../services/adminApi.js';
import {
  confirmCloseElection,
  confirmDeleteElection,
  confirmOpenElection,
  confirmResultsVisibility,
  confirmScheduleElection,
  confirmUnscheduleElection,
  showApiError,
  showSuccessToast,
} from '../../utils/alerts.js';
import { STATUS_LABELS } from '../../utils/election.js';
import { formatDateRange, formatNumber } from '../../utils/format.js';

const TRANSITION_ACTIONS = {
  scheduled: { label: 'Umumkan jadwal', icon: 'calendar', confirm: confirmScheduleElection, done: 'Jadwal pemilihan diumumkan.' },
  draft: { label: 'Jadikan draf', icon: 'edit', confirm: confirmUnscheduleElection, done: 'Pemilihan dikembalikan ke draf.' },
  active: { label: 'Buka pemungutan suara', icon: 'ballot', confirm: confirmOpenElection, done: 'Pemungutan suara dibuka.', primary: true },
  completed: { label: 'Tutup pemilihan', icon: 'lock', confirm: confirmCloseElection, done: 'Pemilihan ditutup.', danger: true },
};

export default function ElectionsPage() {
  useDocumentTitle('Kelola Pemilihan');
  const { can } = useAuth();
  const { data, error, loading, refreshing, reload } = useResource((signal) => listElections({}, signal), []);
  const [busyId, setBusyId] = useState(null);
  const canManage = can('elections:manage');
  const canChangeStatus = can('elections:change-status');
  const canPublish = can('results:publish');

  async function run(election, confirmFn, action, successMessage) {
    if (busyId) return;
    if (!(await confirmFn())) return;
    setBusyId(election.id);
    try {
      await action();
      showSuccessToast(successMessage);
      await reload();
    } catch (problem) {
      await showApiError(problem, 'Perubahan gagal disimpan');
    } finally {
      setBusyId(null);
    }
  }

  const elections = data?.items ?? [];

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <p className="eyebrow">Manajemen</p>
          <h1 className="admin-page__title">Pemilihan &amp; jadwal</h1>
        </div>
        {canManage && (
          <Link to="/admin/pemilihan/baru" className="btn btn--primary">
            <Icon name="plus" size={18} /> Buat pemilihan
          </Link>
        )}
      </header>

      {loading && <LoadingState message="Memuat daftar pemilihan…" />}
      {!loading && error && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && elections.length === 0 && (
        <EmptyState icon="calendar" title="Belum ada pemilihan">
          {canManage ? 'Klik "Buat pemilihan" untuk menyiapkan pemilihan pertama.' : 'Panitia belum membuat pemilihan.'}
        </EmptyState>
      )}

      <ul className={`election-list ${refreshing ? 'is-refreshing' : ''}`}>
        {elections.map((election) => {
          const busy = busyId === election.id;
          return (
            <li key={election.id} className="card election-item" aria-busy={busy}>
              <div className="election-item__main">
                <div className="election-item__badges">
                  <StatusBadge phase={election.phase} />
                  <span className="chip chip--outline">Status: {STATUS_LABELS[election.status]}</span>
                  <span className={`chip ${election.resultsPublic ? 'chip--success' : 'chip--outline'}`}>
                    <Icon name={election.resultsPublic ? 'eye' : 'eyeOff'} size={14} />
                    {election.resultsPublic ? 'Hasil dipublikasikan' : 'Hasil tidak publik'}
                  </span>
                </div>
                <h2 className="election-item__title">{election.title}</h2>
                <dl className="election-item__facts">
                  <div>
                    <dt>Jadwal</dt>
                    <dd>
                      {formatDateRange(election.startAt, election.endAt)}
                    </dd>
                  </div>
                  <div>
                    <dt>Pasangan calon</dt>
                    <dd>{formatNumber(election.candidateCount)}</dd>
                  </div>
                  <div>
                    <dt>Pemilih</dt>
                    <dd>
                      {formatNumber(election.voterCount)}
                      {election.eligibleVoterCount ? ` dari ${formatNumber(election.eligibleVoterCount)} siswa` : ''}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="election-item__actions">
                <Link to={`/admin/pemilihan/${election.id}/kandidat`} className="btn btn--secondary btn--sm">
                  <Icon name="users" size={16} /> Kandidat
                </Link>
                {canManage && (
                  <Link to={`/admin/pemilihan/${election.id}/ubah`} className="btn btn--ghost btn--sm">
                    <Icon name="edit" size={16} /> Ubah
                  </Link>
                )}
                {canChangeStatus &&
                  election.allowedTransitions.map((next) => {
                    const action = TRANSITION_ACTIONS[next];
                    return (
                      <button
                        key={next}
                        type="button"
                        disabled={busy}
                        className={`btn btn--sm ${action.primary ? 'btn--primary' : action.danger ? 'btn--danger' : 'btn--ghost'}`}
                        onClick={() =>
                          run(election, () => action.confirm(election), () => updateElection(election.id, { status: next }), action.done)
                        }
                      >
                        <Icon name={action.icon} size={16} /> {action.label}
                      </button>
                    );
                  })}
                {canPublish && (
                  <button
                    type="button"
                    disabled={busy}
                    className="btn btn--ghost btn--sm"
                    onClick={() =>
                      run(
                        election,
                        () => confirmResultsVisibility(election, !election.resultsPublic),
                        () => updateElection(election.id, { resultsPublic: !election.resultsPublic }),
                        election.resultsPublic ? 'Hasil disembunyikan dari publik.' : 'Hasil akan tampil ke publik setelah pemilihan selesai.',
                      )
                    }
                  >
                    <Icon name={election.resultsPublic ? 'eyeOff' : 'eye'} size={16} />
                    {election.resultsPublic ? 'Sembunyikan hasil' : 'Publikasikan hasil'}
                  </button>
                )}
                {canManage && (election.status === 'draft' || election.status === 'scheduled') && (
                  <button
                    type="button"
                    disabled={busy}
                    className="btn btn--ghost btn--sm btn--danger-text"
                    onClick={() =>
                      run(election, () => confirmDeleteElection(election), () => deleteElection(election.id), 'Pemilihan dihapus.')
                    }
                  >
                    <Icon name="trash" size={16} /> Hapus
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
