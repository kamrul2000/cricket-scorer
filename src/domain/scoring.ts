// The scoring engine. Pure functions: (setup, events) -> match state.
//
// Every screen, scorecard and result is derived from `computeMatchState`, so there is exactly
// one implementation of the cricket rules. Rules and Law references: docs/SCORING_RULES.md.

import {
  BALLS_PER_OVER,
  MAX_RUNS_PER_DELIVERY,
  SUPER_OVER_OVERS,
  SUPER_OVER_WICKETS,
  teamSize,
  type AddPlayerEvent,
  type DeliveryEvent,
  type DeliveryInput,
  type DismissalKind,
  type MatchEvent,
  type MatchSetup,
  type RetireEvent,
  type Retirement,
  type ReviseOversEvent,
  type TeamLineup,
} from './match';
import { canBowlRemainingOvers, firstBattingTeamIndex, validateMatchSetup } from './setupValidation';

// ---------------------------------------------------------------------------------------------
// State types

export interface Extras {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
}

/** How a batter was out: a dismissal on a delivery, or retired out (Law 25.4.3). */
export type WicketKind = DismissalKind | 'retiredOut';

export interface WicketRecord {
  kind: WicketKind;
  playerOutId: string;
  fielderId: string | null;
  /** The bowler of the delivery. null for retired out, which happens between deliveries. */
  bowlerId: string | null;
  /** Bowled, caught, LBW, stumped and hit wicket are credited to the bowler; run out and retired out are not. */
  creditedToBowler: boolean;
}

/** Everything derived from one delivery. */
export interface DeliveryRecord {
  eventIndex: number;
  inningsIndex: number;
  /** 0-based over number this delivery belongs to. */
  over: number;
  /** Fair deliveries bowled in this over, including this one if it is fair. */
  legalBallInOver: number;
  event: DeliveryEvent;
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  batterRuns: number;
  extras: Extras;
  totalRuns: number;
  /** Runs debited to the bowler: bat runs + wides + no-ball extras (Law 18.10.3). */
  bowlerRuns: number;
  /** Counts toward the 6 balls of the over (Law 17.3). */
  isLegalBall: boolean;
  /** Counts as a ball faced by the striker (scoring convention: all except wides). */
  isBallFaced: boolean;
  isFreeHit: boolean;
  isFour: boolean;
  isSix: boolean;
  wicket: WicketRecord | null;
}

export interface BatterStats {
  playerId: string;
  name: string;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  wicket: WicketRecord | null;
  /** Retired hurt and not batting now. Cleared when they resume their innings. */
  retiredHurt: boolean;
}

export interface BowlerStats {
  playerId: string;
  name: string;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  maidens: number;
  wideBalls: number;
  noBallBalls: number;
}

export interface FallOfWicket {
  wicketNumber: number;
  teamRuns: number;
  legalBalls: number;
  playerOutId: string;
}

/** Two batters batting together, from when the second of them arrived until a wicket. */
export interface Partnership {
  /** The wicket it is for: 1 = the opening partnership, 2 = after the first wicket, ... */
  number: number;
  batterIds: [string, string];
  /** Runs off the bat by each batter in `batterIds` order while they batted together. */
  batterRuns: [number, number];
  /** Team runs added, including extras. */
  runs: number;
  /** Balls faced by the pair (wides excluded, the same convention as a batter's balls faced). */
  balls: number;
  /** Ended by a wicket. false = unbroken (still together, or not out at the end). */
  broken: boolean;
  /** Ended because one of the pair retired hurt (no wicket fell). */
  retired: boolean;
}

/** One over: runs and wickets in it, and the team score at its end (or now, if unfinished). */
export interface OverSummary {
  /** 0-based over number. */
  over: number;
  /** Who bowled in this over: one bowler, or more if a bowler was replaced during it. */
  bowlerIds: string[];
  runs: number;
  wickets: number;
  legalBalls: number;
  totalRuns: number;
  totalWickets: number;
  complete: boolean;
}

/** A batter retiring between deliveries (Law 25.4). */
export interface RetirementRecord {
  eventIndex: number;
  playerId: string;
  retirement: Retirement;
  teamRuns: number;
  wickets: number;
  legalBalls: number;
}

/** 'closed' = ended early by the scorers (CloseInningsEvent). */
export type InningsEndReason = 'overs' | 'allOut' | 'targetReached' | 'abandoned' | 'closed';

export interface InningsState {
  /** 0 and 1 are the main innings; 2 and 3 the first Super Over; 4 and 5 the second; ... */
  index: number;
  /** null for the main innings; 1, 2, ... for each Super Over. */
  superOver: number | null;
  battingTeam: TeamLineup;
  bowlingTeam: TeamLineup;
  /** Overs available: the match overs, or 1 in a Super Over. Lower after a ReviseOversEvent. */
  oversLimit: number;
  /** Overs the innings had when the match was set up (compare with oversLimit). */
  plannedOvers: number;
  /** Wickets that end the innings: the batting team size - 1, or at most 2 in a Super Over. */
  wicketsLimit: number;
  /** Runs needed to win (second innings of the match or of a Super Over only). */
  target: number | null;
  /** The target was revised after overs were lost (ReviseOversEvent). */
  targetRevised: boolean;
  runs: number;
  wickets: number;
  legalBalls: number;
  extras: Extras;
  /** In batting order (order of first arrival at the crease). */
  batters: BatterStats[];
  /** In order of first bowling. */
  bowlers: BowlerStats[];
  /** null = that end is waiting for a new batter. */
  strikerId: string | null;
  nonStrikerId: string | null;
  /** Bowler of the current over; null between overs. */
  bowlerId: string | null;
  /** Everyone who bowled (part of) the previous over: none of them may bowl the next one (Law 17.6). */
  previousOverBowlerIds: string[];
  /** Bowlers of the current over so far, in order (more than one after a mid-over replacement). */
  currentOverBowlerIds: string[];
  deliveries: DeliveryRecord[];
  fallOfWickets: FallOfWicket[];
  /** In order; the last one is the current pair while the innings is in progress. */
  partnerships: Partnership[];
  /** Over-by-over summary, in order. */
  overs: OverSummary[];
  /** Scorer corrections that swapped the batters' ends, with the legal-ball count at the time. */
  strikeSwaps: { eventIndex: number; legalBalls: number }[];
  retirements: RetirementRecord[];
  /** The batter whose retirement left the current vacancy: they may not fill it themselves (Law 25.4.2). */
  vacancyLeftBy: string | null;
  /** Players who may not bat in this Super Over: they were dismissed in an earlier one. */
  ineligibleBatterIds: string[];
  /** Players who may not bowl in this Super Over: they bowled in the previous one. */
  ineligibleBowlerIds: string[];
  /** The next delivery is a free hit. */
  freeHitNext: boolean;
  completed: boolean;
  endReason: InningsEndReason | null;
  /** Runs debited to the bowlers in the current over (for maidens). */
  currentOverBowlerRuns: number;
}

export type NextAction =
  | { type: 'selectOpeners'; inningsIndex: number }
  | { type: 'selectBatter' }
  | { type: 'selectBowler' }
  | { type: 'delivery' }
  | { type: 'matchComplete' };

/** `revisedTarget` is present (true) when the chase had a revised target (ReviseOversEvent). */
export type MatchResult =
  | { type: 'tie'; revisedTarget?: true }
  /** The match was abandoned before a result (see the 'abandon' event). */
  | { type: 'noResult' }
  | { type: 'winByRuns'; winnerTeamId: string; runs: number; revisedTarget?: true }
  | { type: 'winByWickets'; winnerTeamId: string; wickets: number; ballsRemaining: number; revisedTarget?: true }
  /** The match was tied and so was the latest Super Over (another one may be played). */
  | { type: 'superOverTie'; superOvers: number }
  /** The match was tied and a Super Over decided the winner. */
  | { type: 'superOverWin'; winnerTeamId: string; superOvers: number };

export interface MatchState {
  /**
   * The setup with each lineup as it is now, including players who joined during the match.
   * A copy: always replay events on the stored setup, never on this one.
   */
  setup: MatchSetup;
  innings: InningsState[];
  next: NextAction;
  result: MatchResult | null;
  /** Overs per innings the match was set up with (state.setup has the current, possibly fewer). */
  scheduledOvers: number;
  /** A target revised during the innings break, for the second innings when it starts. */
  revisedTarget: number | null;
}

export class ScoringError extends Error {
  /** Index of the offending event, when replaying a list. */
  readonly eventIndex: number | null;
  constructor(message: string, eventIndex: number | null = null) {
    super(message);
    this.name = 'ScoringError';
    this.eventIndex = eventIndex;
  }
}

// ---------------------------------------------------------------------------------------------
// Public API

/** Replays `events` from the start. Throws ScoringError if any event is invalid. */
export function computeMatchState(setup: MatchSetup, events: readonly MatchEvent[]): MatchState {
  const state = initialState(setup);
  events.forEach((event, i) => {
    const error = applyEvent(state, event, i);
    if (error) throw new ScoringError(error, i);
  });
  return state;
}

/** Checks whether `event` may come next. Never throws for an invalid event. */
export function tryAddEvent(
  setup: MatchSetup,
  events: readonly MatchEvent[],
  event: MatchEvent,
): { ok: true; state: MatchState } | { ok: false; error: string } {
  try {
    return { ok: true, state: computeMatchState(setup, [...events, event]) };
  } catch (e) {
    if (e instanceof ScoringError) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Replaces what was recorded for the delivery at `index` and replays the rest of the match.
 * Later deliveries keep their runs, extras and wickets, but their striker, non-striker and
 * bowler are taken from the corrected match, because an edit can change who is on strike.
 * Fails (and changes nothing) when a later action no longer fits, for example a new batter
 * chosen after a wicket that the edit removes.
 */
export function tryEditDelivery(
  setup: MatchSetup,
  events: readonly MatchEvent[],
  index: number,
  input: DeliveryInput,
): { ok: true; events: MatchEvent[]; state: MatchState } | { ok: false; error: string } {
  const original = events[index];
  if (!original || original.type !== 'delivery') return { ok: false, error: 'Only a delivery can be edited.' };
  let state: MatchState;
  try {
    state = initialState(setup);
  } catch (e) {
    if (e instanceof ScoringError) return { ok: false, error: e.message };
    throw e;
  }
  const edited: MatchEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    let event: MatchEvent = events[i];
    if (i === index) {
      event = {
        ...original,
        ballType: input.ballType,
        runsFrom: input.runsFrom,
        runs: input.runs,
        boundary: input.boundary,
        dismissal: input.dismissal,
      };
    }
    if (i >= index && event.type === 'delivery') {
      const inn = currentInnings(state);
      if (state.next.type === 'delivery' && inn) {
        event = { ...event, strikerId: inn.strikerId!, nonStrikerId: inn.nonStrikerId!, bowlerId: inn.bowlerId! };
      }
    }
    const error = applyEvent(state, event, i);
    if (error) {
      if (i <= index) return { ok: false, error };
      return {
        ok: false,
        error: `This change does not fit what was recorded after it (saved action ${i + 1}: ${error}) To change it, undo back to this ball and score again.`,
      };
    }
    edited.push(event);
  }
  return { ok: true, events: edited, state };
}

/** Undo = remove the latest event. Returns null when there is nothing to undo. */
export function eventsAfterUndo(events: readonly MatchEvent[]): MatchEvent[] | null {
  return events.length === 0 ? null : events.slice(0, -1);
}

export function currentInnings(state: MatchState): InningsState | null {
  return state.innings.length ? state.innings[state.innings.length - 1] : null;
}

/** Players who may be chosen as the next batter: those yet to bat, and retired-hurt batters. */
export function availableBatters(state: MatchState): string[] {
  const inn = currentInnings(state);
  if (!inn || state.next.type !== 'selectBatter') return [];
  return batterCandidates(inn);
}

/** Bowlers who may bowl the next over, with the reason others are not allowed. */
export function bowlerOptions(state: MatchState): { playerId: string; allowed: boolean; reason: string | null }[] {
  const inn = currentInnings(state);
  if (!inn || state.next.type !== 'selectBowler') return [];
  return inn.bowlingTeam.players.map((p) => {
    const reason = bowlerNotAllowedReason(state, inn, p.playerId);
    return { playerId: p.playerId, allowed: reason === null, reason };
  });
}

/** Who may take over the current over from the current bowler (see ReplaceBowlerEvent). */
export function replacementBowlerOptions(state: MatchState): { playerId: string; allowed: boolean; reason: string | null }[] {
  const inn = currentInnings(state);
  if (!inn || !canReplaceBowler(state)) return [];
  return inn.bowlingTeam.players.map((p) => {
    const reason = replacementNotAllowedReason(state, inn, p.playerId);
    return { playerId: p.playerId, allowed: reason === null, reason };
  });
}

/** True once a ball (legal or not) has been bowled in the current over. */
export function overInProgress(inn: InningsState): boolean {
  const last = inn.overs[inn.overs.length - 1];
  return !!last && !last.complete && last.over === Math.floor(inn.legalBalls / BALLS_PER_OVER);
}

/** Swapping is allowed whenever both batters are at the crease in an unfinished innings. */
export function canSwapBatters(state: MatchState): boolean {
  const inn = currentInnings(state);
  return (
    !!inn &&
    !inn.completed &&
    inn.strikerId !== null &&
    inn.nonStrikerId !== null &&
    (state.next.type === 'delivery' || state.next.type === 'selectBowler')
  );
}

/** A batter may retire between deliveries, while both batters are at the crease (Law 25.4). */
export function canRetire(state: MatchState): boolean {
  return canSwapBatters(state);
}

/** The bowler can be replaced while a delivery is expected (Law 17.8). */
export function canReplaceBowler(state: MatchState): boolean {
  const inn = currentInnings(state);
  return !!inn && !inn.completed && state.next.type === 'delivery' && inn.bowlerId !== null;
}

/**
 * The innings can be closed when a batter is needed and only retired-hurt batters are left, or
 * nobody is left in a lineup that is not full (the missing players never turned up).
 */
export function canEndInnings(state: MatchState): boolean {
  const inn = currentInnings(state);
  if (!inn || state.next.type !== 'selectBatter') return false;
  return batterCandidates(inn).every((id) => inn.batters.some((b) => b.playerId === id && b.retiredHurt));
}

/** Places still free in a lineup: the team size minus the players named so far. */
export function openSlots(team: TeamLineup): number {
  return Math.max(0, teamSize(team) - team.players.length);
}

/** A player can join a lineup that is not full, until the match is complete. */
export function canAddPlayer(state: MatchState, teamId: string): boolean {
  const team = state.setup.teams.find((t) => t.teamId === teamId);
  return !!team && state.next.type !== 'matchComplete' && openSlots(team) > 0;
}

/** A Super Over can start when the match (or the latest Super Over) has just ended level. */
export function canStartSuperOver(state: MatchState): boolean {
  const r = state.result;
  if (!r || (r.type !== 'tie' && r.type !== 'superOverTie')) return false;
  return state.innings.length % 2 === 0 && !state.innings.some((inn) => inn.endReason === 'abandoned');
}

/** The scorers can close the innings in progress at any point between deliveries. */
export function canCloseInnings(state: MatchState): boolean {
  const inn = currentInnings(state);
  return !!inn && !inn.completed && ['delivery', 'selectBatter', 'selectBowler'].includes(state.next.type);
}

/** What a ReviseOversEvent may change now, or null when the overs cannot be changed. */
export interface OversRevision {
  /** 0 = the first innings (the second gets the same overs), 1 = the second innings. */
  inningsIndex: 0 | 1;
  /** The second innings has not started yet (the innings break). */
  beforeStart: boolean;
  overs: number;
  /** Fewest overs allowed: the overs already started can no longer be taken away. */
  minOvers: number;
  /** Most overs allowed: the overs the match was set up with. */
  maxOvers: number;
  /** The second innings target as it is now (null in the first innings). */
  target: number | null;
  maxOversPerBowler: number | null;
}

export function oversRevision(state: MatchState): OversRevision | null {
  const inn = currentInnings(state);
  const base = { maxOvers: state.scheduledOvers, maxOversPerBowler: state.setup.rules.maxOversPerBowler };
  if (state.next.type === 'selectOpeners' && state.next.inningsIndex === 1) {
    const overs = state.setup.rules.oversPerInnings;
    return { ...base, inningsIndex: 1, beforeStart: true, overs, minOvers: 1, target: state.revisedTarget ?? inn!.runs + 1 };
  }
  if (!canCloseInnings(state) || !inn || inn.superOver !== null) return null;
  const started = Math.floor(inn.legalBalls / BALLS_PER_OVER) + (overInProgress(inn) ? 1 : 0);
  return {
    ...base,
    inningsIndex: inn.index === 0 ? 0 : 1,
    beforeStart: false,
    overs: inn.oversLimit,
    minOvers: Math.max(1, started),
    target: inn.target,
  };
}

/**
 * A revised target in proportion to the overs (the "average run rate" method): the first
 * innings runs scaled from the overs the first innings had to the overs the second innings has,
 * rounded down, plus one. Only a suggestion; DLS is not supported.
 */
export function suggestedTarget(state: MatchState, overs: number): number | null {
  const first = state.innings[0];
  if (!first?.completed) return null;
  return Math.floor((first.runs * overs) / first.oversLimit) + 1;
}

// ---------------------------------------------------------------------------------------------
// Event application (mutates `state`; returns an error message instead of applying if invalid)

function initialState(setup: MatchSetup): MatchState {
  const setupErrors = validateMatchSetup(setup);
  if (setupErrors.length > 0) throw new ScoringError(`Invalid match setup: ${setupErrors[0]}`);
  // Players who join during the match are added to these copies of the lineups, and revised
  // overs and bowling limits change the copy of the rules.
  const copy = (team: TeamLineup): TeamLineup => ({ ...team, players: [...team.players] });
  const working: MatchSetup = { ...setup, rules: { ...setup.rules }, teams: [copy(setup.teams[0]), copy(setup.teams[1])] };
  return {
    setup: working,
    innings: [],
    next: { type: 'selectOpeners', inningsIndex: 0 },
    result: null,
    scheduledOvers: setup.rules.oversPerInnings,
    revisedTarget: null,
  };
}

function applyEvent(state: MatchState, event: MatchEvent, eventIndex: number): string | null {
  switch (event.type) {
    case 'inningsStart':
      return applyInningsStart(state, event.strikerId, event.nonStrikerId, event.bowlerId);
    case 'newBatter':
      return applyNewBatter(state, event.playerId);
    case 'newBowler':
      return applyNewBowler(state, event.playerId);
    case 'delivery':
      return applyDelivery(state, event, eventIndex);
    case 'swapBatters':
      return applySwapBatters(state, eventIndex);
    case 'abandon':
      return applyAbandon(state);
    case 'retire':
      return applyRetire(state, event, eventIndex);
    case 'replaceBowler':
      return applyReplaceBowler(state, event.playerId);
    case 'endInnings':
      return applyEndInnings(state);
    case 'closeInnings':
      return applyCloseInnings(state);
    case 'reviseOvers':
      return applyReviseOvers(state, event);
    case 'superOver':
      return applySuperOver(state);
    case 'addPlayer':
      return applyAddPlayer(state, event);
    default:
      return 'Unknown event type.';
  }
}

function applyAddPlayer(state: MatchState, event: AddPlayerEvent): string | null {
  if (state.next.type === 'matchComplete') return 'The match is already complete.';
  const team = state.setup.teams.find((t) => t.teamId === event.teamId);
  if (!team) return 'A player can only join one of the two teams.';
  const name = typeof event.name === 'string' ? event.name.trim() : '';
  if (!event.playerId || !name) return 'Choose the player who joins the lineup.';
  const taken = state.setup.teams.find((t) =>
    [...t.players, ...(t.substitutes ?? [])].some((p) => p.playerId === event.playerId),
  );
  if (taken) return `${name} is already named for ${taken.name} in this match.`;
  if (openSlots(team) === 0) return `The ${team.name} lineup is full (${teamSize(team)} players).`;
  team.players.push({ playerId: event.playerId, name });
  return null; // the next action does not change: the new player is now one of the choices
}

function applySwapBatters(state: MatchState, eventIndex: number): string | null {
  if (state.next.type === 'selectBatter') return 'Choose the new batter before swapping the batters.';
  if (!canSwapBatters(state)) return 'The batters can only be swapped while an innings is in progress.';
  const inn = currentInnings(state)!;
  [inn.strikerId, inn.nonStrikerId] = [inn.nonStrikerId, inn.strikerId];
  inn.strikeSwaps.push({ eventIndex, legalBalls: inn.legalBalls });
  return null; // nothing else changes: no runs, no ball, the same next action
}

function applyAbandon(state: MatchState): string | null {
  if (state.result || state.next.type === 'matchComplete') return 'The match is already complete.';
  // Once both main innings are complete the match was tied, and a Super Over that cannot be
  // finished leaves it tied.
  const inSuperOver = state.innings.length >= 2 && state.innings[1].completed;
  const inn = currentInnings(state);
  if (inn && !inn.completed) {
    inn.completed = true;
    inn.endReason = 'abandoned';
    inn.freeHitNext = false;
  }
  state.result = inSuperOver ? { type: 'tie' } : { type: 'noResult' };
  state.next = { type: 'matchComplete' };
  return null;
}

function applySuperOver(state: MatchState): string | null {
  if (!canStartSuperOver(state)) {
    return 'A Super Over can only be played when the scores are level at the end of the match.';
  }
  state.result = null;
  state.next = { type: 'selectOpeners', inningsIndex: state.innings.length };
  return null;
}

function needMessage(next: NextAction): string {
  switch (next.type) {
    case 'selectOpeners':
      return 'Choose the opening batters and bowler first.';
    case 'selectBatter':
      return 'Choose the next batter first.';
    case 'selectBowler':
      return 'Choose the bowler for the next over first.';
    case 'delivery':
      return 'A delivery is expected next.';
    case 'matchComplete':
      return 'The match is already complete.';
  }
}

const inLineup = (team: TeamLineup, id: string) => team.players.some((p) => p.playerId === id);
const nameIn = (team: TeamLineup, id: string) =>
  team.players.find((p) => p.playerId === id)?.name ?? 'Unknown player';
const zeroExtras = (): Extras => ({ wides: 0, noBalls: 0, byes: 0, legByes: 0 });
export const extrasTotal = (e: Extras) => e.wides + e.noBalls + e.byes + e.legByes;
const last = <T>(list: readonly T[]): T | undefined => list[list.length - 1];

function newPartnership(number: number, firstId: string, secondId: string): Partnership {
  return { number, batterIds: [firstId, secondId], batterRuns: [0, 0], runs: 0, balls: 0, broken: false, retired: false };
}

function newBatter(team: TeamLineup, id: string): BatterStats {
  return { playerId: id, name: nameIn(team, id), runs: 0, ballsFaced: 0, fours: 0, sixes: 0, wicket: null, retiredHurt: false };
}

function ensureBowler(inn: InningsState, id: string): BowlerStats {
  let b = inn.bowlers.find((x) => x.playerId === id);
  if (!b) {
    b = {
      playerId: id,
      name: nameIn(inn.bowlingTeam, id),
      legalBalls: 0,
      runsConceded: 0,
      wickets: 0,
      maidens: 0,
      wideBalls: 0,
      noBallBalls: 0,
    };
    inn.bowlers.push(b);
  }
  return b;
}

/** Who may fill a vacancy at the crease (in lineup order). */
function batterCandidates(inn: InningsState): string[] {
  const atCrease = new Set([inn.strikerId, inn.nonStrikerId]);
  return inn.battingTeam.players
    .map((p) => p.playerId)
    .filter((id) => {
      if (atCrease.has(id) || id === inn.vacancyLeftBy || inn.ineligibleBatterIds.includes(id)) return false;
      const b = inn.batters.find((x) => x.playerId === id);
      return !b || b.retiredHurt;
    });
}

export interface UpcomingInnings {
  index: number;
  superOver: number | null;
  battingTeam: TeamLineup;
  bowlingTeam: TeamLineup;
  ineligibleBatterIds: string[];
  ineligibleBowlerIds: string[];
}

/**
 * The innings about to start (when openers are needed). Main match: the toss decides who bats.
 * Each Super Over is opened by the side that batted second in the match or previous Super Over.
 * ICC Super Over conditions: a player dismissed in any earlier Super Over may not bat, and a
 * bowler of the previous Super Over may not bowl.
 */
export function upcomingInnings(state: MatchState): UpcomingInnings | null {
  if (state.next.type !== 'selectOpeners') return null;
  const index = state.next.inningsIndex;
  const { setup } = state;
  let battingTeam: TeamLineup;
  let bowlingTeam: TeamLineup;
  if (index === 0) {
    const firstIdx = firstBattingTeamIndex(setup);
    [battingTeam, bowlingTeam] = [setup.teams[firstIdx], setup.teams[1 - firstIdx]];
  } else {
    const previous = state.innings[index - 1];
    [battingTeam, bowlingTeam] =
      index % 2 === 0 ? [previous.battingTeam, previous.bowlingTeam] : [previous.bowlingTeam, previous.battingTeam];
  }
  const superOver = index < 2 ? null : Math.floor(index / 2);
  const earlierSuperOvers = state.innings.filter((i) => i.superOver !== null);
  return {
    index,
    superOver,
    battingTeam,
    bowlingTeam,
    ineligibleBatterIds: earlierSuperOvers.flatMap((i) => i.batters.filter((b) => b.wicket).map((b) => b.playerId)),
    ineligibleBowlerIds:
      superOver !== null && superOver > 1
        ? earlierSuperOvers.filter((i) => i.superOver === superOver - 1).flatMap((i) => i.bowlers.map((b) => b.playerId))
        : [],
  };
}

function applyInningsStart(state: MatchState, strikerId: string, nonStrikerId: string, bowlerId: string): string | null {
  const upcoming = upcomingInnings(state);
  if (!upcoming) return needMessage(state.next);
  const { index, superOver, battingTeam, bowlingTeam, ineligibleBatterIds, ineligibleBowlerIds } = upcoming;

  if (!inLineup(battingTeam, strikerId) || !inLineup(battingTeam, nonStrikerId)) {
    return `Opening batters must be in the ${battingTeam.name} lineup.`;
  }
  if (strikerId === nonStrikerId) return 'Choose two different opening batters.';
  for (const id of [strikerId, nonStrikerId]) {
    if (ineligibleBatterIds.includes(id)) return `${nameIn(battingTeam, id)} was dismissed in an earlier Super Over and cannot bat.`;
  }
  if (!inLineup(bowlingTeam, bowlerId)) return `The bowler must be in the ${bowlingTeam.name} lineup.`;
  if (ineligibleBowlerIds.includes(bowlerId)) {
    return `${nameIn(bowlingTeam, bowlerId)} bowled in the previous Super Over and cannot bowl in this one.`;
  }

  const inn: InningsState = {
    index,
    superOver,
    battingTeam,
    bowlingTeam,
    oversLimit: superOver === null ? state.setup.rules.oversPerInnings : SUPER_OVER_OVERS,
    plannedOvers: superOver === null ? state.scheduledOvers : SUPER_OVER_OVERS,
    wicketsLimit: superOver === null ? teamSize(battingTeam) - 1 : Math.min(SUPER_OVER_WICKETS, teamSize(battingTeam) - 1),
    target: index === 1 && state.revisedTarget !== null ? state.revisedTarget : index % 2 === 1 ? state.innings[index - 1].runs + 1 : null,
    targetRevised: index === 1 && state.revisedTarget !== null,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: zeroExtras(),
    batters: [newBatter(battingTeam, strikerId), newBatter(battingTeam, nonStrikerId)],
    bowlers: [],
    strikerId,
    nonStrikerId,
    bowlerId,
    previousOverBowlerIds: [],
    currentOverBowlerIds: [bowlerId],
    deliveries: [],
    fallOfWickets: [],
    partnerships: [newPartnership(1, strikerId, nonStrikerId)],
    overs: [],
    strikeSwaps: [],
    retirements: [],
    vacancyLeftBy: null,
    ineligibleBatterIds,
    ineligibleBowlerIds,
    freeHitNext: false,
    completed: false,
    endReason: null,
    currentOverBowlerRuns: 0,
  };
  ensureBowler(inn, bowlerId);
  state.innings.push(inn);
  state.next = { type: 'delivery' };
  return null;
}

function applyNewBatter(state: MatchState, playerId: string): string | null {
  if (state.next.type !== 'selectBatter') return needMessage(state.next);
  const inn = currentInnings(state)!;
  const name = nameIn(inn.battingTeam, playerId);
  if (!inLineup(inn.battingTeam, playerId)) return `The batter must be in the ${inn.battingTeam.name} lineup.`;
  if (inn.ineligibleBatterIds.includes(playerId)) return `${name} was dismissed in an earlier Super Over and cannot bat.`;
  if (playerId === inn.vacancyLeftBy) {
    return `${name} has just retired, so cannot take their own place. They can resume when another batter is needed (Law 25.4.2).`;
  }
  const returning = inn.batters.find((b) => b.playerId === playerId);
  if (returning && !returning.retiredHurt) return `${name} has already batted.`;

  // The batter who stayed in forms a new partnership with the new batter.
  const survivorId = inn.strikerId ?? inn.nonStrikerId!;
  inn.partnerships.push(newPartnership(inn.wickets + 1, survivorId, playerId));
  if (returning) returning.retiredHurt = false; // resumes their innings (Law 25.4.2)
  else inn.batters.push(newBatter(inn.battingTeam, playerId));
  if (inn.strikerId === null) inn.strikerId = playerId;
  else inn.nonStrikerId = playerId;
  inn.vacancyLeftBy = null;
  state.next = nextWithinInnings(inn);
  return null;
}

/** Whole overs a bowler may still bowl under the competition limit, after `extraBalls` more. */
function wholeOversLeft(inn: InningsState, playerId: string, max: number, extraBalls: number): number {
  const balls = inn.bowlers.find((x) => x.playerId === playerId)?.legalBalls ?? 0;
  return Math.max(0, Math.floor((max * BALLS_PER_OVER - balls - extraBalls) / BALLS_PER_OVER));
}

/**
 * Could the remaining overs of the innings still be bowled under the competition limit if
 * `playerId` bowls `balls` more now, with `blockedIds` unable to bowl the next over?
 */
function canFinishInnings(state: MatchState, inn: InningsState, playerId: string, balls: number, blockedIds: string[]): boolean {
  const max = state.setup.rules.maxOversPerBowler;
  if (max === null) return true;
  const remainingAfter = inn.oversLimit - Math.floor(inn.legalBalls / BALLS_PER_OVER) - 1;
  const left = new Map<string, number>();
  for (const p of inn.bowlingTeam.players) {
    left.set(p.playerId, wholeOversLeft(inn, p.playerId, max, p.playerId === playerId ? balls : 0));
  }
  // Players still to join the lineup can bowl too, each with the full allowance.
  for (let i = 0; i < openSlots(inn.bowlingTeam); i++) left.set(`\u0000open-${i}`, max);
  return canBowlRemainingOvers(remainingAfter, left, blockedIds);
}

function bowlerNotAllowedReason(state: MatchState, inn: InningsState, playerId: string): string | null {
  const name = nameIn(inn.bowlingTeam, playerId);
  if (!inLineup(inn.bowlingTeam, playerId)) return `The bowler must be in the ${inn.bowlingTeam.name} lineup.`;
  if (inn.ineligibleBowlerIds.includes(playerId)) return `${name} bowled in the previous Super Over.`;
  if (inn.previousOverBowlerIds.includes(playerId)) {
    const what = inn.previousOverBowlerIds.length > 1 ? 'bowled part of the previous over' : 'bowled the previous over';
    return `${name} ${what}. A bowler cannot bowl consecutive overs (Law 17.6).`;
  }
  const max = state.setup.rules.maxOversPerBowler;
  if (max !== null) {
    if (wholeOversLeft(inn, playerId, max, 0) < 1) {
      const balls = inn.bowlers.find((x) => x.playerId === playerId)?.legalBalls ?? 0;
      return balls >= max * BALLS_PER_OVER
        ? `${name} has bowled the maximum ${max} overs.`
        : `${name} cannot bowl another full over without going over the maximum of ${max} overs.`;
    }
    if (!canFinishInnings(state, inn, playerId, BALLS_PER_OVER, [playerId])) {
      return `Choosing ${name} would leave too few eligible bowlers to finish the innings under the ${max}-over limit.`;
    }
  }
  return null;
}

function replacementNotAllowedReason(state: MatchState, inn: InningsState, playerId: string): string | null {
  // Before the first ball of the over this only corrects the choice of bowler.
  if (!overInProgress(inn)) {
    if (playerId === inn.bowlerId) return `${nameIn(inn.bowlingTeam, playerId)} is already bowling.`;
    return bowlerNotAllowedReason(state, inn, playerId);
  }
  const name = nameIn(inn.bowlingTeam, playerId);
  if (!inLineup(inn.bowlingTeam, playerId)) return `The bowler must be in the ${inn.bowlingTeam.name} lineup.`;
  if (playerId === inn.bowlerId) return `${name} is already bowling.`;
  if (inn.currentOverBowlerIds.includes(playerId)) return `${name} has already bowled part of this over.`;
  if (inn.ineligibleBowlerIds.includes(playerId)) return `${name} bowled in the previous Super Over.`;
  if (inn.previousOverBowlerIds.includes(playerId)) {
    return `${name} bowled in the previous over, so cannot bowl part of this one (Law 17.6).`;
  }
  const max = state.setup.rules.maxOversPerBowler;
  if (max !== null) {
    const ballsLeftInOver = BALLS_PER_OVER - (inn.legalBalls % BALLS_PER_OVER);
    const balls = inn.bowlers.find((x) => x.playerId === playerId)?.legalBalls ?? 0;
    if (balls + ballsLeftInOver > max * BALLS_PER_OVER) {
      return `${name} cannot finish this over without going over the maximum of ${max} overs.`;
    }
    if (!canFinishInnings(state, inn, playerId, ballsLeftInOver, [...inn.currentOverBowlerIds, playerId])) {
      return `Choosing ${name} would leave too few eligible bowlers to finish the innings under the ${max}-over limit.`;
    }
  }
  return null;
}

function applyNewBowler(state: MatchState, playerId: string): string | null {
  if (state.next.type !== 'selectBowler') return needMessage(state.next);
  const inn = currentInnings(state)!;
  const reason = bowlerNotAllowedReason(state, inn, playerId);
  if (reason) return reason;
  inn.bowlerId = playerId;
  inn.currentOverBowlerIds = [playerId];
  inn.currentOverBowlerRuns = 0;
  ensureBowler(inn, playerId);
  state.next = nextWithinInnings(inn);
  return null;
}

function applyReplaceBowler(state: MatchState, playerId: string): string | null {
  if (!canReplaceBowler(state)) {
    return state.next.type === 'selectBowler' ? 'Choose the bowler for the next over instead.' : needMessage(state.next);
  }
  const inn = currentInnings(state)!;
  const reason = replacementNotAllowedReason(state, inn, playerId);
  if (reason) return reason;
  if (overInProgress(inn)) {
    inn.currentOverBowlerIds.push(playerId);
  } else {
    // A correction before the first ball: forget the bowler who never bowled.
    const previous = inn.bowlers.find((b) => b.playerId === inn.bowlerId);
    if (previous && previous.legalBalls + previous.wideBalls + previous.noBallBalls === 0) {
      inn.bowlers.splice(inn.bowlers.indexOf(previous), 1);
    }
    inn.currentOverBowlerIds = [playerId];
  }
  inn.bowlerId = playerId;
  ensureBowler(inn, playerId);
  return null;
}

function applyRetire(state: MatchState, event: RetireEvent, eventIndex: number): string | null {
  if (state.next.type === 'selectBatter') return 'Choose the new batter before another batter retires.';
  if (!canRetire(state)) return 'A batter can only retire between deliveries while an innings is in progress.';
  const inn = currentInnings(state)!;
  const { playerId, retirement } = event;
  if (playerId !== inn.strikerId && playerId !== inn.nonStrikerId) return 'Only a batter at the crease can retire.';
  if (retirement !== 'hurt' && retirement !== 'out') return 'Choose retired hurt or retired out.';

  const batter = inn.batters.find((b) => b.playerId === playerId)!;
  const partnership = last(inn.partnerships)!;
  if (retirement === 'out') {
    // Law 25.4.3: retired out is a dismissal, not credited to the bowler.
    const wicket: WicketRecord = { kind: 'retiredOut', playerOutId: playerId, fielderId: null, bowlerId: null, creditedToBowler: false };
    inn.wickets += 1;
    batter.wicket = wicket;
    inn.fallOfWickets.push({ wicketNumber: inn.wickets, teamRuns: inn.runs, legalBalls: inn.legalBalls, playerOutId: playerId });
    partnership.broken = true;
    const over = last(inn.overs);
    if (over && !over.complete) {
      over.wickets += 1;
      over.totalWickets = inn.wickets;
    }
  } else {
    batter.retiredHurt = true;
    partnership.retired = true;
  }
  inn.retirements.push({ eventIndex, playerId, retirement, teamRuns: inn.runs, wickets: inn.wickets, legalBalls: inn.legalBalls });
  // The new batter takes the retired batter's place, on strike if they were (Law 25.4).
  if (inn.strikerId === playerId) inn.strikerId = null;
  else inn.nonStrikerId = null;
  inn.vacancyLeftBy = playerId;

  if (inn.wickets >= inn.wicketsLimit || noOneLeftToBat(inn)) finishInnings(state, inn, 'allOut');
  else state.next = nextWithinInnings(inn);
  return null;
}

/**
 * Nobody may fill the vacancy and no one else can join the lineup (it is full). With places
 * still free, the scorer adds the next batter instead (or ends the innings, see canEndInnings).
 */
function noOneLeftToBat(inn: InningsState): boolean {
  return batterCandidates(inn).length === 0 && openSlots(inn.battingTeam) === 0;
}

function applyEndInnings(state: MatchState): string | null {
  if (!canEndInnings(state)) {
    return state.next.type === 'selectBatter'
      ? 'There are still batters who have not batted. Choose the next batter.'
      : 'The innings can only be ended this way when a new batter is needed.';
  }
  finishInnings(state, currentInnings(state)!, 'allOut');
  return null;
}

function applyCloseInnings(state: MatchState): string | null {
  if (!canCloseInnings(state)) return 'There is no innings in progress to end.';
  finishInnings(state, currentInnings(state)!, 'closed');
  return null;
}

function applyReviseOvers(state: MatchState, event: ReviseOversEvent): string | null {
  const revision = oversRevision(state);
  if (!revision) {
    const inn = currentInnings(state);
    if (state.next.type !== 'matchComplete' && inn && inn.superOver !== null && !inn.completed) {
      return 'The overs of a Super Over cannot be changed.';
    }
    return state.next.type === 'matchComplete'
      ? 'The match is already complete.'
      : 'The overs can only be changed during an innings of the match, or in the innings break.';
  }
  const { overs, target, maxOversPerBowler } = event;
  if (!Number.isInteger(overs) || overs < revision.minOvers || overs > revision.maxOvers) {
    if (revision.minOvers === revision.maxOvers) return `All ${revision.maxOvers} overs have already been started.`;
    const started = revision.minOvers > 1 ? ` (${revision.minOvers} have already been started)` : '';
    return `Choose from ${revision.minOvers} to ${revision.maxOvers} overs${started}.`;
  }
  if (revision.inningsIndex === 0 && target !== null) return 'A revised target is only set for the second innings.';
  if (revision.inningsIndex === 1 && (!Number.isInteger(target) || target! < 1)) {
    return 'Enter the target for the second innings: a whole number of runs, at least 1.';
  }
  if (maxOversPerBowler !== null && (!Number.isInteger(maxOversPerBowler) || maxOversPerBowler < 1)) {
    return 'The maximum overs per bowler must be a positive whole number, or no limit.';
  }
  if (overs === revision.overs && target === revision.target && maxOversPerBowler === revision.maxOversPerBowler) {
    return 'Nothing would change.';
  }

  const rules = state.setup.rules;
  const inn = revision.beforeStart ? null : currentInnings(state)!;
  const before = {
    oversPerInnings: rules.oversPerInnings,
    maxOversPerBowler: rules.maxOversPerBowler,
    revisedTarget: state.revisedTarget,
    oversLimit: inn?.oversLimit,
    target: inn?.target ?? null,
    targetRevised: inn?.targetRevised ?? false,
  };
  // A target is "revised" when it differs from the first innings runs + 1.
  const naturalTarget = state.innings[0].runs + 1;
  rules.maxOversPerBowler = maxOversPerBowler;
  if (inn) {
    inn.oversLimit = overs;
    if (revision.inningsIndex === 0) rules.oversPerInnings = overs; // the second innings gets the same
    else {
      inn.target = target;
      inn.targetRevised = target !== naturalTarget;
    }
  } else {
    rules.oversPerInnings = overs;
    state.revisedTarget = target !== naturalTarget ? target : null;
  }

  // The innings ends at once if the revised target is already reached or its new overs have all
  // been bowled. Otherwise the bowling limit must still let the unfinished innings be completed.
  let endsNow: InningsEndReason | null = null;
  if (inn && inn.target !== null && inn.runs >= inn.target) endsNow = 'targetReached';
  else if (inn && inn.legalBalls >= overs * BALLS_PER_OVER) endsNow = 'overs';
  const problem =
    (inn && !endsNow ? bowlingLimitProblem(state, inn) : null) ??
    (revision.inningsIndex === 0 || revision.beforeStart ? fullInningsProblem(state, state.innings[0].battingTeam) : null);
  if (problem) {
    Object.assign(rules, { oversPerInnings: before.oversPerInnings, maxOversPerBowler: before.maxOversPerBowler });
    state.revisedTarget = before.revisedTarget;
    if (inn) Object.assign(inn, { oversLimit: before.oversLimit, target: before.target, targetRevised: before.targetRevised });
    return problem;
  }
  if (inn && endsNow) finishInnings(state, inn, endsNow);
  return null;
}

const tooFewBowlers = (max: number) =>
  `With at most ${max} ${max === 1 ? 'over' : 'overs'} each, there are not enough bowlers left to bowl the remaining overs without someone bowling two in a row.`;

/** Can the rest of `inn` still be bowled under the bowling limit? A reason if not. */
function bowlingLimitProblem(state: MatchState, inn: InningsState): string | null {
  const max = state.setup.rules.maxOversPerBowler;
  if (max === null) return null;
  if (inn.bowlerId !== null) {
    // The bowler of the current over bowls the rest of it (all of it, if it has not started).
    const ballsLeftInOver = BALLS_PER_OVER - (inn.legalBalls % BALLS_PER_OVER);
    const balls = inn.bowlers.find((b) => b.playerId === inn.bowlerId)?.legalBalls ?? 0;
    if (balls + ballsLeftInOver > max * BALLS_PER_OVER) {
      return `${nameIn(inn.bowlingTeam, inn.bowlerId)} is bowling this over and would bowl more than ${max} ${max === 1 ? 'over' : 'overs'}. Change the bowler first, or choose a higher limit.`;
    }
    return canFinishInnings(state, inn, inn.bowlerId, ballsLeftInOver, inn.currentOverBowlerIds) ? null : tooFewBowlers(max);
  }
  const remaining = inn.oversLimit - Math.floor(inn.legalBalls / BALLS_PER_OVER);
  const left = new Map<string, number>();
  for (const p of inn.bowlingTeam.players) left.set(p.playerId, wholeOversLeft(inn, p.playerId, max, 0));
  for (let i = 0; i < openSlots(inn.bowlingTeam); i++) left.set(`\u0000open-${i}`, max);
  return canBowlRemainingOvers(remaining, left, inn.previousOverBowlerIds) ? null : tooFewBowlers(max);
}

/** Can `bowlingTeam` bowl a whole second innings under the current rules? A reason if not. */
function fullInningsProblem(state: MatchState, bowlingTeam: TeamLineup): string | null {
  const { maxOversPerBowler: max, oversPerInnings } = state.setup.rules;
  if (max === null) return null;
  const allowance = new Map<string, number>();
  for (let i = 0; i < teamSize(bowlingTeam); i++) allowance.set(String(i), max);
  return canBowlRemainingOvers(oversPerInnings, allowance, null)
    ? null
    : `With ${teamSize(bowlingTeam)} players (${bowlingTeam.name}) and at most ${max} overs each, ${oversPerInnings} overs cannot be bowled without someone bowling two in a row.`;
}

function nextWithinInnings(inn: InningsState): NextAction {
  if (inn.strikerId === null || inn.nonStrikerId === null) return { type: 'selectBatter' };
  if (inn.bowlerId === null) return { type: 'selectBowler' };
  return { type: 'delivery' };
}

const STRIKER_DISMISSALS: DismissalKind[] = ['bowled', 'caught', 'lbw', 'stumped', 'hitWicket'];

/** Shape and Law checks for a delivery, independent of the score. */
export function deliveryShapeError(
  d: DeliveryEvent,
  ctx: { isFreeHit: boolean; bowlingTeam: TeamLineup; strikerId: string; nonStrikerId: string; bowlerId: string },
): string | null {
  if (d.ballType !== 'fair' && d.ballType !== 'wide' && d.ballType !== 'noBall') return 'Unknown ball type.';
  if (!Number.isInteger(d.runs) || d.runs < 0 || d.runs > MAX_RUNS_PER_DELIVERY) {
    return `Runs completed must be a whole number from 0 to ${MAX_RUNS_PER_DELIVERY}.`;
  }
  if (!['none', 'four', 'six', 'overthrowFour'].includes(d.boundary)) return 'Unknown boundary type.';

  if (d.ballType === 'wide') {
    if (d.runsFrom !== null) return 'All runs from a wide are scored as wides (Law 22.7); do not choose bat, byes or leg byes.';
  } else if (d.runsFrom !== 'bat' && d.runsFrom !== 'byes' && d.runsFrom !== 'legByes') {
    return 'Choose whether the runs came off the bat, as byes, or as leg byes.';
  }

  if ((d.boundary === 'four' || d.boundary === 'six') && d.runs !== 0) {
    return 'For a boundary, enter the boundary only. Runs completed before an ordinary boundary are not added (Law 19.7). For an overthrow to the boundary, use "overthrow 4".';
  }
  if (d.boundary === 'six' && d.runsFrom !== 'bat') {
    return 'A six can only be scored from a ball struck by the bat (Law 19.7.1).';
  }
  const nonPenaltyRuns = d.runs + (d.boundary === 'none' ? 0 : d.boundary === 'six' ? 6 : 4);
  if ((d.runsFrom === 'byes' || d.runsFrom === 'legByes') && nonPenaltyRuns === 0) {
    return 'Byes or leg byes need at least one run. For no runs, record it as off the bat.';
  }

  const w = d.dismissal;
  if (!w) return null;

  if (ctx.isFreeHit && w.kind !== 'runOut') {
    return 'On a free hit the striker can only be dismissed in ways allowed from a no-ball. This app supports run out only.';
  }
  if (STRIKER_DISMISSALS.includes(w.kind)) {
    if (d.runs !== 0 || d.boundary !== 'none') {
      return 'No runs other than penalties are scored when the striker is bowled, caught, LBW, stumped or hit wicket (Law 18.8).';
    }
    if (d.runsFrom === 'byes' || d.runsFrom === 'legByes') return 'This dismissal cannot have byes or leg byes.';
  }
  switch (w.kind) {
    case 'bowled':
    case 'caught':
    case 'lbw':
      if (d.ballType !== 'fair') {
        return d.ballType === 'wide'
          ? 'Off a wide, only hit wicket, stumped and run out are possible (Law 22.9).'
          : 'Off a no-ball, of the supported dismissals only run out is possible (Law 21.17).';
      }
      break;
    case 'stumped':
    case 'hitWicket':
      if (d.ballType === 'noBall') return 'Off a no-ball, of the supported dismissals only run out is possible (Law 21.17).';
      break;
    case 'runOut':
      if (d.boundary !== 'none') return 'The ball is dead once a boundary is scored, so a run out cannot happen on it.';
      if (w.playerOutId !== ctx.strikerId && w.playerOutId !== ctx.nonStrikerId) {
        return 'The run-out batter must be one of the two batters at the crease.';
      }
      if (w.end !== 'striker' && w.end !== 'nonStriker') return 'Choose the end where the wicket was broken.';
      break;
    default:
      return 'Unsupported dismissal.';
  }
  if (w.kind === 'caught' || w.kind === 'stumped' || w.kind === 'runOut') {
    const fielderId = w.fielderId;
    if (fielderId !== null) {
      if (!inLineup(ctx.bowlingTeam, fielderId)) return 'The fielder must be in the fielding team lineup.';
      if (w.kind === 'stumped' && fielderId === ctx.bowlerId) {
        return 'The bowler cannot be the wicket-keeper who made the stumping.';
      }
    } else if (w.kind !== 'runOut') {
      return w.kind === 'caught' ? 'Choose who took the catch.' : 'Choose the wicket-keeper.';
    }
  }
  return null;
}

function applyDelivery(state: MatchState, d: DeliveryEvent, eventIndex: number): string | null {
  if (state.next.type !== 'delivery') return needMessage(state.next);
  const inn = currentInnings(state)!;
  const strikerId = inn.strikerId!;
  const nonStrikerId = inn.nonStrikerId!;
  const bowlerId = inn.bowlerId!;
  if (d.strikerId !== strikerId || d.nonStrikerId !== nonStrikerId || d.bowlerId !== bowlerId) {
    return 'The batters or bowler on this delivery do not match the current match state.';
  }

  const isFreeHit = inn.freeHitNext;
  const shape = deliveryShapeError(d, { isFreeHit, bowlingTeam: inn.bowlingTeam, strikerId, nonStrikerId, bowlerId });
  if (shape) return shape;

  // --- Runs (Laws 18.10, 21.15, 22.7, 23) ---
  const allowance = d.boundary === 'six' ? 6 : d.boundary === 'none' ? 0 : 4;
  const nonPenaltyRuns = d.runs + allowance;
  const penalty = d.ballType === 'fair' ? 0 : 1;
  const extras = zeroExtras();
  let batterRuns = 0;
  if (d.ballType === 'wide') {
    extras.wides = penalty + nonPenaltyRuns;
  } else {
    extras.noBalls = penalty;
    if (d.runsFrom === 'bat') batterRuns = nonPenaltyRuns;
    else if (d.runsFrom === 'byes') extras.byes = nonPenaltyRuns;
    else extras.legByes = nonPenaltyRuns;
  }
  const totalRuns = batterRuns + extrasTotal(extras);
  const bowlerRuns = batterRuns + extras.wides + extras.noBalls;

  // --- The match ends the instant the target is reached (Law 16.6) ---
  if (inn.target !== null) {
    const needed = inn.target - inn.runs;
    if (penalty >= needed && (nonPenaltyRuns > 0 || d.dismissal)) {
      return 'The one-run penalty already wins the match, so no further runs or dismissal can count on this delivery (Laws 16.6, 39.4).';
    }
    if (d.boundary === 'none' && penalty + d.runs > needed) {
      return `Only ${needed - penalty} more run(s) are needed. The match ends as soon as the winning run is completed (Law 16.6).`;
    }
    if (d.boundary === 'overthrowFour' && penalty + d.runs >= needed) {
      return 'The winning run was completed before the overthrow, so the overthrow cannot count (Law 16.6).';
    }
    if (d.dismissal?.kind === 'runOut' && penalty + d.runs >= needed) {
      return 'The winning run was completed before the run out, so the match had already ended (Law 16.6).';
    }
  }

  // --- Ball counting (Law 17.3) ---
  const isLegalBall = d.ballType === 'fair';
  const isBallFaced = d.ballType !== 'wide';
  const over = Math.floor(inn.legalBalls / BALLS_PER_OVER);

  // --- Apply runs to batter, bowler, team ---
  const striker = inn.batters.find((b) => b.playerId === strikerId)!;
  const bowler = ensureBowler(inn, bowlerId);
  const isFour = d.boundary === 'four' && d.runsFrom === 'bat';
  const isSix = d.boundary === 'six';
  striker.runs += batterRuns;
  if (isBallFaced) striker.ballsFaced += 1;
  if (isFour) striker.fours += 1;
  if (isSix) striker.sixes += 1;

  bowler.runsConceded += bowlerRuns;
  if (isLegalBall) bowler.legalBalls += 1;
  if (d.ballType === 'wide') bowler.wideBalls += 1;
  if (d.ballType === 'noBall') bowler.noBallBalls += 1;

  inn.runs += totalRuns;
  inn.extras.wides += extras.wides;
  inn.extras.noBalls += extras.noBalls;
  inn.extras.byes += extras.byes;
  inn.extras.legByes += extras.legByes;
  if (isLegalBall) inn.legalBalls += 1;
  inn.currentOverBowlerRuns += bowlerRuns;

  // The current pair is always the last partnership: a delivery needs both batters present.
  const partnership = last(inn.partnerships)!;
  partnership.runs += totalRuns;
  if (isBallFaced) partnership.balls += 1;
  partnership.batterRuns[partnership.batterIds[0] === strikerId ? 0 : 1] += batterRuns;

  // --- Wicket and batters' ends ---
  let atStrikerEnd: string | null = strikerId;
  let atNonStrikerEnd: string | null = nonStrikerId;
  let wicket: WicketRecord | null = null;
  const w = d.dismissal;
  if (w) {
    const playerOutId = w.kind === 'runOut' ? w.playerOutId : strikerId;
    const creditedToBowler = w.kind !== 'runOut';
    wicket = {
      kind: w.kind,
      playerOutId,
      fielderId: w.kind === 'caught' || w.kind === 'stumped' || w.kind === 'runOut' ? w.fielderId : null,
      bowlerId,
      creditedToBowler,
    };
    if (w.kind === 'runOut') {
      // Law 38.4: the batter whose ground is at the broken wicket is out; the other batter
      // finishes at the other end. The new batter comes in at the end where the wicket fell.
      const survivor = playerOutId === strikerId ? nonStrikerId : strikerId;
      if (w.end === 'striker') {
        atStrikerEnd = null;
        atNonStrikerEnd = survivor;
      } else {
        atNonStrikerEnd = null;
        atStrikerEnd = survivor;
      }
    } else {
      // Law 18.11.1: the not-out batter returns to their original end.
      atStrikerEnd = null;
    }
    inn.wickets += 1;
    inn.batters.find((b) => b.playerId === playerOutId)!.wicket = wicket;
    if (creditedToBowler) bowler.wickets += 1;
    inn.fallOfWickets.push({ wicketNumber: inn.wickets, teamRuns: inn.runs, legalBalls: inn.legalBalls, playerOutId });
    partnership.broken = true;
  } else if (d.runs % 2 === 1) {
    // Odd number of runs completed: the batters have changed ends. Ordinary boundaries have
    // d.runs === 0, so the batters stay at their original ends (Law 18.11.2).
    [atStrikerEnd, atNonStrikerEnd] = [atNonStrikerEnd, atStrikerEnd];
  }

  // --- Over-by-over summary ---
  let overSummary = last(inn.overs);
  if (!overSummary || overSummary.over !== over) {
    overSummary = { over, bowlerIds: [bowlerId], runs: 0, wickets: 0, legalBalls: 0, totalRuns: 0, totalWickets: 0, complete: false };
    inn.overs.push(overSummary);
  } else if (!overSummary.bowlerIds.includes(bowlerId)) {
    overSummary.bowlerIds.push(bowlerId);
  }
  overSummary.runs += totalRuns;
  if (wicket) overSummary.wickets += 1;
  if (isLegalBall) overSummary.legalBalls += 1;
  overSummary.totalRuns = inn.runs;
  overSummary.totalWickets = inn.wickets;
  overSummary.complete = overSummary.legalBalls === BALLS_PER_OVER;

  // --- Free hit (ICC playing condition, optional) ---
  inn.freeHitNext =
    state.setup.rules.freeHitAfterNoBall &&
    (d.ballType === 'noBall' || (isFreeHit && d.ballType === 'wide'));

  // --- End of over: the next over is bowled from the other end (Law 17.1) ---
  const overComplete = isLegalBall && inn.legalBalls % BALLS_PER_OVER === 0;
  if (overComplete) {
    // An over shared by two bowlers (Law 17.8) is not a maiden for either of them.
    if (inn.currentOverBowlerRuns === 0 && inn.currentOverBowlerIds.length === 1) bowler.maidens += 1;
    inn.currentOverBowlerRuns = 0;
    inn.previousOverBowlerIds = inn.currentOverBowlerIds;
    inn.currentOverBowlerIds = [];
    inn.bowlerId = null;
    [atStrikerEnd, atNonStrikerEnd] = [atNonStrikerEnd, atStrikerEnd];
  }
  inn.strikerId = atStrikerEnd;
  inn.nonStrikerId = atNonStrikerEnd;

  inn.deliveries.push({
    eventIndex,
    inningsIndex: inn.index,
    over,
    legalBallInOver: inn.legalBalls - over * BALLS_PER_OVER,
    event: d,
    strikerId,
    nonStrikerId,
    bowlerId,
    batterRuns,
    extras,
    totalRuns,
    bowlerRuns,
    isLegalBall,
    isBallFaced,
    isFreeHit,
    isFour,
    isSix,
    wicket,
  });

  // --- End of innings / match ---
  let endReason: InningsEndReason | null = null;
  if (inn.target !== null && inn.runs >= inn.target) endReason = 'targetReached';
  else if (inn.wickets >= inn.wicketsLimit) endReason = 'allOut';
  else if (wicket && noOneLeftToBat(inn)) endReason = 'allOut';
  else if (inn.legalBalls >= inn.oversLimit * BALLS_PER_OVER) endReason = 'overs';

  if (endReason) finishInnings(state, inn, endReason);
  else state.next = nextWithinInnings(inn);
  return null;
}

function finishInnings(state: MatchState, inn: InningsState, endReason: InningsEndReason) {
  inn.completed = true;
  inn.endReason = endReason;
  inn.freeHitNext = false;
  if (inn.index % 2 === 0) {
    state.next = { type: 'selectOpeners', inningsIndex: inn.index + 1 };
  } else {
    state.result = decideResult(state, inn);
    state.next = { type: 'matchComplete' };
  }
}

/** Law 16.2 (win) and 16.5.1 (tie) for a one-innings-per-side match; then any Super Over. */
function decideResult(state: MatchState, second: InningsState): MatchResult {
  const first = state.innings[second.index - 1];
  if (second.superOver !== null) {
    if (second.runs === first.runs) return { type: 'superOverTie', superOvers: second.superOver };
    const winner = second.runs > first.runs ? second.battingTeam : first.battingTeam;
    return { type: 'superOverWin', winnerTeamId: winner.teamId, superOvers: second.superOver };
  }
  // Measured against the target, which is the first innings runs + 1 unless it was revised.
  const target = second.target!;
  const revised = second.targetRevised ? { revisedTarget: true as const } : {};
  if (second.runs >= target) {
    return {
      type: 'winByWickets',
      winnerTeamId: second.battingTeam.teamId,
      wickets: second.wicketsLimit - second.wickets,
      ballsRemaining: second.oversLimit * BALLS_PER_OVER - second.legalBalls,
      ...revised,
    };
  }
  if (second.runs === target - 1) return { type: 'tie', ...revised };
  return { type: 'winByRuns', winnerTeamId: first.battingTeam.teamId, runs: target - 1 - second.runs, ...revised };
}
