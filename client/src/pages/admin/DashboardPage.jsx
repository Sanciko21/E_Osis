import { useState } from 'react';
import { Link } from 'react-router';
import ResultsCharts from '../../components/charts/ResultsCharts.jsx';
import { ParticipationMeter } from '../../components/charts/ResultsParts.jsx';
import Icon from '../../components/ui/Icon.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { appConfig } from '../../config/appConfig.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { usePolling } from '../../hooks/usePolling.js';
import { useResource } from '../../hooks/useResource.js';
import { getDashboard, listElections } from '../../services/adminApi.js';
import { STATUS_LABELS } from '../../utils/election.js';
import { formatClock, formatDateRange, formatNumber, formatPercent } from '../../utils/format.js';

function IntegrityNotice({ integrity }) {
  if (integrity.consistent) {
    return (
      <p className="notice notice--success" role="status">
        <Icon name="shield" size={18} />
        <span>
          <strong>Integritas data terjaga.</strong> Jumlah suara sah ({formatNumber(integrity.validVotes)}) sama dengan jumlah
          catatan partisipasi ({formatNumber(integrity.participationRecords)}).
        </span>
      </p>
    );
  }
  return (
    <p className="notice notice--danger" role="alert">
      <Icon name="alert" size={18} />
      <span>
        <strong>Periksa integritas data!</strong> Suara sah ({formatNumber(integrity.validVotes)}) tidak sama dengan
        catatan partisipasi ({formatNumber(integrity.participationRecords)}). Segera hubungi pengelola sistem.
      </span>
    </p>
  );
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard Admin');
  const { can } = useAuth();
  const [selectedId, setSelectedId] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const elections = useResource((signal) => listElections({}, signal), []);
  const dashboard = useResource((signal) => getDashboard({ electionId: selectedId || undefined }, signal), [selectedId]);

  const results = dashboard.data?.results ?? null;
  const election = results?.election ?? null;
  const live = election && (election.phase === 'open' || election.phase === 'upcoming');
  usePolling(() => dashboard.reload(), appConfig.dashboardRefreshMs, autoRefresh && Boolean(live));

  const electionOptions = elections.data?.items ?? [];
  const counts = dashboard.data?.electionCounts;

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <p className="eyebrow">Ringkasan</p>
          <h1 className="admin-page__title">Dashboard pemilihan</h1>
        </div>
        <div className="toolbar" role="group" aria-label="Pilihan tampilan dashboard">
          <label className="toolbar__field">
            <span className="sr-only">Pilih pemilihan</span>
            <select
              value={selectedId || dashboard.data?.focusElectionId || ''}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={electionOptions.length === 0}
            >
              {electionOptions.length === 0 && <option value="">Belum ada pemilihan</option>}
              {electionOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} ({STATUS_LABELS[item.status]})
                </option>
              ))}
            </select>
          </label>
          <label className="switch">
            <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
            <span>Perbarui otomatis</span>
          </label>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => dashboard.reload()} disabled={dashboard.refreshing}>
            <Icon name="refresh" size={16} className={dashboard.refreshing ? 'spin' : ''} />
            Muat ulang
          </button>
        </div>
      </header>

      {dashboard.loading && <LoadingState message="Memuat dashboard…" />}
      {!dashboard.loading && dashboard.error && !dashboard.data && (
        <ErrorState title="Dashboard gagal dimuat" error={dashboard.error} onRetry={dashboard.reload} />
      )}
      {!dashboard.loading && dashboard.data && !results && (
        <EmptyState
          icon="calendar"
          title="Belum ada pemilihan"
          action={
            can('elections:manage') && (
              <Link to="/admin/pemilihan/baru" className="btn btn--primary">
                <Icon name="plus" size={18} /> Buat pemilihan
              </Link>
            )
          }
        >
          Buat pemilihan dan tambahkan pasangan calon untuk memulai.
        </EmptyState>
      )}

      {results && (
        <div className={`dashboard ${dashboard.refreshing ? 'is-refreshing' : ''}`}>
          {dashboard.error && (
            <p className="notice notice--warning" role="status">
              <Icon name="alert" size={18} /> Pembaruan terakhir gagal ({dashboard.error.message}). Data di bawah adalah data
              terakhir yang berhasil dimuat.
            </p>
          )}
          <section className="card election-summary" aria-label="Pemilihan yang ditampilkan">
            <div>
              <StatusBadge phase={election.phase} />
              <h2 className="election-summary__title">{election.title}</h2>
              <p className="muted">
                {formatDateRange(election.startAt, election.endAt)}
              </p>
            </div>
            <div className="election-summary__meta">
              <span className={`result-mode ${results.isFinal ? 'is-final' : ''}`}>
                <Icon name={results.isFinal ? 'check' : 'clock'} size={16} />
                {results.isFinal ? 'Hasil akhir' : 'Hasil sementara — hanya untuk admin'}
              </span>
              <span className="muted small">
                Diperbarui {formatClock(results.generatedAt)}
                {live && autoRefresh ? ` · otomatis setiap ${appConfig.dashboardRefreshMs / 1000} detik` : ''}
              </span>
              <Link to={`/admin/pemilihan/${election.id}/kandidat`} className="btn btn--ghost btn--sm">
                Kelola kandidat <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </section>

          <div className="stat-grid">
            <StatCard icon="ballot" label="Total suara sah" value={results.totals.validVotes} format={formatNumber} />
            <StatCard icon="users" label="Pemilih unik" value={results.totals.uniqueVoters} format={formatNumber} />
            <StatCard
              icon="chart"
              label="Partisipasi"
              value={results.totals.turnoutPercentage ?? Number.NaN}
              format={formatPercent}
              note={results.totals.eligibleVoters ? `dari ${formatNumber(results.totals.eligibleVoters)} siswa` : 'Jumlah siswa belum diisi'}
            />
            <StatCard icon="idCard" label="Pasangan calon" value={results.candidates.length} format={formatNumber} />
          </div>

          <IntegrityNotice integrity={results.integrity} />
          <ParticipationMeter totals={results.totals} />
          <ResultsCharts results={results} showTimeline refreshing={dashboard.refreshing} />

          {counts && (
            <section className="card status-summary" aria-label="Jumlah pemilihan per status">
              <h2 className="card__title">Semua pemilihan</h2>
              <ul className="chip-row">
                {Object.entries(counts).map(([status, total]) => (
                  <li key={status} className="chip">
                    {STATUS_LABELS[status]}: <strong>{formatNumber(total)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
