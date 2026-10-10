import { useEffect, useState } from 'react';

/**
 * Waktu "sekarang" yang diperbarui berkala, dikoreksi dengan selisih jam server
 * (`clockOffsetMs` dari respons API) agar hitung mundur tidak salah walau jam
 * perangkat siswa meleset.
 */
export function useNow(clockOffsetMs = 0, intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now + (Number.isFinite(clockOffsetMs) ? clockOffsetMs : 0);
}
