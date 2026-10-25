import { useState } from 'react';
import { publicUrl } from '../../config/appConfig.js';
import { candidateColor } from '../../utils/chartData.js';
import { formatCandidateNumber, nameInitials as initials } from '../../utils/election.js';

/**
 * Foto pasangan calon; bila tidak ada/gagal dimuat, tampil inisial berwarna identitas paslon.
 * `decorative` dipakai bila nama paslon sudah dibacakan oleh teks di sebelahnya.
 */
export default function CandidateAvatar({ candidate, size = 'md', decorative = false }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const showPhoto = candidate.photoUrl && failedUrl !== candidate.photoUrl;
  const alt = decorative
    ? ''
    : `Foto pasangan calon nomor ${candidate.candidateNumber}: ${candidate.chairpersonName} dan ${candidate.viceChairpersonName}`;

  return (
    <div
      className={`avatar avatar--${size}`}
      style={{ '--avatar-accent': candidateColor(candidate.candidateNumber) }}
      aria-hidden={decorative || undefined}
    >
      {showPhoto ? (
        <img
          src={publicUrl(candidate.photoUrl)}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(candidate.photoUrl)}
        />
      ) : (
        <div className="avatar__placeholder" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : alt}>
          <span>{initials(candidate.chairpersonName)}</span>
          <span>{initials(candidate.viceChairpersonName)}</span>
        </div>
      )}
      <span className="avatar__number" aria-hidden="true">
        {formatCandidateNumber(candidate.candidateNumber)}
      </span>
    </div>
  );
}
