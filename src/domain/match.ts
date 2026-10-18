// Match configuration and the events that make up a match.
// Pure TypeScript: no React, no SQLite. See docs/SCORING_RULES.md for the rules supported.

export const BALLS_PER_OVER = 6;
export const MIN_PLAYERS_PER_SIDE = 2;
export const MAX_PLAYERS_PER_SIDE = 11;
export const MAX_OVERS_PER_INNINGS = 100;
/** Sanity limit for runs completed by running on one delivery. */
export const MAX_RUNS_PER_DELIVERY = 7;

export interface MatchRules {
  /** Positive whole number. One innings per side. */
  oversPerInnings: number;
  /** Equal for both sides, 2 to 11. All out = playersPerSide - 1 wickets. */
  playersPerSide: number;
  /**
   * ICC limited-overs playing condition (NOT an MCC Law): the delivery after any no-ball is a
   * free hit; it carries over if the free-hit delivery is a wide or no-ball.
   */
  freeHitAfterNoBall: boolean;
  /** Competition playing condition (e.g. 4 in T20). null = no limit (MCC Laws have none). */
  maxOversPerBowler: number | null;
}

export function defaultRules(): MatchRules {
  return { oversPerInnings: 20, playersPerSide: 11, freeHitAfterNoBall: true, maxOversPerBowler: null };
}

/** A player as they were when the match was set up. Later renames do not change it. */
export interface LineupPlayer {
  playerId: string;
  name: string;
}

export interface TeamLineup {
  teamId: string;
  name: string;
  players: LineupPlayer[];
}

export type TossDecision = 'bat' | 'bowl';

export interface MatchSetup {
  rules: MatchRules;
  teams: [TeamLineup, TeamLineup];
  toss: { winnerTeamId: string; decision: TossDecision };
}

// ---------------------------------------------------------------------------------------------
// Delivery input: exactly what the scorer records for one ball.

/** 'fair' = neither a wide nor a no-ball. Only fair deliveries count toward the over. */
export type BallType = 'fair' | 'wide' | 'noBall';

/**
 * Where the non-penalty runs came from. Required for fair deliveries and no-balls;
 * must be null for wides (all runs from a wide are wides, Law 22.7).
 */
export type RunsFrom = 'bat' | 'byes' | 'legByes';

/**
 * - 'four' / 'six': the ball reached the boundary; runs completed are ignored and the batters
 *   return to their original ends (Laws 18.11.2, 19.7).
 * - 'overthrowFour': a boundary from an overthrow or wilful act of a fielder. Scores the
 *   4 allowance PLUS `runs` completed at the instant of the throw (Law 19.8).
 */
export type Boundary = 'none' | 'four' | 'six' | 'overthrowFour';

/** The two ends of the pitch, named by who was standing there when the ball was bowled. */
export type End = 'striker' | 'nonStriker';

export type Dismissal =
  | { kind: 'bowled' }
  | { kind: 'lbw' }
  | { kind: 'hitWicket' }
  | { kind: 'caught'; fielderId: string }
  | { kind: 'stumped'; fielderId: string }
  | {
      kind: 'runOut';
      /** The batter who is out (striker or non-striker). */
      playerOutId: string;
      /** End where the wicket was broken. The not-out batter finishes at the other end. */
      end: End;
      fielderId: string | null;
    };

export type DismissalKind = Dismissal['kind'];

export interface DeliveryInput {
  ballType: BallType;
  runsFrom: RunsFrom | null;
  /** Runs physically completed by running (plus a run in progress if the batters had crossed, where the Laws allow it). */
  runs: number;
  boundary: Boundary;
  dismissal: Dismissal | null;
}

// ---------------------------------------------------------------------------------------------
// Events: the ordered history of a match. The match state is always recomputed from these.

export interface InningsStartEvent {
  type: 'inningsStart';
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
}

export interface DeliveryEvent extends DeliveryInput {
  type: 'delivery';
  /** Who was on strike / at the other end / bowling. Checked against the replayed state. */
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
}

export interface NewBatterEvent {
  type: 'newBatter';
  playerId: string;
}

export interface NewBowlerEvent {
  type: 'newBowler';
  playerId: string;
}

export type MatchEvent = InningsStartEvent | DeliveryEvent | NewBatterEvent | NewBowlerEvent;
