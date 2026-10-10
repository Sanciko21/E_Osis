/**
 * Membuat foto KARTUN pasangan calon untuk data demo (client/public/demo/paslon-N.png).
 * Ilustrasi vektor buatan sendiri (bebas lisensi) dirender Chromium (Playwright) menjadi PNG
 * berlatar transparan, sehingga logo sekolah terlihat di belakang paslon pada kartu beranda.
 *
 *   node scripts/generate-demo-photos.js [folder-keluaran]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const OUTPUT_DIR = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'demo'));
// Bidang gambar 4:3 (sama dengan bingkai foto kartu), dipotong rapat agar tokoh tampak besar.
const VIEW = { x: 70, y: 105, width: 660, height: 495 };
const PNG_WIDTH = 960;

const INK = '#1e293b';
const SHIRT_LINE = '#cbd5e1';
const TIE = '#1e3a8a';

/** Menggelapkan warna hex (0–1). */
function darken(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift) => Math.round(((value >> shift) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

/** Rambut di belakang kepala (digambar sebelum badan). */
function hairBack({ cx, style, color }) {
  if (style === 'long') {
    return `<path d="M${cx - 88} 286 C${cx - 104} 176 ${cx - 42} 156 ${cx} 158 C${cx + 42} 156 ${cx + 104} 176 ${cx + 88} 286
      L${cx + 96} 424 C${cx + 72} 440 ${cx + 48} 432 ${cx + 38} 414 L${cx - 38} 414 C${cx - 48} 432 ${cx - 72} 440 ${cx - 96} 424 Z" fill="${color}"/>`;
  }
  if (style === 'bob') {
    return `<path d="M${cx - 92} 300 C${cx - 106} 178 ${cx - 42} 158 ${cx} 160 C${cx + 42} 158 ${cx + 106} 178 ${cx + 92} 300
      C${cx + 94} 342 ${cx + 86} 370 ${cx + 66} 380 L${cx - 66} 380 C${cx - 86} 370 ${cx - 94} 342 ${cx - 92} 300 Z" fill="${color}"/>`;
  }
  return '';
}

/** Helai rambut panjang yang jatuh di depan bahu (digambar setelah badan). */
function hairLocks({ cx, style, color }) {
  if (style !== 'long') return '';
  return [-1, 1]
    .map(
      (dir) => `<path d="M${cx + 70 * dir} 300 C${cx + 96 * dir} 352 ${cx + 100 * dir} 424 ${cx + 84 * dir} 478
        C${cx + 70 * dir} 446 ${cx + 62 * dir} 388 ${cx + 54 * dir} 330 Z" fill="${color}"/>`,
    )
    .join('');
}

/** Rambut depan/poni (digambar setelah wajah). */
function hairFront({ cx, style, color, clip }) {
  const shine = `<path d="M${cx - 30} 188 Q${cx} 178 ${cx + 26} 186" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="7" stroke-linecap="round"/>`;
  switch (style) {
    case 'short': // cepak dengan jambul berjumbai
      return `<path d="M${cx - 78} 270 C${cx - 86} 196 ${cx - 38} 170 ${cx} 170 C${cx + 46} 170 ${cx + 88} 196 ${cx + 78} 266
        Q${cx + 72} 238 ${cx + 60} 246 Q${cx + 56} 220 ${cx + 38} 232 Q${cx + 28} 206 ${cx + 10} 226 Q${cx - 4} 204 ${cx - 20} 226
        Q${cx - 34} 208 ${cx - 46} 234 Q${cx - 62} 226 ${cx - 66} 250 Q${cx - 76} 252 ${cx - 78} 270 Z" fill="${color}"/>${shine}`;
    case 'side': // belah samping
      return `<path d="M${cx - 79} 264 C${cx - 88} 190 ${cx - 30} 168 ${cx + 8} 172 C${cx + 58} 174 ${cx + 92} 206 ${cx + 79} 272
        C${cx + 72} 240 ${cx + 58} 224 ${cx + 40} 220 C${cx + 8} 238 ${cx - 40} 248 ${cx - 79} 264 Z" fill="${color}"/>${shine}`;
    case 'long':
      return `<path d="M${cx - 79} 270 C${cx - 86} 194 ${cx - 34} 172 ${cx} 174 C${cx + 40} 172 ${cx + 86} 194 ${cx + 79} 270
        C${cx + 62} 230 ${cx + 22} 212 ${cx - 6} 218 C${cx - 30} 222 ${cx - 62} 238 ${cx - 79} 270 Z" fill="${color}"/>${shine}`;
    case 'bob': // poni menyamping + jepit rambut
      return `<path d="M${cx - 81} 284 C${cx - 90} 192 ${cx - 34} 170 ${cx + 2} 172 C${cx + 46} 172 ${cx + 90} 196 ${cx + 81} 268
        C${cx + 56} 222 ${cx + 6} 214 ${cx - 30} 236 C${cx - 50} 248 ${cx - 70} 262 ${cx - 81} 284 Z" fill="${color}"/>${shine}
        ${clip ? `<rect x="${cx + 34}" y="204" width="34" height="11" rx="5.5" fill="${clip}" transform="rotate(-24 ${cx + 51} 209)"/>` : ''}`;
    default:
      return '';
  }
}

function face({ cx, fy, skin, hairColor, mouth, glasses }) {
  const cheek = (x) => `<ellipse cx="${x}" cy="${fy + 34}" rx="13" ry="7" fill="#f472b6" opacity="0.32"/>`;
  const eye = (x) => `<ellipse cx="${x}" cy="${fy + 8}" rx="8" ry="10" fill="${INK}"/><circle cx="${x + 3}" cy="${fy + 4}" r="3" fill="#ffffff"/>`;
  const brow = (x, dir) =>
    `<path d="M${x - 12 * dir} ${fy - 14} Q${x} ${fy - 23} ${x + 12 * dir} ${fy - 15}" fill="none" stroke="${hairColor}" stroke-width="5" stroke-linecap="round"/>`;
  const smile =
    mouth === 'open'
      ? `<path d="M${cx - 24} ${fy + 42} Q${cx} ${fy + 74} ${cx + 24} ${fy + 42} Z" fill="#7f1d1d"/>
         <path d="M${cx - 18} ${fy + 44} Q${cx} ${fy + 52} ${cx + 18} ${fy + 44} Z" fill="#ffffff"/>
         <path d="M${cx - 10} ${fy + 60} Q${cx} ${fy + 54} ${cx + 10} ${fy + 60} Q${cx} ${fy + 66} ${cx - 10} ${fy + 60} Z" fill="#f87171"/>`
      : `<path d="M${cx - 22} ${fy + 44} Q${cx} ${fy + 64} ${cx + 22} ${fy + 44}" fill="none" stroke="#9a3412" stroke-width="5" stroke-linecap="round"/>`;
  const specs = glasses
    ? `<g fill="none" stroke="${INK}" stroke-width="4"><circle cx="${cx - 28}" cy="${fy + 8}" r="19"/><circle cx="${cx + 28}" cy="${fy + 8}" r="19"/>
       <path d="M${cx - 9} ${fy + 6} Q${cx} ${fy} ${cx + 9} ${fy + 6}"/></g>`
    : '';
  return `${cheek(cx - 46)}${cheek(cx + 46)}${eye(cx - 28)}${eye(cx + 28)}${brow(cx - 28, 1)}${brow(cx + 28, -1)}
    <path d="M${cx - 5} ${fy + 26} Q${cx} ${fy + 32} ${cx + 5} ${fy + 26}" fill="none" stroke="${darken(skin, 0.25)}" stroke-width="4" stroke-linecap="round"/>
    ${smile}${specs}`;
}

/** Kemeja putih seragam SMP: kerah, dasi biru tua, papan nama, dan badge sekolah kuning di saku. */
function torso(cx) {
  const side = (dir) =>
    `<path d="M${cx + 165 * dir} 640 C${cx + 165 * dir} 504 ${cx + 140 * dir} 462 ${cx + 108 * dir} 446 C${cx + 128 * dir} 494 ${cx + 132 * dir} 548 ${cx + 126 * dir} 640 Z" fill="#e2e8f0"/>`;
  return `<path d="M${cx - 165} 640 L${cx - 165} 600 C${cx - 165} 492 ${cx - 118} 440 ${cx - 58} 426 L${cx + 58} 426
      C${cx + 118} 440 ${cx + 165} 492 ${cx + 165} 600 L${cx + 165} 640 Z" fill="#ffffff" stroke="${SHIRT_LINE}" stroke-width="3"/>
    ${side(-1)}${side(1)}
    <path d="M${cx - 13} 440 L${cx + 13} 440 L${cx + 9} 462 L${cx - 9} 462 Z" fill="${TIE}"/>
    <path d="M${cx - 9} 462 L${cx + 9} 462 L${cx + 19} 562 L${cx} 592 L${cx - 19} 562 Z" fill="${TIE}"/>
    <path d="M${cx - 62} 424 L${cx - 4} 440 L${cx - 30} 480 Z" fill="#ffffff" stroke="${SHIRT_LINE}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M${cx + 62} 424 L${cx + 4} 440 L${cx + 30} 480 Z" fill="#ffffff" stroke="${SHIRT_LINE}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="${cx + 48}" y="488" width="56" height="62" rx="7" fill="#ffffff" stroke="${SHIRT_LINE}" stroke-width="3"/>
    <path d="M${cx + 76} 498 L${cx + 90} 504 L${cx + 88} 520 Q${cx + 76} 532 ${cx + 64} 520 L${cx + 62} 504 Z" fill="#facc15" stroke="#ca8a04" stroke-width="3" stroke-linejoin="round"/>
    <rect x="${cx - 106}" y="494" width="58" height="17" rx="4" fill="${INK}"/><rect x="${cx - 99}" y="500" width="44" height="5" rx="2.5" fill="#e2e8f0"/>`;
}

function character(spec) {
  const { cx, skin, hair, hijab, tilt = 0, dy = 0 } = spec;
  const fy = 278;
  const skinShade = darken(skin, 0.12);
  const headTurn = `rotate(${tilt} ${cx} 360)`;
  const features = face({ cx, fy, skin, hairColor: hair.color, mouth: spec.mouth, glasses: spec.glasses });

  if (hijab) {
    const hijabShade = darken(hijab, 0.1);
    return `<g transform="translate(0 ${dy})">${torso(cx)}
      <path d="M${cx - 102} 300 C${cx - 106} 194 ${cx - 52} 164 ${cx} 164 C${cx + 52} 164 ${cx + 106} 194 ${cx + 102} 300
        C${cx + 102} 362 ${cx + 92} 404 ${cx + 74} 426 C${cx + 104} 440 ${cx + 128} 456 ${cx + 136} 476
        C${cx + 70} 500 ${cx - 70} 500 ${cx - 136} 476 C${cx - 128} 456 ${cx - 104} 440 ${cx - 74} 426
        C${cx - 92} 404 ${cx - 102} 362 ${cx - 102} 300 Z" fill="${hijab}" stroke="${hijabShade}" stroke-width="3"/>
      <path d="M${cx - 60} 452 Q${cx} 478 ${cx + 60} 452" fill="none" stroke="${hijabShade}" stroke-width="3" stroke-linecap="round"/>
      <g transform="${headTurn}"><ellipse cx="${cx}" cy="${fy + 4}" rx="68" ry="82" fill="${skin}" stroke="${hijabShade}" stroke-width="5"/>${features}</g></g>`;
  }

  const ears = [-1, 1]
    .map((dir) => `<ellipse cx="${cx + 72 * dir}" cy="${fy + 8}" rx="13" ry="19" fill="${skin}"/><ellipse cx="${cx + 72 * dir}" cy="${fy + 8}" rx="6" ry="10" fill="${skinShade}"/>`)
    .join('');
  return `<g transform="translate(0 ${dy})">
    <g transform="${headTurn}">${hairBack({ cx, ...hair })}</g>${torso(cx)}
    <path d="M${cx - 26} 336 L${cx - 26} 434 Q${cx} 450 ${cx + 26} 434 L${cx + 26} 336 Z" fill="${skinShade}"/>
    <ellipse cx="${cx}" cy="${fy + 72}" rx="34" ry="14" fill="${darken(skin, 0.2)}" opacity="0.35"/>
    ${hairLocks({ cx, ...hair })}
    <g transform="${headTurn}">${ears}<ellipse cx="${cx}" cy="${fy}" rx="74" ry="86" fill="${skin}"/>${hairFront({ cx, ...hair })}${features}</g></g>`;
}

/** Ketua di kiri (depan), wakil di kanan (belakang). */
function pairSvg([chair, vice]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW.width}" height="${VIEW.height}"
    viewBox="${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}">${character({ ...vice, cx: 520 })}${character({ ...chair, cx: 282 })}</svg>`;
}

// Warna jepit rambut mengikuti warna identitas paslon di grafik hasil.
const PAIRS = [
  // 1. Raka Aditya Pratama & Nabila Putri Lestari
  [
    { skin: '#e8b48a', hair: { style: 'short', color: '#1f2937' }, mouth: 'open', tilt: -4 },
    { skin: '#f0c4a0', hair: { color: '#3b2314' }, hijab: '#f8fafc', mouth: 'smile', tilt: 5, dy: 12 },
  ],
  // 2. Dimas Fajar Nugroho & Salsabila Kirana Dewi
  [
    { skin: '#c98e5c', hair: { style: 'side', color: '#111827' }, mouth: 'smile', glasses: true, tilt: 3 },
    { skin: '#f2c8a6', hair: { style: 'long', color: '#3b2314' }, mouth: 'open', tilt: -4, dy: 10 },
  ],
  // 3. Aulia Rahmawati & Bagas Satria Wibowo
  [
    { skin: '#d9a074', hair: { style: 'bob', color: '#1f2937', clip: '#1baf7a' }, mouth: 'open', tilt: -3, dy: 8 },
    { skin: '#a86b45', hair: { style: 'short', color: '#111827' }, mouth: 'smile', tilt: 4, dy: -4 },
  ],
];

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: VIEW.width, height: VIEW.height },
    deviceScaleFactor: PNG_WIDTH / VIEW.width,
  });
  for (const [index, pair] of PAIRS.entries()) {
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${pairSvg(pair)}</body></html>`);
    const file = path.join(OUTPUT_DIR, `paslon-${index + 1}.png`);
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: VIEW.width, height: VIEW.height } });
    console.log(`✓ ${path.relative(process.cwd(), file)}`);
  }
} finally {
  await browser.close();
}
