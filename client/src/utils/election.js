/** Label & nada warna fase pemilihan (fase dihitung server dari status + jadwal). */
export const PHASE_META = Object.freeze({
  draft: { label: 'Draf', tone: 'neutral', icon: 'edit' },
  upcoming: { label: 'Belum Dimulai', tone: 'info', icon: 'clock' },
  open: { label: 'Sedang Berlangsung', tone: 'success', icon: 'dot' },
  closed: { label: 'Waktu Memilih Habis', tone: 'warning', icon: 'pause' },
  completed: { label: 'Selesai', tone: 'neutral', icon: 'check' },
});

export const STATUS_LABELS = Object.freeze({
  draft: 'Draf',
  scheduled: 'Terjadwal',
  active: 'Aktif',
  completed: 'Selesai',
});

export const ROLE_LABELS = Object.freeze({
  admin: 'Panitia (Admin)',
  observer: 'Pengawas',
});

export function candidatePairName(candidate) {
  return `${candidate.chairpersonName} & ${candidate.viceChairpersonName}`;
}

export function formatCandidateNumber(number) {
  return String(number).padStart(2, '0');
}

/** Inisial maksimal dua kata, mis. "Raka Aditya Pratama" → "RA" (pengganti foto). */
export function nameInitials(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

/** Memecah teks misi (satu misi per baris) menjadi daftar. */
export function splitMission(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Fase efektif di sisi tampilan (memakai jam server terkoreksi), agar tombol/formulir memilih
 * muncul & hilang tepat sesuai jadwal tanpa refresh. Backend tetap memvalidasi ulang setiap suara.
 */
export function effectivePhase(election, now) {
  if (election.status !== 'active') return election.phase;
  if (now < new Date(election.startAt).getTime()) return 'upcoming';
  if (now >= new Date(election.endAt).getTime()) return 'closed';
  return 'open';
}

/** Tahap proses pemilihan saat ini untuk timeline di beranda (0–3). */
export function currentStageIndex(phase) {
  switch (phase) {
    case 'upcoming':
      return 0;
    case 'open':
      return 1;
    case 'closed':
      return 2;
    case 'completed':
      return 3;
    default:
      return -1;
  }
}
