import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Menjalankan callback berkala selama `enabled`. Dijeda saat tab tidak terlihat
 * agar tidak membebani server, dan langsung dijalankan lagi saat tab kembali aktif.
 */
export function usePolling(callback, intervalMs, enabled = true) {
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') callbackRef.current();
    };
    const timer = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') callbackRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled]);
}
