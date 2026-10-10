import { m } from 'motion/react';
import { useRef } from 'react';
import { popItem } from '../../lib/motionPresets.js';
import { candidateColor } from '../../utils/chartData.js';
import { formatCandidateNumber } from '../../utils/election.js';
import Icon from '../ui/Icon.jsx';
import CandidatePhoto from './CandidatePhoto.jsx';

/**
 * Kartu pasangan calon untuk halaman publik ("flying card"): saat disorot mouse kartu
 * terangkat dan miring mengikuti kursor. Animasi masuk (Motion, varian `popItem` yang dipicu
 * grid induknya) dipasang di pembungkus, karena kartu di dalamnya memakai `transform` sendiri
 * untuk efek miring. Efek gerak hanya aktif untuk mouse dan dimatikan CSS bila prefers-reduced-motion.
 * Warna aksen kartu (`--candidate-accent`) sama dengan warna paslon di grafik hasil, tetapi
 * hanya dekoratif: tombol "Pilih" setiap paslon sengaja seragam agar penekanannya setara.
 *
 * Saat pemungutan suara dibuka (`votingOpen`), siswa memilih langsung dari kartu ini lewat
 * tombol "Pilih" (`onVote`); `voteDisabled` mengunci tombol selama proses voting berjalan.
 */
export default function CandidateCard({ candidate, onShowDetail, onVote, votingOpen = false, voteDisabled = false }) {
  const wrapRef = useRef(null);

  // Posisi kursor relatif terhadap pembungkus (yang tidak ikut miring): -1 … 1 per sumbu.
  function trackPointer(event) {
    if (event.pointerType !== 'mouse') return;
    const wrap = wrapRef.current;
    const rect = wrap.getBoundingClientRect();
    wrap.style.setProperty('--px', (((event.clientX - rect.left) / rect.width) * 2 - 1).toFixed(3));
    wrap.style.setProperty('--py', (((event.clientY - rect.top) / rect.height) * 2 - 1).toFixed(3));
  }

  function resetPointer() {
    wrapRef.current.style.removeProperty('--px');
    wrapRef.current.style.removeProperty('--py');
  }

  return (
    <m.div
      ref={wrapRef}
      className="candidate-card-wrap"
      style={{ '--candidate-accent': candidateColor(candidate.candidateNumber) }}
      variants={popItem}
      onPointerMove={trackPointer}
      onPointerLeave={resetPointer}
    >
      <article className="candidate-card" aria-labelledby={`candidate-${candidate.id}-title`}>
        <div className="candidate-card__media">
          <CandidatePhoto candidate={candidate} />
        </div>
        <div className="candidate-card__body">
          <p className="candidate-card__number">Nomor urut {formatCandidateNumber(candidate.candidateNumber)}</p>
          <h3 id={`candidate-${candidate.id}-title`} className="candidate-card__title">
            {candidate.chairpersonName}
            <span className="candidate-card__amp" aria-hidden="true">
              &amp;
            </span>
            <span className="sr-only"> dan </span>
            {candidate.viceChairpersonName}
          </h3>
          <p className="candidate-card__roles">Calon Ketua &amp; Calon Wakil Ketua OSIS</p>
          <div className="candidate-card__vision">
            <span className="candidate-card__label">
              <Icon name="sparkle" size={14} /> Visi
            </span>
            <p>{candidate.vision}</p>
          </div>
        </div>
        <div className="candidate-card__footer">
          {votingOpen && onVote && (
            <button
              type="button"
              className="btn btn--primary btn--block candidate-card__vote"
              disabled={voteDisabled}
              onClick={() => onVote(candidate)}
            >
              <Icon name="ballot" size={18} />
              Pilih Paslon {formatCandidateNumber(candidate.candidateNumber)}
            </button>
          )}
          <button
            type="button"
            className={`btn btn--block ${votingOpen ? 'btn--ghost' : 'btn--secondary'}`}
            aria-label={`Lihat visi & misi lengkap pasangan nomor ${candidate.candidateNumber}`}
            onClick={() => onShowDetail(candidate)}
          >
            <Icon name="list" size={18} />
            Lihat visi &amp; misi lengkap
          </button>
        </div>
      </article>
    </m.div>
  );
}
