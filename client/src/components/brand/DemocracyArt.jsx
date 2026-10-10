/**
 * Ilustrasi dekoratif bertema demokrasi (kotak suara, surat suara, bintang, konfeti) dengan
 * palet E-OSIS. Murni hiasan: aria-hidden. Kelas art-* dianimasikan GSAP di Hero.
 */
function Star({ x, y, size = 1 }) {
  // GSAP menganimasikan <g> pembungkus agar transform posisi bintang tidak tertimpa.
  return (
    <g className="art-star">
      <path
        transform={`translate(${x} ${y}) scale(${size})`}
        d="M0-12l3.5 7.6 8.3.9-6.2 5.6 1.7 8.2L0 6.2l-7.3 4.1 1.7-8.2-6.2-5.6 8.3-.9z"
        fill="#ffd95c"
      />
    </g>
  );
}

/** Potongan konfeti berwarna (persegi membulat yang diputar). */
function Confetti({ x, y, color, rotate = 0, w = 12, h = 6 }) {
  return (
    <g className="art-confetti">
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} fill={color} transform={`rotate(${rotate} ${x} ${y})`} />
    </g>
  );
}

export default function DemocracyArt({ className = '' }) {
  return (
    <svg className={`democracy-art ${className}`} viewBox="0 0 420 380" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="art-box-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e3e8f4" />
        </linearGradient>
        <linearGradient id="art-band" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2457e6" />
          <stop offset="1" stopColor="#18a999" />
        </linearGradient>
        <radialGradient id="art-glow" cx="0.5" cy="0.45" r="0.5">
          <stop offset="0" stopColor="#7c9cff" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#eae7ff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#eae7ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle className="art-halo" cx="210" cy="175" r="170" fill="url(#art-glow)" />
      <ellipse className="art-shadow" cx="210" cy="338" rx="150" ry="16" fill="#0b1336" opacity="0.4" />

      <g className="art-ballot">
        <rect x="160" y="40" width="100" height="128" rx="12" fill="#ffffff" stroke="#dce5fd" strokeWidth="3" />
        <rect x="178" y="62" width="64" height="8" rx="4" fill="#cbd3e6" />
        <rect x="178" y="80" width="44" height="8" rx="4" fill="#e3e8f4" />
        <circle cx="210" cy="124" r="22" fill="#e3f7ee" />
        <path d="M199 124l8 8 15-17" fill="none" stroke="#177a50" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <g className="art-box">
        <rect x="92" y="196" width="236" height="134" rx="22" fill="url(#art-box-front)" />
        <rect x="74" y="170" width="272" height="40" rx="14" fill="#f5f7fc" stroke="#cbd3e6" strokeWidth="2" />
        <rect x="150" y="183" width="120" height="12" rx="6" fill="#101b49" />
        <rect x="92" y="226" width="236" height="44" fill="url(#art-band)" />
        <text x="210" y="256" textAnchor="middle" fontSize="20" fontWeight="800" letterSpacing="6" fill="#ffffff" fontFamily="inherit">
          PEMILU OSIS
        </text>
        <circle cx="210" cy="300" r="15" fill="#ffc928" />
        <path d="M210 291.5l2.5 5.3 5.8.7-4.3 3.9 1.2 5.7-5.2-2.9-5.2 2.9 1.2-5.7-4.3-3.9 5.8-.7z" fill="#ffffff" />
      </g>

      <g className="art-check art-check--left">
        <circle cx="58" cy="128" r="25" fill="#35c98a" />
        <path d="M47 128l7 7 13-14" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g className="art-check art-check--right">
        <circle cx="366" cy="96" r="19" fill="#ffc928" />
        <path d="M358 96l5 5 10-11" fill="none" stroke="#101b49" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g className="art-check art-check--bottom">
        <circle cx="372" cy="232" r="15" fill="#ff786b" />
        <path d="M372 225v14M365 232h14" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
      </g>

      <Star x={110} y={60} size={1.1} />
      <Star x={340} y={190} size={0.8} />
      <Star x={36} y={250} size={0.7} />
      <Star x={300} y={40} size={0.6} />
      <Star x={398} y={300} size={0.9} />

      <Confetti x={70} y={196} color="#ff786b" rotate={-30} />
      <Confetti x={132} y={118} color="#18a999" rotate={40} w={10} />
      <Confetti x={290} y={128} color="#eae7ff" rotate={-20} />
      <Confetti x={334} y={146} color="#35c98a" rotate={60} w={10} />
      <Confetti x={26} y={92} color="#ffc928" rotate={15} w={9} />
      <Confetti x={248} y={22} color="#ff786b" rotate={70} w={9} />
    </svg>
  );
}
