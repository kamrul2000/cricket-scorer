// Application workflows for matches. Every change goes through here:
// 1) the scoring engine checks the action and computes the new state,
// 2) the repository saves it in a single transaction,
// 3) only then does the caller get the new state to display.
import { awardsError, type MatchAwards } from '../domain/awards';
import { matchSummary } from '../domain/format';
import type { InningsStartEvent, MatchEvent, MatchSetup } from '../domain/match';
import {
  computeMatchState,
  currentInnings,
  eventsAfterUndo,
  ScoringError,
  tryAddEvent,
  type MatchState,
} from '../domain/scoring';
import type { MatchDetails, MatchRepository, MatchRowUpdate, StoredMatch } from '../data/matchRepository';
import { FORMAT_MAX_LENGTH, VENUE_MAX_LENGTH } from '../domain/schedule';
import { RepositoryError } from '../data/RepositoryError';
import { takeFault } from './faultInjection';

export { faultInjection } from './faultInjection';

export interface LoadedMatch {
  id: string;
  createdAt: string;
  setup: MatchSetup;
  events: MatchEvent[];
  state: MatchState;
  awards: MatchAwards;
  details: MatchDetails;
}

/** The match-list columns, always recomputed from the scoring engine's state. */
export function rowUpdate(state: MatchState): MatchRowUpdate {
  return { status: state.result ? 'completed' : 'inProgress', summary: matchSummary(state) };
}

/** Replays a stored match through the scoring engine. Throws RepositoryError('DAMAGED') if it cannot. */
export function toLoaded(stored: StoredMatch): LoadedMatch {
  try {
    const state = computeMatchState(stored.setup, stored.events);
    return {
      id: stored.id,
      createdAt: stored.createdAt,
      setup: stored.setup,
      events: stored.events,
      state,
      awards: stored.awards,
      details: stored.details,
    };
  } catch (e) {
    if (e instanceof ScoringError) {
      const where = e.eventIndex === null ? '' : ` at saved action ${e.eventIndex + 1}`;
      throw new RepositoryError('DAMAGED', `This match's saved history cannot be replayed${where}: ${e.message}`);
    }
    throw e;
  }
}

export function createMatchService(matches: MatchRepository) {
  return {
    /**
     * Validates the setup and openers with the engine, then saves the new match. With a
     * `scheduleId`, that scheduled match is marked started in the same transaction (once only).
     */
    async startMatch(
      setup: MatchSetup,
      openers: Omit<InningsStartEvent, 'type'>,
      extra: { details?: MatchDetails; scheduleId?: string } = {},
    ): Promise<string> {
      const event: InningsStartEvent = { type: 'inningsStart', ...openers };
      const state = computeMatchState(setup, [event]); // throws ScoringError if invalid
      const details = extra.details ? { venue: extra.details.venue.trim(), formatName: extra.details.formatName.trim() } : undefined;
      if (details && details.venue.length > VENUE_MAX_LENGTH) throw new ScoringError(`The venue must be ${VENUE_MAX_LENGTH} characters or fewer.`);
      if (details && details.formatName.length > FORMAT_MAX_LENGTH) throw new ScoringError('The format name is too long.');
      return matches.create(setup, { event, inningsIndex: 0, record: null }, rowUpdate(state), {
        ...takeFault(),
        details,
        scheduleId: extra.scheduleId,
      });
    },

    async loadMatch(id: string): Promise<LoadedMatch | null> {
      const stored = await matches.load(id);
      return stored ? toLoaded(stored) : null;
    },

    /**
     * Checks and saves one event. Throws ScoringError if the engine rejects it (nothing is
     * written), or a storage error if the save fails (nothing is written either).
     */
    async recordEvent(match: LoadedMatch, event: MatchEvent): Promise<LoadedMatch> {
      const checked = tryAddEvent(match.setup, match.events, event);
      if (!checked.ok) throw new ScoringError(checked.error);
      const state = checked.state;
      const seq = match.events.length;
      const inn = currentInnings(state)!;
      const record =
        event.type === 'delivery' ? (inn.deliveries.find((d) => d.eventIndex === seq) ?? null) : null;
      await matches.appendEvent(match.id, seq, { event, inningsIndex: inn.index, record }, rowUpdate(state), takeFault());
      return { ...match, events: [...match.events, event], state };
    },

    /** Removes the latest event durably. */
    async undo(match: LoadedMatch): Promise<LoadedMatch> {
      const events = eventsAfterUndo(match.events);
      if (!events) throw new ScoringError('There is nothing to undo.');
      if (events.length === 0) {
        throw new ScoringError('The opening batters and bowler cannot be undone. Delete the match to start again.');
      }
      const state = computeMatchState(match.setup, events);
      await matches.removeLastEvent(match.id, match.events.length, rowUpdate(state), takeFault());
      return { ...match, events, state };
    },

    /**
     * Every match the player played in, replayed by the engine. A match whose history cannot be
     * replayed is skipped and counted, so one damaged match does not hide a whole career.
     */
    async loadMatchesForPlayer(playerId: string): Promise<{ matches: LoadedMatch[]; skipped: number }> {
      const matchesFound: LoadedMatch[] = [];
      let skipped = 0;
      for (const id of await matches.idsForPlayer(playerId)) {
        try {
          const stored = await matches.load(id);
          if (stored) matchesFound.push(toLoaded(stored));
        } catch (e) {
          if (e instanceof RepositoryError && e.code === 'DAMAGED') skipped += 1;
          else throw e;
        }
      }
      return { matches: matchesFound, skipped };
    },

    /** Saves the awards of a finished match after checking every chosen player is eligible. */
    async setAwards(match: LoadedMatch, awards: MatchAwards): Promise<LoadedMatch> {
      if (!match.state.result) throw new ScoringError('Awards can be given once the match is complete.');
      const problem = awardsError(match.state, awards);
      if (problem) throw new ScoringError(problem);
      await matches.setAwards(match.id, awards);
      return { ...match, awards };
    },

    deleteMatch(id: string): Promise<void> {
      return matches.delete(id);
    },
  };
}

export type MatchService = ReturnType<typeof createMatchService>;
