// Match configuration and the events that make up a match.
// Pure TypeScript: no React, no SQLite. See docs/SCORING_RULES.md for the rules supported.

export const BALLS_PER_OVER = 6;
export const MIN_PLAYERS_PER_SIDE = 2;
export const MAX_PLAYERS_PER_SIDE = 11;
export const MAX_OVERS_PER_INNINGS = 100;
/** Sanity limit for runs completed by running on one delivery. */
export const MAX_RUNS_PER_DELIVERY = 7;
/** A Super Over innings: one over, ended by the loss of two wickets (ICC playing conditions). */
export const SUPER_OVER_OVERS = 1;
export const SUPER_OVER_WICKETS = 2;

export interface MatchRules {
  /** Positive whole number. One innings per side (plus Super Overs after a tie). */
  oversPerInnings: number;
  /**
   * ICC limited-overs playing condition (NOT an MCC Law): the delivery after any no-ball is a
   * free hit; it carries over if the free-hit delivery is a wide or no-ball.
   */
  freeHitAfterNoBall: boolean;
  /** Competition playing condition (e.g. 4 in T20). null = no limit (MCC Laws have none). */
  maxOversPerBowler: number | null;
}

export function defaultRules(): MatchRules {
  return { oversPerInnings: 20, freeHitAfterNoBall: true, maxOversPerBowler: null };
}

/** A player as they were when the match was set up. Later renames do not change it. */
export interface LineupPlayer {
  playerId: string;
  name: string;
}

export interface TeamLineup {
  teamId: string;
  name: string;
  /**
   * Players this team fields in the match (2 to 11; the two teams may differ). All out = size - 1
   * wickets. The lineup may name fewer players at the start; the others join it during the
   * match (AddPlayerEvent). Omitted when the lineup names the whole team. See `teamSize`.
   */
  size?: number;
  /**
   * The playing lineup: the only players who can bat, bowl or field in the scoring. At most
   * `size` players.
   */
  players: LineupPlayer[];
  /**
   * Named substitutes (optional). They are listed on the scorecard but cannot bat, bowl or be
   * recorded as fielders: substitute and replacement rules are not supported in this version.
   */
  substitutes?: LineupPlayer[];
  /** Captain and vice-captain for this match (optional), from the playing lineup. */
  captainId?: string | null;
  viceCaptainId?: string | null;
}

/** Players the team fields: its declared size, or the whole lineup when none is declared. */
export function teamSize(team: TeamLineup): number {
  return team.size ?? team.players.length;
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

/**
 * Scorer correction: the striker and non-striker change places without a delivery (for
 * example after the scorer noticed that the wrong batter was shown on strike). Recorded as an
 * event so the correction is visible in the history and can be undone.
 */
export interface SwapBattersEvent {
  type: 'swapBatters';
}

/** The match is abandoned (rain, bad light, ...) and ends with no result. */
export interface AbandonEvent {
  type: 'abandon';
}

/** Law 25.4. hurt = retired not out, may resume later; out = retired out, counts as a wicket. */
export type Retirement = 'hurt' | 'out';

/** A batter at the crease retires between deliveries. A new batter takes their place. */
export interface RetireEvent {
  type: 'retire';
  playerId: string;
  retirement: Retirement;
}

/**
 * Law 17.8: the bowler cannot finish the over (for example injured), so another bowler
 * completes it. Before the first ball of an over it simply corrects the choice of bowler.
 */
export interface ReplaceBowlerEvent {
  type: 'replaceBowler';
  playerId: string;
}

/** The batting side cannot continue: everyone left to bat has retired hurt and cannot resume. */
export interface EndInningsEvent {
  type: 'endInnings';
}

/**
 * The innings is closed before it would otherwise end, by agreement or for any other reason (a
 * declaration, the batting side giving up, no time left). It counts as complete: the next
 * innings starts, or the result is decided on the runs scored.
 */
export interface CloseInningsEvent {
  type: 'closeInnings';
}

/**
 * Overs lost to an interruption (rain, bad light, a late start). `overs` replaces the overs of
 * the current main innings; while the first innings is in progress the second innings gets the
 * same number. From the end of the first innings on, `target` is the chasing side's revised
 * target (agreed by the scorers; the app suggests one in proportion to the overs, DLS is not
 * supported). `maxOversPerBowler` replaces the bowling limit (null = no limit).
 */
export interface ReviseOversEvent {
  type: 'reviseOvers';
  overs: number;
  target: number | null;
  maxOversPerBowler: number | null;
}

/** The scores are level at the end of the match (or of a Super Over): play a Super Over. */
export interface SuperOverEvent {
  type: 'superOver';
}

/**
 * A player joins a team's lineup during the match, while it has fewer players than the team
 * size. From then on they can bat, bowl and field. `name` is their name at that moment (like
 * the lineup snapshot). Recorded as an event so the lineup at any point of the history is known.
 */
export interface AddPlayerEvent {
  type: 'addPlayer';
  teamId: string;
  playerId: string;
  name: string;
}

export type MatchEvent =
  | InningsStartEvent
  | DeliveryEvent
  | NewBatterEvent
  | NewBowlerEvent
  | SwapBattersEvent
  | AbandonEvent
  | RetireEvent
  | ReplaceBowlerEvent
  | EndInningsEvent
  | CloseInningsEvent
  | ReviseOversEvent
  | SuperOverEvent
  | AddPlayerEvent;
