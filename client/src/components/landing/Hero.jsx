import { gsap } from 'gsap';
import { m } from 'motion/react';
import { useLayoutEffect, useRef } from 'react';
import { appConfig } from '../../config/appConfig.js';
import { prefersReducedMotion } from '../../utils/motion.js';
import Copyright from '../brand/Copyright.jsx';
import DemocracyArt from '../brand/DemocracyArt.jsx';
import Icon from '../ui/Icon.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';

function statusText(election, loading) {
  if (loading) return 'Memuat status pemilihan…';
  if (!election) return 'Jadwal pemilihan belum diumumkan';
  return election.title;
}

/** Ilustrasi melayang naik-turun perlahan (Motion); diam bila pengguna mengurangi animasi. */
const FLOAT = { y: [0, -14, 0], transition: { duration: 6, ease: 'easeInOut', repeat: Infinity } };

/**
 * Hero beranda dengan animasi pembuka GSAP (timeline). Seluruh tween dibuat di dalam
 * gsap.context() yang di-scope ke hero, lalu context.revert() saat komponen dilepas
 * sehingga tidak ada tween/inline style yang tertinggal ketika berpindah halaman.
 * Hanya opacity & transform yang dianimasikan: tombol tetap bisa diklik & difokus
 * sejak awal, dan animasi dilewati bila pengguna memilih "kurangi animasi".
 */
export default function Hero({ election, loading, votingOpen = false }) {
  const rootRef = useRef(null);
  const reduceMotion = prefersReducedMotion();

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.6 } });
      timeline
        .from('.hero__eyebrow', { y: -14, opacity: 0 })
        .from('.hero__title', { y: 24, opacity: 0 }, '-=0.35')
        .from('.hero__lead', { y: 16, opacity: 0 }, '-=0.4')
        .from('.hero__status', { y: 12, opacity: 0, duration: 0.45 }, '-=0.35')
        .from('.hero__actions > *', { y: 12, opacity: 0, stagger: 0.08, duration: 0.45 }, '-=0.3')
        .from('.hero__trust > li', { y: 8, opacity: 0, stagger: 0.06, duration: 0.4 }, '-=0.3')
        .from('.art-halo', { scale: 0.85, opacity: 0, transformOrigin: '50% 50%', duration: 0.9 }, 0.1)
        .from('.art-box', { y: 28, scale: 0.95, opacity: 0, transformOrigin: '50% 100%', duration: 0.7 }, 0.15)
        .from('.art-ballot', { y: -70, opacity: 0, duration: 0.8, ease: 'back.out(1.4)' }, 0.45)
        .from('.art-check', { scale: 0, opacity: 0, transformOrigin: '50% 50%', stagger: 0.12, duration: 0.45, ease: 'back.out(2)' }, 0.85)
        .from('.art-star', { scale: 0, opacity: 0, transformOrigin: '50% 50%', stagger: 0.06, duration: 0.4 }, 0.95)
        .from('.art-confetti', { scale: 0, opacity: 0, transformOrigin: '50% 50%', stagger: 0.05, duration: 0.35 }, 1.05);
    }, rootRef);
    return () => context.revert();
  }, []);

  return (
    <section className="hero" ref={rootRef} aria-labelledby="hero-title">
      <div className="hero__decor" aria-hidden="true">
        <span className="hero__ring hero__ring--lg" />
        <span className="hero__ring hero__ring--sm" />
        <span className="hero__square" />
        <span className="hero__glow" />
      </div>

      <div className="container hero__grid">
        <div className="hero__content">
          <p className="hero__eyebrow">
            <span className="hero__eyebrow-icon" aria-hidden="true">
              <Icon name="school" size={16} />
            </span>
            E-OSIS · {appConfig.schoolName || 'Pemilihan Ketua & Wakil Ketua OSIS'}
          </p>

          <h1 id="hero-title" className="hero__title">
            Suaramu Menentukan <span className="hero__highlight">Masa Depan OSIS</span>
          </h1>
          <p className="hero__lead">
            Pilih Ketua dan Wakil Ketua OSIS secara langsung, jujur, dan rahasia. Cukup masukkan NISN saat pemungutan
            suara dibuka — tanpa perlu mendaftar terlebih dahulu.
          </p>

          <div className="hero__status" aria-live="polite">
            {election && <StatusBadge phase={election.phase} className="badge--on-dark" />}
            <span className="hero__status-text">{statusText(election, loading)}</span>
          </div>

          {/* Memilih dilakukan langsung pada kartu pasangan calon (tanpa login). */}
          <div className="hero__actions">
            <a href="#kandidat" className="btn btn--accent btn--lg">
              <Icon name={votingOpen ? 'ballot' : 'users'} />
              {votingOpen ? 'Pilih Pasangan Calon' : 'Lihat Pasangan Calon'}
            </a>
            <a href="#jadwal" className="btn btn--outline-light btn--lg">
              <Icon name="calendar" />
              Lihat Jadwal
            </a>
          </div>

          <ul className="hero__trust" aria-label="Prinsip pemilihan">
            <li>
              <Icon name="lock" size={16} /> Pilihan bersifat rahasia
            </li>
            <li>
              <Icon name="idCard" size={16} /> Satu NISN, satu suara
            </li>
            <li>
              <Icon name="shield" size={16} /> Dihitung otomatis &amp; transparan
            </li>
          </ul>

          <Copyright className="hero__copyright" />
        </div>

        <m.div className="hero__art" animate={reduceMotion ? undefined : FLOAT}>
          <DemocracyArt />
        </m.div>
      </div>
    </section>
  );
}
