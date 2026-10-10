import { PHASE_META } from '../../utils/election.js';
import Icon from './Icon.jsx';

/** Lencana fase pemilihan: selalu ikon + teks (tidak bergantung pada warna saja). */
export default function StatusBadge({ phase, label, className = '' }) {
  const meta = PHASE_META[phase] ?? PHASE_META.draft;
  return (
    <span className={`badge badge--${meta.tone} ${className}`.trim()}>
      <Icon name={meta.icon} size={14} />
      <span>{label ?? meta.label}</span>
    </span>
  );
}
