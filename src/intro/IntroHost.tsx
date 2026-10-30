// Shows the animated intro over the app every time the app starts, and again when asked (Settings).
// The app mounts underneath it straight away, so the database opens while the intro plays.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { IntroOverlay } from '../components/intro/IntroOverlay';

const PlayIntroContext = createContext<() => void>(() => undefined);

/** Replays the intro (for example from Settings). */
export function usePlayIntro() {
  return useContext(PlayIntroContext);
}

export function IntroHost({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  const play = useCallback(() => setVisible(true), []);
  const done = useCallback(() => setVisible(false), []);
  return (
    <PlayIntroContext.Provider value={play}>
      {children}
      {visible ? <IntroOverlay onDone={done} /> : null}
    </PlayIntroContext.Provider>
  );
}
