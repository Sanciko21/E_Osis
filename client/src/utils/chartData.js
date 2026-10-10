/**
 * Penyusun data grafik. Semua angka berasal dari respons backend (agregasi PostgreSQL);
 * frontend tidak menghitung ulang hasil dari state lokal.
 *
 * Warna mengikuti IDENTITAS pasangan calon (nomor urut), bukan peringkat, sehingga satu
 * paslon selalu berwarna sama di grafik batang, donat, legenda, dan tabel. Palet
 * kategorikal ini sudah divalidasi (CVD & kontras); slot ke-9 dst. tidak dibuat warna baru.
 */
export const CANDIDATE_COLORS = Object.freeze([
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
]);
export const OVERFLOW_COLOR = '#94a3b8';

/** Warna non-data grafik (teks, grid, garis partisipasi) mengikuti token tema navy/royal blue. */
export const CHART_INK = Object.freeze({
  text: '#111936',
  secondary: '#34405f',
  muted: '#5e6a87',
  grid: '#e3e8f4',
  baseline: '#cbd3e6',
  surface: '#ffffff',
  accent: '#2457e6',
  accentWash: 'rgba(36, 87, 230, 0.10)',
});

export function candidateColor(candidateNumber) {
  return CANDIDATE_COLORS[candidateNumber - 1] ?? OVERFLOW_COLOR;
}

export function candidateShortLabel(candidate) {
  return `Paslon ${candidate.candidateNumber}`;
}

export function hasAnyVotes(candidates = []) {
  return candidates.some((candidate) => candidate.votes > 0);
}

export function buildVotesBarData(candidates) {
  return {
    labels: candidates.map(candidateShortLabel),
    datasets: [
      {
        label: 'Jumlah suara',
        data: candidates.map((candidate) => candidate.votes),
        backgroundColor: candidates.map((candidate) => candidateColor(candidate.candidateNumber)),
        borderRadius: 6,
        borderSkipped: 'start', // ujung data membulat, sisi baseline tetap persegi
        maxBarThickness: 24,
        categoryPercentage: 0.7,
        barPercentage: 0.9,
      },
    ],
  };
}

export function buildShareDoughnutData(candidates) {
  return {
    labels: candidates.map(candidateShortLabel),
    datasets: [
      {
        label: 'Persentase suara',
        data: candidates.map((candidate) => candidate.votes),
        backgroundColor: candidates.map((candidate) => candidateColor(candidate.candidateNumber)),
        borderColor: CHART_INK.surface, // celah 2px berwarna permukaan antarsegmen
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };
}

/**
 * Titik partisipasi kumulatif. Interval tanpa pemilih diisi 0 agar sumbu waktu tidak
 * "melompat" dan garis kumulatif tetap datar pada jeda tersebut. Garis selalu diawali
 * titik 0 pada interval sebelum suara pertama (sebelum itu memang belum ada pemilih).
 */
export function fillTimelineGaps(points, bucketSeconds) {
  if (!points?.length) return [];
  const step = bucketSeconds * 1000;
  const byTime = new Map(points.map((point) => [new Date(point.bucketStart).getTime(), point.voters]));
  const first = new Date(points[0].bucketStart).getTime();
  const last = new Date(points.at(-1).bucketStart).getTime();
  const filled = [{ bucketStart: new Date(first - step).toISOString(), voters: 0, cumulativeVoters: 0 }];
  let cumulative = 0;
  for (let time = first; time <= last && filled.length < 2000; time += step) {
    const voters = byTime.get(time) ?? 0;
    cumulative += voters;
    filled.push({ bucketStart: new Date(time).toISOString(), voters, cumulativeVoters: cumulative });
  }
  return filled;
}

export function buildTimelineData(points, formatLabel) {
  return {
    labels: points.map((point) => formatLabel(point.bucketStart)),
    datasets: [
      {
        label: 'Pemilih (kumulatif)',
        data: points.map((point) => point.cumulativeVoters),
        borderColor: CHART_INK.accent,
        backgroundColor: CHART_INK.accentWash,
        fill: true,
        borderWidth: 2,
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        tension: 0,
        pointRadius: points.length <= 2 ? 4 : 0,
        pointHoverRadius: 5,
        pointBackgroundColor: CHART_INK.accent,
        pointBorderColor: CHART_INK.surface,
        pointBorderWidth: 2,
        pointHitRadius: 12,
      },
    ],
  };
}

/** Ringkasan teks untuk pembaca layar (atribut aria-label pada canvas). */
export function describeVotes(candidates) {
  return candidates
    .map((candidate) => `${candidateShortLabel(candidate)}: ${candidate.votes} suara (${candidate.percentage}%)`)
    .join('; ');
}
