// The scoring engine. Pure functions: (setup, events) -> match state.
//
// Every screen, scorecard and result is derived from `computeMatchState`, so there is exactly
// one implementation of the cricket rules. Rules and Law references: docs/SCORING_RULES.md.

import {
  BALLS_PER_OVER,
  MAX_RUNS_PER_DELIVERY,
  type DeliveryEvent,
  type DismissalKind,
  type MatchEvent,
  type MatchSetup,
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

export interface WicketRecord {
  kind: DismissalKind;
  playerOutId: string;
  fielderId: string | null;
  /** The bowler of the delivery (recorded for every wicket). */
  bowlerId: string;
  /** Bowled, caught, LBW, stumped and hit wicket are credited to the bowler; run out is not (Law 38.6). */
  creditedToBowler: boolean;
}

/** Everything derived from one delivery. */
export interface DeliveryRecord {
  eventIndex: number;
  inningsIndex: 0 | 1;
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

export type InningsEndReason = 'overs' | 'allOut' | 'targetReached';

export interface InningsState {
  index: 0 | 1;
  battingTeam: TeamLineup;
  bowlingTeam: TeamLineup;
  /** Runs needed to win (second innings only). */
  target: number | null;
  runs: number;
  wickets: number;
  legalBalls: number;
  extras: Extras;
  /** In batting order (order of arrival at the crease). */
  batters: BatterStats[];
  /** In order of first bowling. */
  bowlers: BowlerStats[];
  /** null = that end is waiting for a new batter. */
  strikerId: string | null;
  nonStrikerId: string | null;
  /** Bowler of the current over; null between overs. */
  bowlerId: string | null;
  previousOverBowlerId: string | null;
  deliveries: DeliveryRecord[];
  fallOfWickets: FallOfWicket[];
  /** The next delivery is a free hit. */
  freeHitNext: boolean;
  completed: boolean;
  endReason: InningsEndReason | null;
  /** Runs debited to the current bowler in the current over (for maidens). */
  currentOverBowlerRuns: number;
}

export type NextAction =
  | { type: 'selectOpeners'; inningsIndex: 0 | 1 }
  | { type: 'selectBatter' }
  | { type: 'selectBowler' }
  | { type: 'delivery' }
  | { type: 'matchComplete' };

export type MatchResult =
  | { type: 'tie' }
  | { type: 'winByRuns'; winnerTeamId: string; runs: number }
  | { type: 'winByWickets'; winnerTeamId: string; wickets: number; ballsRemaining: number };

export interface MatchState {
  setup: MatchSetup;
  innings: InningsState[];
  next: NextAction;
  result: MatchResult | null;
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
  const setupErrors = validateMatchSetup(setup);
  if (setupErrors.length > 0) throw new ScoringError(`Invalid match setup: ${setupErrors[0]}`);

  const state: MatchState = { setup, innings: [], next: { type: 'selectOpeners', inningsIndex: 0 }, result: null };
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

/** Undo = remove the latest event. Returns null when there is nothing to undo. */
export function eventsAfterUndo(events: readonly MatchEvent[]): MatchEvent[] | null {
  return events.length === 0 ? null : events.slice(0, -1);
}

export function currentInnings(state: MatchState): InningsState | null {
  return state.innings.length ? state.innings[state.innings.length - 1] : null;
}

/** Players who may be chosen as the next batter. */
export function availableBatters(state: MatchState): string[] {
  const inn = currentInnings(state);
  if (!inn || state.next.type !== 'selectBatter') return [];
  const batted = new Set(inn.batters.map((b) => b.playerId));
  return inn.battingTeam.players.map((p) => p.playerId).filter((id) => !batted.has(id));
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

// ---------------------------------------------------------------------------------------------
// Event application (mutates `state`; returns an error message instead of applying if invalid)

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
    default:
      return 'Unknown event type.';
  }
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

function newBatter(team: TeamLineup, id: string): BatterStats {
  return { playerId: id, name: nameIn(team, id), runs: 0, ballsFaced: 0, fours: 0, sixes: 0, wicket: null };
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

function applyInningsStart(state: MatchState, strikerId: string, nonStrikerId: string, bowlerId: string): string | null {
  if (state.next.type !== 'selectOpeners') return needMessage(state.next);
  const { setup } = state;
  const firstIdx = firstBattingTeamIndex(setup);
  const index = state.next.inningsIndex;
  const battingTeam = setup.teams[index === 0 ? firstIdx : 1 - firstIdx];
  const bowlingTeam = setup.teams[index === 0 ? 1 - firstIdx : firstIdx];

  if (!inLineup(battingTeam, strikerId) || !inLineup(battingTeam, nonStrikerId)) {
    return `Opening batters must be in the ${battingTeam.name} lineup.`;
  }
  if (strikerId === nonStrikerId) return 'Choose two different opening batters.';
  if (!inLineup(bowlingTeam, bowlerId)) return `The bowler must be in the ${bowlingTeam.name} lineup.`;

  const inn: InningsState = {
    index,
    battingTeam,
    bowlingTeam,
    target: index === 1 ? state.innings[0].runs + 1 : null,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: zeroExtras(),
    batters: [newBatter(battingTeam, strikerId), newBatter(battingTeam, nonStrikerId)],
    bowlers: [],
    strikerId,
    nonStrikerId,
    bowlerId,
    previousOverBowlerId: null,
    deliveries: [],
    fallOfWickets: [],
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
  if (!inLineup(inn.battingTeam, playerId)) return `The batter must be in the ${inn.battingTeam.name} lineup.`;
  if (inn.batters.some((b) => b.playerId === playerId)) return `${nameIn(inn.battingTeam, playerId)} has already batted.`;

  inn.batters.push(newBatter(inn.battingTeam, playerId));
  if (inn.strikerId === null) inn.strikerId = playerId;
  else inn.nonStrikerId = playerId;
  state.next = nextWithinInnings(inn);
  return null;
}

function completedOversBy(inn: InningsState, playerId: string): number {
  const b = inn.bowlers.find((x) => x.playerId === playerId);
  return b ? Math.floor(b.legalBalls / BALLS_PER_OVER) : 0;
}

function bowlerNotAllowedReason(state: MatchState, inn: InningsState, playerId: string): string | null {
  const name = nameIn(inn.bowlingTeam, playerId);
  if (!inLineup(inn.bowlingTeam, playerId)) return `The bowler must be in the ${inn.bowlingTeam.name} lineup.`;
  if (playerId === inn.previousOverBowlerId) {
    return `${name} bowled the previous over. A bowler cannot bowl consecutive overs (Law 17.6).`;
  }
  const max = state.setup.rules.maxOversPerBowler;
  if (max !== null) {
    if (completedOversBy(inn, playerId) >= max) return `${name} has bowled the maximum ${max} overs.`;
    // Would choosing this bowler make it impossible to finish the innings?
    const totalOvers = state.setup.rules.oversPerInnings;
    const remainingAfter = totalOvers - Math.floor(inn.legalBalls / BALLS_PER_OVER) - 1;
    const left = new Map<string, number>();
    for (const p of inn.bowlingTeam.players) {
      const used = completedOversBy(inn, p.playerId) + (p.playerId === playerId ? 1 : 0);
      left.set(p.playerId, Math.max(0, max - used));
    }
    if (!canBowlRemainingOvers(remainingAfter, left, playerId)) {
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
  inn.currentOverBowlerRuns = 0;
  ensureBowler(inn, playerId);
  state.next = nextWithinInnings(inn);
  return null;
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
  } else if (d.runs % 2 === 1) {
    // Odd number of runs completed: the batters have changed ends. Ordinary boundaries have
    // d.runs === 0, so the batters stay at their original ends (Law 18.11.2).
    [atStrikerEnd, atNonStrikerEnd] = [atNonStrikerEnd, atStrikerEnd];
  }

  // --- Free hit (ICC playing condition, optional) ---
  inn.freeHitNext =
    state.setup.rules.freeHitAfterNoBall &&
    (d.ballType === 'noBall' || (isFreeHit && d.ballType === 'wide'));

  // --- End of over: the next over is bowled from the other end (Law 17.1) ---
  const overComplete = isLegalBall && inn.legalBalls % BALLS_PER_OVER === 0;
  if (overComplete) {
    if (inn.currentOverBowlerRuns === 0) bowler.maidens += 1;
    inn.currentOverBowlerRuns = 0;
    inn.previousOverBowlerId = bowlerId;
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
  const rules = state.setup.rules;
  let endReason: InningsEndReason | null = null;
  if (inn.target !== null && inn.runs >= inn.target) endReason = 'targetReached';
  else if (inn.wickets >= rules.playersPerSide - 1) endReason = 'allOut';
  else if (inn.legalBalls >= rules.oversPerInnings * BALLS_PER_OVER) endReason = 'overs';

  if (endReason) {
    inn.completed = true;
    inn.endReason = endReason;
    inn.freeHitNext = false;
    if (inn.index === 0) {
      state.next = { type: 'selectOpeners', inningsIndex: 1 };
    } else {
      state.result = decideResult(state);
      state.next = { type: 'matchComplete' };
    }
  } else {
    state.next = nextWithinInnings(inn);
  }
  return null;
}

/** Law 16.2 (win) and 16.5.1 (tie) for a one-innings-per-side match. */
function decideResult(state: MatchState): MatchResult {
  const [first, second] = state.innings;
  if (second.runs > first.runs) {
    return {
      type: 'winByWickets',
      winnerTeamId: second.battingTeam.teamId,
      wickets: state.setup.rules.playersPerSide - 1 - second.wickets,
      ballsRemaining: state.setup.rules.oversPerInnings * BALLS_PER_OVER - second.legalBalls,
    };
  }
  if (second.runs === first.runs) return { type: 'tie' };
  return { type: 'winByRuns', winnerTeamId: first.battingTeam.teamId, runs: first.runs - second.runs };
}
