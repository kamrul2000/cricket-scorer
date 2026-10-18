// Loads one match and records scoring actions with these guarantees:
// - The screen only shows an action after its database transaction has succeeded.
// - While a save is running, further actions are ignored (no double submission).
// - If a save fails, the error stays visible with Retry. Retry first re-reads the database,
//   so an action that was in fact stored is never stored twice.
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useMatchService } from '../data/AppDataProvider';
import type { MatchEvent } from '../domain/match';
import { ScoringError, tryAddEvent } from '../domain/scoring';
import type { LoadedMatch } from '../services/matchService';
import { errorMessage } from '../utils/errors';

type FailedAction =
  | { kind: 'record'; event: MatchEvent; baseCount: number }
  | { kind: 'undo'; baseCount: number };

/** saveFailed = a storage error, already shown by the screen with Retry. */
export type SubmitResult = { ok: true } | { ok: false; error: string; saveFailed?: boolean };

export function useMatchScoring(matchId: string) {
  const service = useMatchService();
  const [match, setMatch] = useState<LoadedMatch | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const failed = useRef<FailedAction | null>(null);
  const busy = useRef(false);
  const matchRef = useRef<LoadedMatch | null>(null);
  matchRef.current = match;
  /** Bumped after every save attempt, so a slower, older load can never overwrite newer data. */
  const generation = useRef(0);

  const load = useCallback(async () => {
    setLoadError(null);
    const startedAt = generation.current;
    try {
      const loaded = await service.loadMatch(matchId);
      if (startedAt !== generation.current) return matchRef.current;
      if (!loaded) setLoadError('This match no longer exists.');
      setMatch(loaded);
      return loaded;
    } catch (e) {
      setLoadError(errorMessage(e));
      return null;
    }
  }, [service, matchId]);

  // Reload whenever the screen is shown, in case the match was changed from another screen.
  useFocusEffect(
    useCallback(() => {
      if (!busy.current && !failed.current) void load();
    }, [load]),
  );

  /** Runs one save at a time. Returns false if another save is already running. */
  const exclusive = useCallback(async (work: () => Promise<void>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    try {
      await work();
    } finally {
      generation.current += 1;
      busy.current = false;
      setSaving(false);
    }
    return true;
  }, []);

  const submit = useCallback(
    async (event: MatchEvent): Promise<SubmitResult> => {
      const current = matchRef.current;
      if (!current) return { ok: false, error: 'The match is still loading.' };
      if (failed.current) return { ok: false, error: 'Resolve the save problem shown above first.' };
      // Check before saving so rule problems are shown as validation, not save errors.
      const check = tryAddEvent(current.setup, current.events, event);
      if (!check.ok) return { ok: false, error: check.error };

      let result: SubmitResult = { ok: false, error: 'Please wait for the previous action to finish saving.' };
      await exclusive(async () => {
        try {
          const next = await service.recordEvent(current, event);
          setMatch(next);
          setSaveError(null);
          result = { ok: true };
        } catch (e) {
          if (e instanceof ScoringError) {
            result = { ok: false, error: e.message };
            return;
          }
          failed.current = { kind: 'record', event, baseCount: current.events.length };
          setSaveError(`Not saved: ${errorMessage(e)}`);
          result = { ok: false, error: 'The action was not saved.', saveFailed: true };
        }
      });
      return result;
    },
    [exclusive, service],
  );

  const undo = useCallback(async (): Promise<SubmitResult> => {
    const current = matchRef.current;
    if (!current) return { ok: false, error: 'The match is still loading.' };
    if (failed.current) return { ok: false, error: 'Resolve the save problem shown above first.' };
    let result: SubmitResult = { ok: false, error: 'Please wait for the previous action to finish saving.' };
    await exclusive(async () => {
      try {
        setMatch(await service.undo(current));
        result = { ok: true };
      } catch (e) {
        if (e instanceof ScoringError) {
          result = { ok: false, error: e.message };
          return;
        }
        failed.current = { kind: 'undo', baseCount: current.events.length };
        setSaveError(`Undo not saved: ${errorMessage(e)}`);
        result = { ok: false, error: 'Undo was not saved.', saveFailed: true };
      }
    });
    return result;
  }, [exclusive, service]);

  /** Re-reads the database, then repeats the failed action only if it was not stored. */
  const retry = useCallback(async () => {
    const action = failed.current;
    if (!action) return;
    await exclusive(async () => {
      try {
        const fresh = await service.loadMatch(matchId);
        if (!fresh) throw new Error('This match no longer exists.');
        const n = fresh.events.length;
        if (action.kind === 'record') {
          const last = fresh.events[n - 1];
          const alreadyStored = n === action.baseCount + 1 && JSON.stringify(last) === JSON.stringify(action.event);
          setMatch(alreadyStored ? fresh : n === action.baseCount ? await service.recordEvent(fresh, action.event) : fresh);
        } else {
          setMatch(n === action.baseCount ? await service.undo(fresh) : fresh);
        }
        failed.current = null;
        setSaveError(null);
      } catch (e) {
        setSaveError(`Still not saved: ${errorMessage(e)}`);
      }
    });
  }, [exclusive, service, matchId]);

  /** Gives up on the failed action and shows what is actually stored. */
  const discardFailed = useCallback(async () => {
    failed.current = null;
    setSaveError(null);
    await load();
  }, [load]);

  return { match, loadError, saving, saveError, submit, undo, retry, discardFailed, reload: load };
}
