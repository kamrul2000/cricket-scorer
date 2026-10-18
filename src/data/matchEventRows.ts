// Converts match events to and from `match_events` rows.
import type { Boundary, BallType, Dismissal, DismissalKind, End, MatchEvent, RunsFrom } from '../domain/match';
import type { DeliveryRecord } from '../domain/scoring';
import type { SqlValue } from './database';

export interface EventRow {
  seq: number;
  type: string;
  innings_index: number;
  striker_id: string | null;
  non_striker_id: string | null;
  bowler_id: string | null;
  player_id: string | null;
  ball_type: string | null;
  runs_from: string | null;
  runs_completed: number | null;
  boundary: string | null;
  dismissal_kind: string | null;
  dismissed_player_id: string | null;
  run_out_end: string | null;
  fielder_id: string | null;
  batter_runs: number | null;
  extras_wides: number | null;
  extras_no_balls: number | null;
  extras_byes: number | null;
  extras_leg_byes: number | null;
  total_runs: number | null;
  bowler_runs: number | null;
  is_legal_ball: number | null;
  is_ball_faced: number | null;
  is_free_hit: number | null;
  wicket_credited_to_bowler: number | null;
}

/** Column order used for INSERT (match_id and created_at are added by the repository). */
export const EVENT_COLUMNS: (keyof EventRow)[] = [
  'seq',
  'type',
  'innings_index',
  'striker_id',
  'non_striker_id',
  'bowler_id',
  'player_id',
  'ball_type',
  'runs_from',
  'runs_completed',
  'boundary',
  'dismissal_kind',
  'dismissed_player_id',
  'run_out_end',
  'fielder_id',
  'batter_runs',
  'extras_wides',
  'extras_no_balls',
  'extras_byes',
  'extras_leg_byes',
  'total_runs',
  'bowler_runs',
  'is_legal_ball',
  'is_ball_faced',
  'is_free_hit',
  'wicket_credited_to_bowler',
];

/** What the repository needs to store one event. */
export interface EventToStore {
  event: MatchEvent;
  /** Innings the event belongs to, from the scoring engine. */
  inningsIndex: 0 | 1;
  /** The engine's interpretation, for deliveries. */
  record: DeliveryRecord | null;
}

const bool = (b: boolean) => (b ? 1 : 0);

export function eventToRow(seq: number, { event, inningsIndex, record }: EventToStore): EventRow {
  const row: EventRow = {
    seq,
    type: event.type,
    innings_index: inningsIndex,
    striker_id: null,
    non_striker_id: null,
    bowler_id: null,
    player_id: null,
    ball_type: null,
    runs_from: null,
    runs_completed: null,
    boundary: null,
    dismissal_kind: null,
    dismissed_player_id: null,
    run_out_end: null,
    fielder_id: null,
    batter_runs: null,
    extras_wides: null,
    extras_no_balls: null,
    extras_byes: null,
    extras_leg_byes: null,
    total_runs: null,
    bowler_runs: null,
    is_legal_ball: null,
    is_ball_faced: null,
    is_free_hit: null,
    wicket_credited_to_bowler: null,
  };
  switch (event.type) {
    case 'inningsStart':
      row.striker_id = event.strikerId;
      row.non_striker_id = event.nonStrikerId;
      row.bowler_id = event.bowlerId;
      break;
    case 'newBatter':
    case 'newBowler':
      row.player_id = event.playerId;
      break;
    case 'swapBatters':
    case 'abandon':
      break; // the type is the whole event
    case 'delivery': {
      row.striker_id = event.strikerId;
      row.non_striker_id = event.nonStrikerId;
      row.bowler_id = event.bowlerId;
      row.ball_type = event.ballType;
      row.runs_from = event.runsFrom;
      row.runs_completed = event.runs;
      row.boundary = event.boundary;
      const d = event.dismissal;
      if (d) {
        row.dismissal_kind = d.kind;
        row.dismissed_player_id = d.kind === 'runOut' ? d.playerOutId : event.strikerId;
        if (d.kind === 'runOut') row.run_out_end = d.end;
        if (d.kind === 'caught' || d.kind === 'stumped' || d.kind === 'runOut') row.fielder_id = d.fielderId;
      }
      if (record) {
        row.batter_runs = record.batterRuns;
        row.extras_wides = record.extras.wides;
        row.extras_no_balls = record.extras.noBalls;
        row.extras_byes = record.extras.byes;
        row.extras_leg_byes = record.extras.legByes;
        row.total_runs = record.totalRuns;
        row.bowler_runs = record.bowlerRuns;
        row.is_legal_ball = bool(record.isLegalBall);
        row.is_ball_faced = bool(record.isBallFaced);
        row.is_free_hit = bool(record.isFreeHit);
        row.wicket_credited_to_bowler = record.wicket ? bool(record.wicket.creditedToBowler) : null;
      }
      break;
    }
  }
  return row;
}

export function rowValues(row: EventRow): SqlValue[] {
  return EVENT_COLUMNS.map((c) => row[c]);
}

/** Thrown when a stored row cannot be turned back into a valid event. */
export class DamagedRowError extends Error {}

function need<T>(value: T | null, what: string, seq: number): T {
  if (value === null || value === undefined) throw new DamagedRowError(`Event ${seq} is missing ${what}.`);
  return value;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], what: string, seq: number): T {
  if (value === null || !allowed.includes(value as T)) throw new DamagedRowError(`Event ${seq} has an invalid ${what}.`);
  return value as T;
}

/** Rebuilds the event from the input columns only (derived columns are ignored). */
export function rowToEvent(row: EventRow): MatchEvent {
  const s = row.seq;
  switch (row.type) {
    case 'inningsStart':
      return {
        type: 'inningsStart',
        strikerId: need(row.striker_id, 'the striker', s),
        nonStrikerId: need(row.non_striker_id, 'the non-striker', s),
        bowlerId: need(row.bowler_id, 'the bowler', s),
      };
    case 'newBatter':
    case 'newBowler':
      return { type: row.type, playerId: need(row.player_id, 'the player', s) };
    case 'swapBatters':
    case 'abandon':
      return { type: row.type };
    case 'delivery': {
      const strikerId = need(row.striker_id, 'the striker', s);
      const ballType = oneOf<BallType>(row.ball_type, ['fair', 'wide', 'noBall'], 'ball type', s);
      const runsFrom =
        row.runs_from === null ? null : oneOf<RunsFrom>(row.runs_from, ['bat', 'byes', 'legByes'], 'runs source', s);
      let dismissal: Dismissal | null = null;
      if (row.dismissal_kind !== null) {
        const kind = oneOf<DismissalKind>(
          row.dismissal_kind,
          ['bowled', 'caught', 'lbw', 'stumped', 'hitWicket', 'runOut'],
          'dismissal',
          s,
        );
        if (kind === 'caught' || kind === 'stumped') {
          dismissal = { kind, fielderId: need(row.fielder_id, 'the fielder', s) };
        } else if (kind === 'runOut') {
          dismissal = {
            kind,
            playerOutId: need(row.dismissed_player_id, 'the run-out batter', s),
            end: oneOf<End>(row.run_out_end, ['striker', 'nonStriker'], 'run-out end', s),
            fielderId: row.fielder_id,
          };
        } else {
          dismissal = { kind };
        }
      }
      return {
        type: 'delivery',
        strikerId,
        nonStrikerId: need(row.non_striker_id, 'the non-striker', s),
        bowlerId: need(row.bowler_id, 'the bowler', s),
        ballType,
        runsFrom,
        runs: need(row.runs_completed, 'runs completed', s),
        boundary: oneOf<Boundary>(row.boundary, ['none', 'four', 'six', 'overthrowFour'], 'boundary', s),
        dismissal,
      };
    }
    default:
      throw new DamagedRowError(`Event ${s} has an unknown type.`);
  }
}
