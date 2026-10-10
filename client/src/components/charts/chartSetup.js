import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { CHART_INK } from '../../utils/chartData.js';
import { prefersReducedMotion } from '../../utils/motion.js';

// Hanya komponen yang dipakai yang didaftarkan (tree-shaking).
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Filler, Tooltip);

ChartJS.defaults.font.family = '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif';
ChartJS.defaults.font.size = 12;
ChartJS.defaults.color = CHART_INK.secondary;

export const tooltipStyle = {
  backgroundColor: '#101b49',
  titleColor: '#ffffff',
  bodyColor: '#dce5fd',
  padding: 12,
  cornerRadius: 10,
  boxPadding: 6,
  titleFont: { weight: '600' },
  bodyFont: { weight: '500' },
};

export function baseAnimation() {
  return prefersReducedMotion() ? false : { duration: 900, easing: 'easeOutQuart' };
}

/** Garis vertikal tipis (crosshair) yang mengikuti titik data terdekat pada grafik garis. */
export const crosshairPlugin = {
  id: 'eosisCrosshair',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.() ?? [];
    if (!active.length) return;
    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = CHART_INK.baseline;
    ctx.stroke();
    ctx.restore();
  },
};

/** Label nilai di ujung batang (warna teks, bukan warna data). */
export const barValueLabelsPlugin = {
  id: 'eosisBarValueLabels',
  afterDatasetsDraw(chart, _args, options) {
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length || typeof options?.formatter !== 'function') return;
    const { ctx } = chart;
    ctx.save();
    ctx.font = `600 12px ${ChartJS.defaults.font.family}`;
    ctx.fillStyle = CHART_INK.text;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    meta.data.forEach((bar, index) => {
      ctx.fillText(options.formatter(index), bar.x + 8, bar.y);
    });
    ctx.restore();
  },
};

export { ChartJS };
