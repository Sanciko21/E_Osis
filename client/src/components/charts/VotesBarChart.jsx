import { Bar } from 'react-chartjs-2';
import { CHART_INK, buildVotesBarData, describeVotes } from '../../utils/chartData.js';
import { candidatePairName } from '../../utils/election.js';
import { formatNumber, formatPercent } from '../../utils/format.js';
import { barValueLabelsPlugin, baseAnimation, tooltipStyle } from './chartSetup.js';

/** Grafik batang horizontal: perbandingan jumlah suara tiap pasangan calon. */
export default function VotesBarChart({ candidates }) {
  const data = buildVotesBarData(candidates);
  const label = (index) => `${formatNumber(candidates[index].votes)} · ${formatPercent(candidates[index].percentage)}`;
  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: baseAnimation(),
    layout: { padding: { right: 96 } },
    scales: {
      x: {
        beginAtZero: true,
        ticks: { precision: 0, color: CHART_INK.muted },
        grid: { color: CHART_INK.grid, lineWidth: 1 },
        border: { color: CHART_INK.baseline },
      },
      y: {
        ticks: { color: CHART_INK.text, font: { weight: '600' } },
        grid: { display: false },
        border: { color: CHART_INK.baseline },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          title: (items) => {
            const candidate = candidates[items[0].dataIndex];
            return `Nomor urut ${candidate.candidateNumber}`;
          },
          label: (item) => {
            const candidate = candidates[item.dataIndex];
            return `${candidatePairName(candidate)}: ${formatNumber(candidate.votes)} suara (${formatPercent(candidate.percentage)})`;
          },
        },
      },
      eosisBarValueLabels: { formatter: label },
    },
  };

  return (
    <div className="chart-canvas chart-canvas--fill" style={{ minHeight: `${Math.max(160, candidates.length * 52 + 48)}px` }}>
      <Bar
        data={data}
        options={options}
        plugins={[barValueLabelsPlugin]}
        role="img"
        aria-label={`Grafik batang jumlah suara. ${describeVotes(candidates)}`}
        fallbackContent={<p>{describeVotes(candidates)}</p>}
      />
    </div>
  );
}
