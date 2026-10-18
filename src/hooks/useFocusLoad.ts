// Loads data when a screen gains focus (so lists refresh after returning from an edit screen).
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type DependencyList } from 'react';

import { errorMessage } from '../utils/errors';

interface LoadState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useFocusLoad<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<LoadState<T>>({ data: null, loading: true, error: null });
  const latest = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latest.current; // ignore results from an older, slower request
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader();
      if (ticket === latest.current) setState({ data, loading: false, error: null });
    } catch (e) {
      if (ticket === latest.current) {
        setState((s) => ({ ...s, loading: false, error: errorMessage(e) }));
      }
    }
    // The caller lists what `loader` depends on, like the deps of useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { ...state, reload: load };
}
