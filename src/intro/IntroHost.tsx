// Shows the animated intro over the app on the first launch, and again when asked (Settings).
// Whether it was seen is kept in a tiny key-value store, separate from the scoring database and
// not part of backups.
import Storage from 'expo-sqlite/kv-store';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { IntroOverlay } from '../components/intro/IntroOverlay';

/** Change the version to show a new intro once to everyone after an update. */
const SEEN_KEY = 'intro.seen.v1';

function introSeen(): boolean {
  try {
    return Storage.getItemSync(SEEN_KEY) === '1';
  } catch {
    return false; // if the store cannot be read, showing the (skippable) intro is harmless
  }
}

function markIntroSeen() {
  try {
    Storage.setItemSync(SEEN_KEY, '1');
  } catch {
    // Not critical: the intro would just show again next time.
  }
}

const PlayIntroContext = createContext<() => void>(() => undefined);

/** Replays the intro (for example from Settings). */
export function usePlayIntro() {
  return useContext(PlayIntroContext);
}

export function IntroHost({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(() => !introSeen());
  const play = useCallback(() => setVisible(true), []);
  const done = useCallback(() => {
    markIntroSeen();
    setVisible(false);
  }, []);
  return (
    <PlayIntroContext.Provider value={play}>
      {children}
      {visible ? <IntroOverlay onDone={done} /> : null}
    </PlayIntroContext.Provider>
  );
}
