import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isAbortError } from '../services/apiClient.js';

const INITIAL = { data: undefined, error: null, loading: true, refreshing: false };

/**
 * Memuat data async dengan status loading/error, pembatalan saat komponen dilepas
 * atau dependensi berubah, dan "refetch tanpa kedip": saat memuat ulang, data lama
 * tetap ditampilkan (refreshing = true) alih-alih kembali ke skeleton.
 *
 * @param loader (signal) => Promise<data>
 * @param deps   dependensi yang memicu pemuatan ulang
 */
export function useResource(loader, deps = []) {
  const [state, setState] = useState(INITIAL);
  const loaderRef = useRef(loader);
  const controllerRef = useRef(null);

  useLayoutEffect(() => {
    loaderRef.current = loader;
  });

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((previous) => ({
      ...previous,
      loading: previous.data === undefined,
      refreshing: previous.data !== undefined,
    }));
    try {
      const data = await loaderRef.current(controller.signal);
      if (!controller.signal.aborted) setState({ data, error: null, loading: false, refreshing: false });
      return data;
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return undefined;
      setState((previous) => ({ ...previous, error, loading: false, refreshing: false }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps diteruskan oleh pemanggil
  }, deps);

  return { ...state, reload: load };
}
