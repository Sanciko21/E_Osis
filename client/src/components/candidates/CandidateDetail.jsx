import { formatCandidateNumber, splitMission } from '../../utils/election.js';
import CandidateAvatar from './CandidateAvatar.jsx';

export function MissionList({ mission }) {
  const items = splitMission(mission);
  if (items.length === 0) return <p className="muted">Misi belum diisi.</p>;
  return (
    <ol className="mission-list">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ol>
  );
}

/** Isi lengkap visi & misi (dipakai di dialog detail). */
export default function CandidateDetail({ candidate }) {
  return (
    <div className="candidate-detail">
      <div className="candidate-detail__head">
        <CandidateAvatar candidate={candidate} size="lg" />
        <div>
          <p className="eyebrow">Pasangan calon nomor {formatCandidateNumber(candidate.candidateNumber)}</p>
          <dl className="pair-names">
            <div>
              <dt>Calon Ketua</dt>
              <dd>{candidate.chairpersonName}</dd>
            </div>
            <div>
              <dt>Calon Wakil Ketua</dt>
              <dd>{candidate.viceChairpersonName}</dd>
            </div>
          </dl>
        </div>
      </div>
      <section className="candidate-detail__section" aria-label="Visi">
        <h3>Visi</h3>
        <p className="vision-text">{candidate.vision}</p>
      </section>
      <section className="candidate-detail__section" aria-label="Misi">
        <h3>Misi</h3>
        <MissionList mission={candidate.mission} />
      </section>
    </div>
  );
}
