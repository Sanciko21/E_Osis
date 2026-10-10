import { useCallback, useRef, useState } from 'react';
import { castVote } from '../services/electionsApi.js';
import { confirmVote, promptNisn, showVoteFailure, showVoteProcessing, showVoteSuccess } from '../utils/alerts.js';

/**
 * Memilih langsung dari kartu pasangan calon: NISN → konfirmasi "Ya, Saya Yakin" → kirim.
 * - Hanya satu proses pada satu waktu (penjaga sinkron, aman dari klik ganda).
 * - Request dikirim HANYA setelah konfirmasi; sukses tampil hanya setelah server menjawab 201.
 * - Setelah selesai, halaman tidak menyimpan/menampilkan pilihan (aman untuk perangkat bersama).
 * `onStale` dipanggil bila data pemilihan perlu dimuat ulang (mis. waktu memilih sudah habis).
 */
export function useCardVoting(election, { onStale } = {}) {
  const runningRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const vote = useCallback(
    async (candidate) => {
      if (runningRef.current || !election) return;
      runningRef.current = true;
      setBusy(true);
      try {
        const nisn = await promptNisn(candidate);
        if (!nisn) return; // "Batal"
        if (!(await confirmVote(candidate))) return; // "Kembali" → tidak ada request

        showVoteProcessing();
        await castVote(election.id, { nisn, candidateId: candidate.id });
        await showVoteSuccess();
      } catch (problem) {
        if (await showVoteFailure(problem, { startAt: election.startAt })) onStale?.();
      } finally {
        runningRef.current = false;
        setBusy(false);
      }
    },
    [election, onStale],
  );

  return { vote, busy };
}
