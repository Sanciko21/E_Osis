import { Link, useSearchParams } from 'react-router';
import ResultsCharts from '../components/charts/ResultsCharts.jsx';
import { ParticipationMeter } from '../components/charts/ResultsParts.jsx';
import CandidateAvatar from '../components/candidates/CandidateAvatar.jsx';
import Icon from '../components/ui/Icon.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useResource } from '../hooks/useResource.js';
import { getCurrentElection, getPublicElection, getPublicResults } from '../services/electionsApi.js';
import { candidatePairName, formatCandidateNumber } from '../utils/election.js';
import { formatDateTime, formatNumber, formatPercent } from '../utils/format.js';

async function loadResults(electionId, signal) {
  const { election } = electionId ? await getPublicElection(electionId, signal) : await getCurrentElection(signal);
  if (!election || !election.resultsAvailable) return { election, results: null };
  return { election, results: await getPublicResults(election.id, signal) };
}

function Winners({ results }) {
  const leaders = results.candidates.filter((candidate) => candidate.isLeading && candidate.votes > 0);
  if (leaders.length === 0) return null;
  return (
    <section className="winner-card" aria-labelledby="winner-title">
      <p className="eyebrow">
        <Icon name="trophy" size={16} /> {results.isTie ? 'Perolehan suara seimbang' : 'Perolehan suara terbanyak'}
      </p>
      <h2 id="winner-title" className="sr-only">
        Pasangan calon dengan suara terbanyak
      </h2>
      <div className="winner-card__list">
        {leaders.map((candidate) => (
          <div key={candidate.id} className="winner">
            <CandidateAvatar candidate={candidate} size="lg" />
            <div>
              <p className="winner__number">Nomor urut {formatCandidateNumber(candidate.candidateNumber)}</p>
              <p className="winner__names">{candidatePairName(candidate)}</p>
              <p className="winner__votes">
                {formatNumber(candidate.votes)} suara · {formatPercent(candidate.percentage)}
              </p>
            </div>
          </div>
        ))}
      </div>
      {results.isTie && (
        <p className="winner-card__note">Terdapat lebih dari satu pasangan dengan suara terbanyak. Keputusan lanjutan mengikuti aturan panitia.</p>
      )}
    </section>
  );
}

export default function ResultsPage() {
  useDocumentTitle('Hasil Pemilihan');
  const [searchParams] = useSearchParams();
  const electionId = searchParams.get('pemilihan');
  const { data, error, loading, reload } = useResource((signal) => loadResults(electionId, signal), [electionId]);
  const election = data?.election ?? null;
  const results = data?.results ?? null;

  return (
    <div className="results-page">
      <section className="page-hero page-hero--compact" aria-labelledby="results-title">
        <div className="container">
          <p className="eyebrow eyebrow--on-dark">
            <Icon name="chartPie" size={16} /> Hasil pemilihan
          </p>
          <h1 id="results-title" className="page-hero__title">
            {election ? election.title : 'Hasil Pemilihan OSIS'}
          </h1>
          {election && (
            <div className="page-hero__meta">
              <StatusBadge phase={election.phase} className="badge--on-dark" />
              <span>Ditutup {formatDateTime(election.endAt)}</span>
            </div>
          )}
        </div>
      </section>

      <div className="container results-page__body">
        {loading && <LoadingState message="Memuat hasil pemilihan…" />}
        {!loading && error && error.code === 'RESULTS_NOT_PUBLIC' && (
          <EmptyState icon="lock" title="Hasil belum dipublikasikan">
            Panitia belum mempublikasikan hasil pemilihan ini.
          </EmptyState>
        )}
        {!loading && error && error.code !== 'RESULTS_NOT_PUBLIC' && (
          <ErrorState title="Hasil gagal dimuat" error={error} onRetry={reload} />
        )}
        {!loading && !error && !election && (
          <EmptyState icon="calendar" title="Belum ada pemilihan">
            Hasil akan tampil di sini setelah pemilihan selesai dan dipublikasikan panitia.
          </EmptyState>
        )}
        {!loading && !error && election && !results && (
          <EmptyState
            icon="lock"
            title="Hasil belum dipublikasikan"
            action={
              <Link to="/" className="btn btn--secondary">
                <Icon name="home" size={18} /> Ke beranda
              </Link>
            }
          >
            {election.phase === 'completed'
              ? 'Pemilihan sudah selesai. Hasil resmi akan diumumkan oleh panitia.'
              : 'Hasil hanya diumumkan setelah pemungutan suara ditutup. Hasil sementara tidak ditampilkan ke publik.'}
          </EmptyState>
        )}

        {results && (
          <div className="results-layout">
            <Winners results={results} />
            {/* Angka diambil apa adanya dari respons backend; hanya tampilannya yang dianimasikan. */}
            <div className="stat-grid stat-grid--3">
              <StatCard icon="ballot" tone="blue" label="Total suara sah" value={results.totals.validVotes} format={formatNumber} />
              <StatCard icon="users" tone="teal" label="Siswa yang memilih" value={results.totals.uniqueVoters} format={formatNumber} />
              <StatCard
                icon="chartPie"
                tone="gold"
                label="Partisipasi"
                value={results.totals.turnoutPercentage ?? Number.NaN}
                format={formatPercent}
              />
            </div>
            <ParticipationMeter totals={results.totals} />
            <ResultsCharts results={results} />
            <p className="muted small">Hasil resmi dihitung dari database pada {formatDateTime(results.generatedAt)}.</p>
          </div>
        )}
      </div>
    </div>
  );
}
