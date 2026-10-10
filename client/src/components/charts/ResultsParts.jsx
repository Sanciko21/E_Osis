import { candidateColor } from '../../utils/chartData.js';
import { candidatePairName, formatCandidateNumber } from '../../utils/election.js';
import { formatNumber, formatPercent } from '../../utils/format.js';
import Icon from '../ui/Icon.jsx';

function Swatch({ candidate }) {
  return <span className="swatch" style={{ background: candidateColor(candidate.candidateNumber) }} aria-hidden="true" />;
}

/** Legenda HTML (identitas tidak bergantung pada warna: selalu ada nomor & nama). */
export function ResultsLegend({ candidates }) {
  return (
    <ul className="legend" aria-label="Legenda perolehan suara">
      {candidates.map((candidate) => (
        <li key={candidate.id} className="legend__item">
          <Swatch candidate={candidate} />
          <span className="legend__name">
            <strong>No. {candidate.candidateNumber}</strong> {candidatePairName(candidate)}
          </span>
          <span className="legend__value">{formatPercent(candidate.percentage)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Tabel hasil: padanan aksesibel untuk seluruh grafik. */
export function ResultsTable({ candidates, totals, caption = 'Rincian perolehan suara' }) {
  return (
    <div className="table-wrap">
      <table className="table table--results">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">No.</th>
            <th scope="col">Pasangan calon</th>
            <th scope="col" className="num">
              Suara
            </th>
            <th scope="col" className="num">
              Persentase
            </th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr key={candidate.id}>
              <td>
                <span className="table__number">
                  <Swatch candidate={candidate} />
                  {formatCandidateNumber(candidate.candidateNumber)}
                </span>
              </td>
              <th scope="row">
                {candidatePairName(candidate)}
                {candidate.isLeading && candidate.votes > 0 && (
                  <span className="lead-tag">
                    <Icon name="trophy" size={14} /> Suara terbanyak
                  </span>
                )}
              </th>
              <td className="num">{formatNumber(candidate.votes)}</td>
              <td className="num">{formatPercent(candidate.percentage)}</td>
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Total suara sah
              </th>
              <td className="num">{formatNumber(totals.validVotes)}</td>
              <td className="num">{totals.validVotes > 0 ? '100%' : '0%'}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/**
 * Meter partisipasi. Penyebut = jumlah siswa berhak pilih yang DIISI sekolah; bila tidak
 * diisi, persentase tidak dikarang — hanya jumlah pemilih unik yang ditampilkan.
 */
export function ParticipationMeter({ totals }) {
  if (!totals.eligibleVoters) {
    return (
      <div className="meter meter--unknown">
        <p className="meter__label">
          <strong>{formatNumber(totals.uniqueVoters)}</strong> siswa telah memilih
        </p>
        <p className="meter__note">
          Persentase partisipasi tampil bila panitia mengisi jumlah siswa berhak pilih pada pengaturan pemilihan.
        </p>
      </div>
    );
  }
  const value = Math.min(100, totals.turnoutPercentage ?? 0);
  const text = `${formatNumber(totals.uniqueVoters)} dari ${formatNumber(totals.eligibleVoters)} siswa (${formatPercent(totals.turnoutPercentage)})`;
  return (
    <div className="meter">
      <div className="meter__header">
        <span className="meter__label">Partisipasi pemilih</span>
        <span className="meter__value">{formatPercent(totals.turnoutPercentage)}</span>
      </div>
      <div
        className="meter__track"
        role="progressbar"
        aria-label="Partisipasi pemilih"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-valuetext={text}
      >
        <span className="meter__fill" style={{ width: `${value}%` }} />
      </div>
      <p className="meter__note">{text}</p>
    </div>
  );
}
