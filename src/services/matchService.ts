// Application workflows for matches. Every change goes through here:
// 1) the scoring engine checks the action and computes the new state,
// 2) the repository saves it in a single transaction,
// 3) only then does the caller get the new state to display.
import { awardsError, type MatchAwards } from '../domain/awards';
import { matchSummary } from '../domain/format';
import type { DeliveryEvent, InningsStartEvent, MatchEvent, MatchSetup, TeamLineup } from '../domain/match';
import {
  computeMatchState,
  currentInnings,
  eventsAfterUndo,
  ScoringError,
  tryAddEvent,
  tryEditDelivery,
  type MatchState,
} from '../domain/scoring';
import {
  PAUSE_REASON_MAX_LENGTH,
  type MatchDetails,
  type MatchPause,
  type MatchRepository,
  type MatchRowUpdate,
  type StoredMatch,
} from '../data/matchRepository';
import type { EventToStore } from '../data/matchEventRows';
import { FORMAT_MAX_LENGTH, VENUE_MAX_LENGTH } from '../domain/schedule';
import { validateMatchSetup } from '../domain/setupValidation';
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
  pause: MatchPause | null;
}

/** Settings that can still be changed after the start, until the first ball is bowled. */
export interface MatchSettings {
  oversPerInnings: number;
  maxOversPerBowler: number | null;
  freeHitAfterNoBall: boolean;
  /** Players per side, in team order. */
  sizes: [number, number];
}

/** The match-list columns, always recomputed from the scoring engine's state. */
export function rowUpdate(state: MatchState): MatchRowUpdate {
  return {
    status: state.result ? 'completed' : 'inProgress',
    summary: matchSummary(state),
    abandoned: state.result?.type === 'noResult',
  };
}

/**
 * What the repository stores for each of `events` (from `from` on), given the engine's state
 * after all of them: the innings each event belongs to and, for deliveries, their record.
 */
export function storableEvents(state: MatchState, events: readonly MatchEvent[], from = 0): EventToStore[] {
  const records = new Map(state.innings.flatMap((inn) => inn.deliveries).map((r) => [r.eventIndex, r]));
  const items: EventToStore[] = [];
  let inningsIndex = -1;
  events.forEach((event, seq) => {
    if (event.type === 'inningsStart') inningsIndex += 1;
    if (seq >= from) items.push({ event, inningsIndex: Math.max(0, inningsIndex), record: records.get(seq) ?? null });
  });
  return items;
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
      pause: stored.pause,
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

    /**
     * Changes what was recorded for an earlier delivery and saves the replayed history in one
     * transaction. Throws ScoringError if the edit does not fit (nothing is written).
     */
    async editDelivery(match: LoadedMatch, index: number, event: DeliveryEvent): Promise<LoadedMatch> {
      const checked = tryEditDelivery(match.setup, match.events, index, event);
      if (!checked.ok) throw new ScoringError(checked.error);
      const items = storableEvents(checked.state, checked.events, index);
      await matches.replaceEventsFrom(match.id, index, match.events.length, items, rowUpdate(checked.state), takeFault());
      return { ...match, events: checked.events, state: checked.state };
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

    /**
     * Changes the overs, team sizes, bowling limit or free-hit rule before the first ball. The
     * recorded actions (openers, players added, ...) are replayed on the new settings first.
     */
    async updateSettings(match: LoadedMatch, settings: MatchSettings): Promise<LoadedMatch> {
      if (match.events.some((e) => e.type === 'delivery')) {
        throw new ScoringError('The first ball has been bowled, so these settings can no longer be changed. To shorten the match, use "Change overs".');
      }
      // As stored: a size only when the lineup does not name the whole team.
      const resize = (team: TeamLineup, size: number): TeamLineup => {
        const copy: TeamLineup = { ...team };
        delete copy.size;
        if (size !== copy.players.length) copy.size = size;
        return copy;
      };
      const setup: MatchSetup = {
        ...match.setup,
        rules: {
          oversPerInnings: settings.oversPerInnings,
          maxOversPerBowler: settings.maxOversPerBowler,
          freeHitAfterNoBall: settings.freeHitAfterNoBall,
        },
        teams: [resize(match.setup.teams[0], settings.sizes[0]), resize(match.setup.teams[1], settings.sizes[1])],
      };
      const problems = validateMatchSetup(setup);
      if (problems.length) throw new ScoringError(problems[0]);
      const checked = tryAddEvent(setup, match.events.slice(0, -1), match.events[match.events.length - 1]);
      if (!checked.ok) throw new ScoringError(`These settings do not fit what was recorded: ${checked.error}`);
      await matches.updateSettings(match.id, match.events.length, setup, rowUpdate(checked.state), takeFault());
      return { ...match, setup, state: checked.state };
    },

    /** Pauses the match (with an optional short reason such as "Rain"), or resumes it (null). */
    async setPause(match: LoadedMatch, pause: { reason: string | null } | null): Promise<LoadedMatch> {
      if (match.state.result) throw new ScoringError('The match is already complete.');
      const reason = pause?.reason?.trim() || null;
      if (reason && reason.length > PAUSE_REASON_MAX_LENGTH) {
        throw new ScoringError(`The reason must be ${PAUSE_REASON_MAX_LENGTH} characters or fewer.`);
      }
      return { ...match, pause: await matches.setPause(match.id, pause ? { reason } : null) };
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
