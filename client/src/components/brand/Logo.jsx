import { useId } from 'react';
import { appConfig } from '../../config/appConfig.js';

export function LogoMark({ size = 40, className = '' }) {
  // id gradasi unik per instance (logo tampil di navbar & footer sekaligus).
  const gradientId = useId();
  return (
    <svg className={`logo-mark ${className}`.trim()} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2457e6" />
          <stop offset="1" stopColor="#101b49" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="12" fill={`url(#${gradientId})`} />
      <rect x="11" y="10" width="26" height="29" rx="4" fill="#ffffff" />
      <path d="M17 24.5l5 5 9-11" fill="none" stroke="#2457e6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M37 3.5l2 4.1 4.5.6-3.3 3.2.8 4.5-4-2.1-4 2.1.8-4.5-3.3-3.2 4.5-.6z" fill="#ffc928" />
    </svg>
  );
}

/** Logo + nama E-OSIS (+ nama sekolah bila dikonfigurasi). */
export default function Logo({ inverted = false, size = 40, showSchool = true }) {
  return (
    <span className={`brand ${inverted ? 'brand--inverted' : ''}`}>
      <LogoMark size={size} className="brand__mark" />
      <span className="brand__text">
        <span className="brand__name">E-OSIS</span>
        {showSchool && (
          <span className="brand__tagline">{appConfig.schoolName || 'Pemilihan Ketua & Wakil OSIS'}</span>
        )}
      </span>
    </span>
  );
}
