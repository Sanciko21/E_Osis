import { render, screen, within } from '@testing-library/react';
import { Chart } from 'chart.js';
import { describe, expect, it } from 'vitest';
import { makeResults } from '../../test/fixtures.js';
import { CANDIDATE_COLORS, candidateColor, fillTimelineGaps } from '../../utils/chartData.js';
import ParticipationLineChart from './ParticipationLineChart.jsx';
import ResultsCharts from './ResultsCharts.jsx';
import { ParticipationMeter } from './ResultsParts.jsx';

function chartFor(label) {
  const canvas = screen.getByRole('img', { name: label });
  const chart = Chart.getChart(canvas);
  expect(chart).toBeDefined();
  return chart;
}

describe('[14] grafik berfungsi saat data kosong dan saat data tersedia', () => {
  it('data kosong: empty state tampil, tidak ada grafik palsu, tabel tetap menunjukkan 0', () => {
    render(<ResultsCharts results={makeResults({ votes: [0, 0] })} showTimeline />);

    expect(screen.getByText('Belum ada suara yang masuk')).toBeInTheDocument();
    expect(screen.getByText('Belum ada data partisipasi')).toBeInTheDocument();
    expect(document.querySelectorAll('canvas')).toHaveLength(0);

    const table = screen.getByRole('table', { name: 'Rincian perolehan suara' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 2 kandidat + total
    expect(within(rows[3]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['0', '0%']);
  });

  it('data tersedia: grafik batang & donat memakai angka dari backend dan warna per identitas paslon', () => {
    render(<ResultsCharts results={makeResults({ votes: [6, 4] })} />);

    const bar = chartFor(/Grafik batang jumlah suara/);
    expect(bar.config.type).toBe('bar');
    expect(bar.data.labels).toEqual(['Paslon 1', 'Paslon 2']);
    expect(bar.data.datasets[0].data).toEqual([6, 4]);
    expect(bar.data.datasets[0].backgroundColor).toEqual([CANDIDATE_COLORS[0], CANDIDATE_COLORS[1]]);
    expect(bar.data.datasets[0].maxBarThickness).toBe(24);

    const doughnut = chartFor(/Grafik donat persentase suara/);
    expect(doughnut.config.type).toBe('doughnut');
    expect(doughnut.data.datasets[0].data).toEqual([6, 4]);

    // Legenda & tabel: identitas tidak bergantung warna saja.
    const legend = screen.getByRole('list', { name: 'Legenda perolehan suara' });
    expect(within(legend).getByText('60%')).toBeInTheDocument();
    expect(within(legend).getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('Suara terbanyak')).toBeInTheDocument();
    expect(screen.queryByText('Belum ada suara yang masuk')).not.toBeInTheDocument();
  });

  it('memperbarui grafik ketika data baru datang (tanpa membuat ulang komponen)', () => {
    const { rerender } = render(<ResultsCharts results={makeResults({ votes: [6, 4] })} />);
    rerender(<ResultsCharts results={makeResults({ votes: [7, 9] })} />);
    expect(chartFor(/Grafik batang jumlah suara/).data.datasets[0].data).toEqual([7, 9]);
  });

  it('grafik garis partisipasi: kumulatif, diawali 0, celah waktu diisi', () => {
    const timeline = {
      bucketSeconds: 900,
      points: [
        { bucketStart: '2026-10-20T00:00:00.000Z', voters: 3, cumulativeVoters: 3 },
        { bucketStart: '2026-10-20T00:30:00.000Z', voters: 2, cumulativeVoters: 5 },
      ],
    };
    render(<ParticipationLineChart timeline={timeline} />);
    const line = chartFor(/Grafik garis partisipasi/);
    expect(line.config.type).toBe('line');
    expect(line.data.datasets[0].data).toEqual([0, 3, 3, 5]);
  });

  it('meter partisipasi hanya memakai penyebut resmi dari sekolah', () => {
    const { rerender } = render(<ParticipationMeter totals={makeResults({ votes: [6, 4], eligibleVoters: 40 }).totals} />);
    const meter = screen.getByRole('progressbar', { name: 'Partisipasi pemilih' });
    expect(meter).toHaveAttribute('aria-valuenow', '25');
    expect(meter).toHaveAttribute('aria-valuetext', '10 dari 40 siswa (25%)');

    rerender(<ParticipationMeter totals={makeResults({ votes: [6, 4], eligibleVoters: null }).totals} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText(/siswa telah memilih/)).toBeInTheDocument();
  });
});

describe('penyusun data grafik', () => {
  it('warna mengikuti nomor urut (identitas), bukan peringkat', () => {
    expect(candidateColor(1)).toBe(CANDIDATE_COLORS[0]);
    expect(candidateColor(3)).toBe(CANDIDATE_COLORS[2]);
    expect(candidateColor(9)).not.toBe(candidateColor(1)); // slot ke-9 tidak mendaur ulang warna
  });

  it('fillTimelineGaps menambahkan titik nol dan mengisi interval kosong', () => {
    const filled = fillTimelineGaps(
      [
        { bucketStart: '2026-10-20T01:00:00.000Z', voters: 2 },
        { bucketStart: '2026-10-20T03:00:00.000Z', voters: 1 },
      ],
      3600,
    );
    expect(filled.map((point) => [point.bucketStart.slice(11, 16), point.voters, point.cumulativeVoters])).toEqual([
      ['00:00', 0, 0],
      ['01:00', 2, 2],
      ['02:00', 0, 2],
      ['03:00', 1, 3],
    ]);
    expect(fillTimelineGaps([], 900)).toEqual([]);
  });
});
