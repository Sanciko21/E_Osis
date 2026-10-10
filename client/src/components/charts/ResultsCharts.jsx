import './chartSetup.js';
import { hasAnyVotes } from '../../utils/chartData.js';
import { EmptyState } from '../ui/States.jsx';
import ParticipationLineChart from './ParticipationLineChart.jsx';
import { ResultsLegend, ResultsTable } from './ResultsParts.jsx';
import VoteShareChart from './VoteShareChart.jsx';
import VotesBarChart from './VotesBarChart.jsx';

/**
 * Kumpulan grafik hasil. Data kosong ditangani dengan empty state (bukan grafik
 * kosong/angka palsu), dan tabel selalu ditampilkan sebagai padanan aksesibel.
 */
export default function ResultsCharts({ results, showTimeline = false, refreshing = false }) {
  const { candidates, totals } = results;
  const empty = !hasAnyVotes(candidates);

  return (
    <div className={`results-charts ${refreshing ? 'is-refreshing' : ''}`}>
      {empty ? (
        <EmptyState icon="chart" title="Belum ada suara yang masuk">
          Grafik perolehan suara akan tampil otomatis setelah ada suara sah.
        </EmptyState>
      ) : (
        <div className="chart-grid">
          <figure className="chart-card chart-card--bars">
            <figcaption className="chart-card__title">Perbandingan jumlah suara</figcaption>
            <VotesBarChart candidates={candidates} />
          </figure>
          <figure className="chart-card chart-card--share">
            <figcaption className="chart-card__title">Persentase perolehan suara</figcaption>
            <div className="share-layout">
              <VoteShareChart candidates={candidates} totalVotes={totals.validVotes} />
              <ResultsLegend candidates={candidates} />
            </div>
          </figure>
        </div>
      )}

      {showTimeline && (
        <figure className="chart-card chart-card--wide">
          <figcaption className="chart-card__title">Partisipasi dari waktu ke waktu</figcaption>
          <ParticipationLineChart timeline={results.timeline} />
        </figure>
      )}

      <ResultsTable candidates={candidates} totals={totals} />
    </div>
  );
}
