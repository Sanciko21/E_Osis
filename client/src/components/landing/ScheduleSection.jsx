import { m } from 'motion/react';
import { Link } from 'react-router';
import { revealOnScroll, riseItem, staggerList } from '../../lib/motionPresets.js';
import { currentStageIndex } from '../../utils/election.js';
import { formatDateRange, formatDateTime, formatDuration } from '../../utils/format.js';
import { aos } from '../../utils/motion.js';
import Icon from '../ui/Icon.jsx';
import { EmptyState, ErrorState, LoadingState } from '../ui/States.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';

function countdownText(election, now) {
  const start = new Date(election.startAt).getTime();
  const end = new Date(election.endAt).getTime();
  switch (election.phase) {
    case 'upcoming':
      if (election.status === 'scheduled' && now >= start) return 'Menunggu panitia membuka pemungutan suara.';
      return `Pemungutan suara dimulai dalam ${formatDuration(start - now)}.`;
    case 'open':
      return `Pemungutan suara sedang berlangsung dan berakhir dalam ${formatDuration(end - now)}.`;
    case 'closed':
      return 'Waktu pemungutan suara telah habis. Panitia sedang merekap hasil.';
    case 'completed':
      return election.resultsAvailable
        ? 'Pemilihan telah selesai dan hasilnya sudah diumumkan.'
        : 'Pemilihan telah selesai. Hasil akan diumumkan oleh panitia.';
    default:
      return '';
  }
}

// Setiap tahap punya warna aksen sendiri (dekoratif); status tahap selalu ditulis sebagai teks.
const STAGES = [
  { title: 'Pengumuman Calon', text: 'Panitia mengumumkan pasangan calon beserta visi dan misinya.', icon: 'megaphone', accent: 'blue' },
  { title: 'Pemungutan Suara', text: null, icon: 'ballot', accent: 'coral' },
  { title: 'Rekapitulasi', text: 'Suara dihitung otomatis oleh sistem dan diawasi panitia.', icon: 'chart', accent: 'teal' },
  { title: 'Pengumuman Hasil', text: 'Hasil diumumkan setelah pemilihan ditutup.', icon: 'trophy', accent: 'gold' },
];

const STAGE_STATE_LABEL = { done: 'Selesai', current: 'Tahap saat ini', next: 'Akan datang' };

export default function ScheduleSection({ election, loading, error, onRetry, now }) {
  let stage = election ? currentStageIndex(election.phase) : -1;
  if (election?.phase === 'completed' && !election.resultsAvailable) stage = 2;

  return (
    <section id="jadwal" className="section section--schedule" aria-labelledby="jadwal-title">
      <div className="container">
        <div className="section__header" {...aos('fade-up')}>
          <p className="eyebrow">
            <Icon name="calendarCheck" size={16} /> Jadwal &amp; status
          </p>
          <h2 id="jadwal-title" className="section__title">
            Informasi <span className="text-gradient">pemilihan</span>
          </h2>
          <p className="section__lead">Pantau status, jadwal pemungutan suara, dan tahapan pemilihan OSIS.</p>
        </div>

        {loading && <LoadingState message="Memuat jadwal pemilihan…" />}
        {!loading && error && <ErrorState title="Jadwal gagal dimuat" error={error} onRetry={onRetry} />}
        {!loading && !error && !election && (
          <EmptyState icon="calendar" title="Belum ada jadwal pemilihan">
            Panitia belum mengumumkan jadwal pemilihan. Pantau terus halaman ini.
          </EmptyState>
        )}

        {!loading && !error && election && (
          <>
            <div className="schedule-card" {...aos('fade-up', { delay: 50 })}>
              <div className="schedule-card__main">
                <StatusBadge phase={election.phase} />
                <h3 className="schedule-card__title">{election.title}</h3>
                {election.description && <p className="schedule-card__description">{election.description}</p>}
                <p className="schedule-card__countdown" aria-live="polite">
                  <Icon name="clock" size={18} />
                  {countdownText(election, now)}
                </p>
              </div>
              <dl className="schedule-card__times">
                <div className="time-tile time-tile--open">
                  <span className="time-tile__icon" aria-hidden="true">
                    <Icon name="calendarCheck" size={20} />
                  </span>
                  <div>
                    <dt>Dibuka</dt>
                    <dd>
                      <time dateTime={election.startAt}>{formatDateTime(election.startAt)}</time>
                    </dd>
                  </div>
                </div>
                <div className="time-tile time-tile--close">
                  <span className="time-tile__icon" aria-hidden="true">
                    <Icon name="hourglass" size={20} />
                  </span>
                  <div>
                    <dt>Ditutup</dt>
                    <dd>
                      <time dateTime={election.endAt}>{formatDateTime(election.endAt)}</time>
                    </dd>
                  </div>
                </div>
              </dl>
              <div className="schedule-card__actions">
                {election.votingOpen && (
                  <a href="#kandidat" className="btn btn--primary">
                    <Icon name="ballot" size={18} />
                    Pilih sekarang
                  </a>
                )}
                {election.resultsAvailable && (
                  <Link to="/hasil" className="btn btn--secondary">
                    <Icon name="chart" size={18} />
                    Lihat hasil
                  </Link>
                )}
              </div>
            </div>

            <m.ol className="stages" aria-label="Tahapan pemilihan" variants={staggerList} {...revealOnScroll()}>
              {STAGES.map((item, index) => {
                const state = index < stage ? 'done' : index === stage ? 'current' : 'next';
                return (
                  <m.li key={item.title} className={`stage stage--${item.accent} stage--${state}`} variants={riseItem}>
                    <div className="stage__top">
                      <span className="stage__marker" aria-hidden="true">
                        {state === 'done' ? <Icon name="check" size={20} /> : <Icon name={item.icon} size={20} />}
                      </span>
                      <span className={`stage__state stage__state--${state}`}>{STAGE_STATE_LABEL[state]}</span>
                    </div>
                    <p className="stage__title">
                      {index + 1}. {item.title}
                    </p>
                    <p className="stage__text">{item.text ?? formatDateRange(election.startAt, election.endAt)}</p>
                  </m.li>
                );
              })}
            </m.ol>
          </>
        )}
      </div>
    </section>
  );
}
