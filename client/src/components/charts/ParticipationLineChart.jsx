import { Line } from 'react-chartjs-2';
import { CHART_INK, buildTimelineData, fillTimelineGaps } from '../../utils/chartData.js';
import { formatClock, formatNumber, formatShortDateTime } from '../../utils/format.js';
import { EmptyState } from '../ui/States.jsx';
import { baseAnimation, crosshairPlugin, tooltipStyle } from './chartSetup.js';

/** Grafik garis: jumlah pemilih kumulatif dari waktu ke waktu (data dari voter_participation). */
export default function ParticipationLineChart({ timeline }) {
  const points = fillTimelineGaps(timeline?.points ?? [], timeline?.bucketSeconds ?? 3600);
  if (points.length === 0) {
    return (
      <EmptyState icon="chart" title="Belum ada data partisipasi">
        Grafik partisipasi tampil setelah ada siswa yang memilih.
      </EmptyState>
    );
  }
  const spansDays = new Date(points.at(-1).bucketStart).toDateString() !== new Date(points[0].bucketStart).toDateString();
  const formatLabel = spansDays ? formatShortDateTime : formatClock;
  const data = buildTimelineData(points, formatLabel);
  const last = points.at(-1);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: baseAnimation(),
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        ticks: { color: CHART_INK.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        grid: { display: false },
        border: { color: CHART_INK.baseline },
      },
      y: {
        beginAtZero: true,
        ticks: { precision: 0, color: CHART_INK.muted },
        grid: { color: CHART_INK.grid, lineWidth: 1 },
        border: { display: false },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          title: (items) => `Mulai ${formatShortDateTime(points[items[0].dataIndex].bucketStart)}`,
          label: (item) => {
            const point = points[item.dataIndex];
            return `${formatNumber(point.cumulativeVoters)} pemilih (+${formatNumber(point.voters)} pada interval ini)`;
          },
        },
      },
    },
  };

  return (
    <div className="chart-canvas" style={{ height: '260px' }}>
      <Line
        data={data}
        options={options}
        plugins={[crosshairPlugin]}
        role="img"
        aria-label={`Grafik garis partisipasi. Total ${last.cumulativeVoters} pemilih hingga ${formatShortDateTime(last.bucketStart)}.`}
        fallbackContent={<p>Total {last.cumulativeVoters} pemilih.</p>}
      />
    </div>
  );
}
