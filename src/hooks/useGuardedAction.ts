// Prevents double submission: while one action is running, further taps are ignored.
// A ref (not state) is used for the check because state updates are not instant, so two
// very fast taps could both see `pending === false`.
import { useCallback, useRef, useState } from 'react';

export function useGuardedAction() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);

  return { run, pending };
}
