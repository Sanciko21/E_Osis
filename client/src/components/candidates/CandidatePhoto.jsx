import { useState } from 'react';
import { appConfig, publicUrl } from '../../config/appConfig.js';
import { formatCandidateNumber, nameInitials } from '../../utils/election.js';

/**
 * Foto pasangan calon di depan logo sekolah (kartu beranda). Paling bagus dengan foto PNG
 * berlatar transparan sehingga logo terlihat di belakang paslon. Bila foto tidak ada/gagal
 * dimuat tampil inisial; bila logo tidak ada, latar cukup gradasi warna.
 */
export default function CandidatePhoto({ candidate }) {
  const [failedPhotoUrl, setFailedPhotoUrl] = useState(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const showPhoto = candidate.photoUrl && failedPhotoUrl !== candidate.photoUrl;
  const alt = `Foto pasangan calon nomor ${candidate.candidateNumber}: ${candidate.chairpersonName} dan ${candidate.viceChairpersonName}`;

  return (
    <div className="candidate-photo">
      {appConfig.schoolLogoUrl && !logoFailed && (
        <img
          className="candidate-photo__logo"
          src={appConfig.schoolLogoUrl}
          alt=""
          aria-hidden="true"
          decoding="async"
          onError={() => setLogoFailed(true)}
        />
      )}
      {showPhoto ? (
        <img
          className="candidate-photo__subject candidate-photo__image"
          src={publicUrl(candidate.photoUrl)}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedPhotoUrl(candidate.photoUrl)}
        />
      ) : (
        <div className="candidate-photo__subject candidate-photo__placeholder" role="img" aria-label={alt}>
          <span>{nameInitials(candidate.chairpersonName)}</span>
          <span>{nameInitials(candidate.viceChairpersonName)}</span>
        </div>
      )}
      <span className="candidate-photo__number" aria-hidden="true">
        {formatCandidateNumber(candidate.candidateNumber)}
      </span>
    </div>
  );
}
