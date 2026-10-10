import { Doughnut } from 'react-chartjs-2';
import { buildShareDoughnutData, describeVotes } from '../../utils/chartData.js';
import { candidatePairName } from '../../utils/election.js';
import { formatNumber, formatPercent } from '../../utils/format.js';
import { baseAnimation, tooltipStyle } from './chartSetup.js';

/** Grafik donat: persentase perolehan suara (bagian dari keseluruhan suara sah). */
export default function VoteShareChart({ candidates, totalVotes }) {
  const data = buildShareDoughnutData(candidates);
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '64%',
    animation: baseAnimation(),
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          title: (items) => `Nomor urut ${candidates[items[0].dataIndex].candidateNumber}`,
          label: (item) => {
            const candidate = candidates[item.dataIndex];
            return `${candidatePairName(candidate)}: ${formatPercent(candidate.percentage)} (${formatNumber(candidate.votes)} suara)`;
          },
        },
      },
    },
  };

  return (
    <div className="chart-canvas chart-canvas--doughnut">
      <Doughnut
        data={data}
        options={options}
        role="img"
        aria-label={`Grafik donat persentase suara. ${describeVotes(candidates)}`}
        fallbackContent={<p>{describeVotes(candidates)}</p>}
      />
      <div className="doughnut-center" aria-hidden="true">
        <span className="doughnut-center__value">{formatNumber(totalVotes)}</span>
        <span className="doughnut-center__label">suara sah</span>
      </div>
    </div>
  );
}
