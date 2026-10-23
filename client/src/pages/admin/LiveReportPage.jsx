import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LogoMark } from '../../components/brand/Logo.jsx';
import Copyright from '../../components/brand/Copyright.jsx';
import CandidatePhoto from '../../components/candidates/CandidatePhoto.jsx';
import '../../components/charts/chartSetup.js';
import { ResultsLegend } from '../../components/charts/ResultsParts.jsx';
import VoteShareChart from '../../components/charts/VoteShareChart.jsx';
import VotesBarChart from '../../components/charts/VotesBarChart.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { AnimatedNumber } from '../../components/ui/StatCard.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { appConfig } from '../../config/appConfig.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useNow } from '../../hooks/useNow.js';
import { usePolling } from '../../hooks/usePolling.js';
import { useResource } from '../../hooks/useResource.js';
import { popItem, staggerList } from '../../lib/motionPresets.js';
import { getDashboard } from '../../services/adminApi.js';
import { candidateColor, hasAnyVotes } from '../../utils/chartData.js';
import { formatCandidateNumber } from '../../utils/election.js';
import { formatClockSeconds, formatDateRange, formatNumber, formatPercent } from '../../utils/format.js';
import { prefersReducedMotion } from '../../utils/motion.js';
import '../../styles/live.css';

/**
 * Peringkat & selisih suara tiap paslon (peringkat padat: suara sama = peringkat sama).
 * Hanya tampilan; angka suara dan persentase tetap apa adanya dari backend.
 */
function standings(candidates) {
  const distinct = [...new Set(candidates.map((candidate) => candidate.votes))].sort((a, b) => b - a);
  const top = distinct[0] ?? 0;
  const runnerUp = distinct[1] ?? 0;
  return new Map(
    candidates.map((candidate) => [
      candidate.id,
      {
        rank: distinct.indexOf(candidate.votes) + 1,
        behind: top - candidate.votes,
        lead: candidate.isLeading ? top - runnerUp : 0,
      },
    ]),
  );
}

/** Mode layar penuh untuk proyektor (tombol & tombol keyboard "F"). */
function useFullscreen() {
  const [active, setActive] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey) toggle();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggle]);
  return { active, toggle, supported: typeof document.documentElement.requestFullscreen === 'function' };
}

/** Layar tidak meredup/terkunci selama panel tampil (bila peramban mendukung Wake Lock). */
function useScreenWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return undefined;
    let lock = null;
    let cancelled = false;
    const request = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) lock.release().catch(() => {});
      } catch {
        // Ditolak peramban/baterai lemah: panel tetap berjalan seperti biasa.
      }
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      lock?.release().catch(() => {});
    };
  }, []);
}

function LiveCandidateCard({ candidate, standing, isTie, hasVotes, total }) {
  const accent = candidateColor(candidate.candidateNumber);
  return (
    <m.article
      className={`live-card ${candidate.isLeading ? 'is-leading' : ''}`.trim()}
      style={{ '--candidate-accent': accent }}
      variants={popItem}
      aria-labelledby={`live-candidate-${candidate.id}`}
    >
      <div className="live-card__media">
        <CandidatePhoto candidate={candidate} />
        <AnimatePresence>
          {candidate.isLeading && (
            <m.span
              key="crown"
              className="live-card__crown"
              initial={{ opacity: 0, y: -8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Icon name="crown" size={18} /> {isTie ? 'Suara terbanyak (seimbang)' : 'Suara terbanyak'}
            </m.span>
          )}
        </AnimatePresence>
      </div>

      <div className="live-card__body">
        <p className="live-card__number">Nomor urut {formatCandidateNumber(candidate.candidateNumber)}</p>
        <h2 id={`live-candidate-${candidate.id}`} className="live-card__names">
          <span>{candidate.chairpersonName}</span>
          <span className="live-card__amp" aria-hidden="true">
            &amp;
          </span>
          <span className="sr-only"> dan </span>
          <span>{candidate.viceChairpersonName}</span>
        </h2>

        <div className="live-card__score">
          <p className="live-card__votes">
            <span className="live-card__votes-value">
              <AnimatedNumber value={candidate.votes} format={formatNumber} />
            </span>
            <span className="live-card__unit">suara</span>
          </p>
          <p className="live-card__percent">
            <AnimatedNumber value={candidate.percentage} format={formatPercent} />
          </p>
        </div>

        <div className="live-card__track" aria-hidden="true">
          <span className="live-card__fill" style={{ width: `${Math.min(100, candidate.percentage)}%` }} />
        </div>

        <dl className="live-card__details">
          <div>
            <dt>Peringkat</dt>
            <dd>{hasVotes ? `${standing.rank} dari ${total}` : '—'}</dd>
          </div>
          <div>
            <dt>{candidate.isLeading && !isTie ? 'Unggul' : 'Selisih dari teratas'}</dt>
            <dd>
              {!hasVotes && '—'}
              {hasVotes && candidate.isLeading && !isTie && `+${formatNumber(standing.lead)} suara`}
              {hasVotes && candidate.isLeading && isTie && 'Seimbang'}
              {hasVotes && !candidate.isLeading && `${formatNumber(standing.behind)} suara`}
            </dd>
          </div>
        </dl>
      </div>
    </m.article>
  );
}

function TurnoutPanel({ totals }) {
  const known = Number.isFinite(totals.turnoutPercentage);
  const notVoted = totals.eligibleVoters ? Math.max(0, totals.eligibleVoters - totals.uniqueVoters) : null;
  return (
    <section className="live-panel live-panel--turnout" aria-labelledby="live-turnout-title">
      <h2 id="live-turnout-title" className="live-panel__title">
        <Icon name="users" size={20} /> Partisipasi pemilih
      </h2>
      <p className="live-turnout__hero">
        {known ? <AnimatedNumber value={totals.turnoutPercentage} format={formatPercent} /> : formatNumber(totals.uniqueVoters)}
        <span className="live-turnout__hero-label">{known ? 'siswa berhak pilih sudah memilih' : 'siswa sudah memilih'}</span>
      </p>
      {known && (
        <div
          className="live-turnout__meter"
          role="progressbar"
          aria-label="Partisipasi pemilih"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(100, totals.turnoutPercentage))}
          aria-valuetext={`${formatNumber(totals.uniqueVoters)} dari ${formatNumber(totals.eligibleVoters)} siswa`}
        >
          <span style={{ width: `${Math.min(100, totals.turnoutPercentage)}%` }} />
        </div>
      )}
      <dl className="live-turnout__stats">
        <div>
          <dt>Suara sah</dt>
          <dd>
            <AnimatedNumber value={totals.validVotes} format={formatNumber} />
          </dd>
        </div>
        <div>
          <dt>Pemilih</dt>
          <dd>
            <AnimatedNumber value={totals.uniqueVoters} format={formatNumber} />
          </dd>
        </div>
        <div>
          <dt>Berhak pilih</dt>
          <dd>{totals.eligibleVoters ? formatNumber(totals.eligibleVoters) : '—'}</dd>
        </div>
        <div>
          <dt>Belum memilih</dt>
          <dd>{notVoted === null ? '—' : <AnimatedNumber value={notVoted} format={formatNumber} />}</dd>
        </div>
      </dl>
      {!known && <p className="live-panel__note">Isi jumlah siswa berhak pilih di pengaturan pemilihan agar persentase tampil.</p>}
    </section>
  );
}

/**
 * Panel Live Report untuk layar besar/proyektor saat panitia melaporkan perolehan suara.
 * Memakai data dashboard admin (hasil SEMENTARA selama pemungutan suara), sehingga hanya
 * dapat dibuka admin/pengawas yang login — aturan "hasil sementara tidak untuk publik" tetap
 * berlaku; panitia yang memutuskan kapan layar ini ditampilkan. Diperbarui otomatis.
 */
export default function LiveReportPage() {
  useDocumentTitle('Live Report');
  useScreenWakeLock();
  const [searchParams] = useSearchParams();
  const electionId = searchParams.get('pemilihan') || undefined;
  const dashboard = useResource((signal) => getDashboard({ electionId }, signal), [electionId]);
  const fullscreen = useFullscreen();
  const now = useNow(0, 1000);

  const results = dashboard.data?.results ?? null;
  const election = results?.election ?? null;
  const isFinal = Boolean(results?.isFinal);
  usePolling(() => dashboard.reload(), appConfig.liveReportRefreshMs, Boolean(results) && !isFinal);

  const candidates = results?.candidates ?? [];
  const hasVotes = hasAnyVotes(candidates);
  const standingById = standings(candidates);
  const reveal = prefersReducedMotion() ? { initial: false, animate: 'show' } : { initial: 'hidden', animate: 'show' };

  return (
    <div className={`live ${fullscreen.active ? 'is-fullscreen' : ''}`.trim()}>
      <header className="live__header">
        <div className="live__brand">
          <LogoMark size={46} />
          <div>
            <p className="live__brand-name">
              E-OSIS <span>Live Report</span>
            </p>
            <p className="live__school">{appConfig.schoolName || 'Pemilihan Ketua & Wakil Ketua OSIS'}</p>
          </div>
        </div>

        <div className="live__heading">
          <h1 className="live__title">{election ? election.title : 'Live Report Pemilihan OSIS'}</h1>
          {election && <p className="live__schedule">{formatDateRange(election.startAt, election.endAt)}</p>}
        </div>

        <div className="live__status">
          {results && (
            <span className={`live-pill ${isFinal ? 'live-pill--final' : 'live-pill--live'}`}>
              {isFinal ? <Icon name="checkCircle" size={18} /> : <span className="live-pill__dot" aria-hidden="true" />}
              {isFinal ? 'Hasil akhir' : 'Live · hasil sementara'}
            </span>
          )}
          <p className="live__clock">
            <time dateTime={new Date(now).toISOString()}>{formatClockSeconds(now)}</time>
          </p>
          {results && (
            <p className="live__updated" aria-live="polite">
              {dashboard.error ? (
                <>
                  <Icon name="alert" size={14} /> Koneksi terputus · data {formatClockSeconds(results.generatedAt)}
                </>
              ) : (
                <>Diperbarui {formatClockSeconds(results.generatedAt)}</>
              )}
            </p>
          )}
        </div>

        <div className="live__controls">
          {fullscreen.supported && (
            <button
              type="button"
              className="live-icon-btn"
              onClick={fullscreen.toggle}
              aria-label={fullscreen.active ? 'Keluar dari layar penuh' : 'Tampilkan layar penuh'}
              title={fullscreen.active ? 'Keluar dari layar penuh (F)' : 'Layar penuh (F)'}
            >
              <Icon name={fullscreen.active ? 'minimize' : 'maximize'} />
            </button>
          )}
          <Link to="/admin" className="live-icon-btn" aria-label="Kembali ke dashboard admin" title="Kembali ke dashboard">
            <Icon name="x" />
          </Link>
        </div>
      </header>

      <main className="live__main">
        {dashboard.loading && <LoadingState message="Memuat data live report…" />}
        {!dashboard.loading && dashboard.error && !dashboard.data && (
          <ErrorState title="Live report gagal dimuat" error={dashboard.error} onRetry={dashboard.reload} />
        )}
        {!dashboard.loading && dashboard.data && !results && (
          <EmptyState icon="calendar" title="Belum ada pemilihan">
            Buat pemilihan dan pasangan calon di dashboard admin terlebih dahulu.
          </EmptyState>
        )}

        {results && (
          <>
            <m.section
              className="live-candidates"
              style={{ '--count': Math.max(1, candidates.length) }}
              aria-label="Perolehan suara tiap pasangan calon"
              variants={staggerList}
              {...reveal}
            >
              {candidates.map((candidate) => (
                <LiveCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  standing={standingById.get(candidate.id)}
                  isTie={results.isTie}
                  hasVotes={hasVotes}
                  total={candidates.length}
                />
              ))}
            </m.section>

            <section className="live-panels" aria-label="Ringkasan perolehan suara">
              <TurnoutPanel totals={results.totals} />

              <figure className="live-panel">
                <figcaption className="live-panel__title">
                  <Icon name="chart" size={20} /> Perbandingan suara
                </figcaption>
                {hasVotes ? (
                  <VotesBarChart candidates={candidates} large />
                ) : (
                  <p className="live-panel__waiting">Menunggu suara pertama masuk…</p>
                )}
              </figure>

              <figure className="live-panel live-panel--share">
                <figcaption className="live-panel__title">
                  <Icon name="chartPie" size={20} /> Persentase perolehan suara
                </figcaption>
                {hasVotes ? (
                  <div className="live-share">
                    <VoteShareChart candidates={candidates} totalVotes={results.totals.validVotes} />
                    <ResultsLegend candidates={candidates} />
                  </div>
                ) : (
                  <p className="live-panel__waiting">Menunggu suara pertama masuk…</p>
                )}
              </figure>
            </section>
          </>
        )}
      </main>

      <footer className="live__footer">
        <p>
          <Icon name="shield" size={16} />
          {results?.integrity?.consistent === false
            ? 'Periksa integritas data di dashboard admin.'
            : 'Data langsung dari database E-OSIS'}
          {results && !isFinal && ` · diperbarui otomatis setiap ${appConfig.liveReportRefreshMs / 1000} detik`}
        </p>
        <Copyright className="live__copyright" />
      </footer>
    </div>
  );
}
