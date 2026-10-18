// The tables a backup contains, with the exact columns of each (database schema version 2).
// Used to read and write backups, and to check the structure of a backup file before restoring.
import { EVENT_COLUMNS, type EventRow } from './matchEventRows';
import type { MatchPlayerRow, MatchRow } from './matchRepository';
import type { ScheduleRow } from './scheduleRepository';

/** text = non-empty string; string = any string (may be empty); int = whole number; `?` = may also be null. */
export type ColumnKind = 'text' | 'string' | 'text?' | 'int' | 'int?';

export interface EntityRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface TeamRow extends EntityRow {
  description: string;
  logo_file: string | null;
  captain_id: string | null;
  vice_captain_id: string | null;
}

export interface TeamPlayerRow {
  team_id: string;
  player_id: string;
  added_at: string;
}

export type MatchEventBackupRow = EventRow & { match_id: string; created_at: string };

/** All app data, one array of rows per table. */
export interface BackupData {
  players: EntityRow[];
  teams: TeamRow[];
  teamPlayers: TeamPlayerRow[];
  matches: MatchRow[];
  matchPlayers: MatchPlayerRow[];
  matchEvents: MatchEventBackupRow[];
  scheduledMatches: ScheduleRow[];
}

export type BackupTableKey = keyof BackupData;

interface TableSpec {
  /** SQL table name (a constant, never user input). */
  table: string;
  columns: Record<string, ColumnKind>;
  orderBy: string;
}

const ENTITY_COLUMNS: Record<string, ColumnKind> = {
  id: 'text',
  name: 'text',
  created_at: 'text',
  updated_at: 'text',
  archived_at: 'text?',
};

const EVENT_INT_COLUMNS = new Set(['seq', 'innings_index']);
const EVENT_NULLABLE_INT_COLUMNS = new Set([
  'runs_completed',
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
]);

function eventColumnKind(c: string): ColumnKind {
  if (c === 'type') return 'text';
  if (EVENT_INT_COLUMNS.has(c)) return 'int';
  if (EVENT_NULLABLE_INT_COLUMNS.has(c)) return 'int?';
  return 'text?';
}

export const BACKUP_TABLES: Record<BackupTableKey, TableSpec> = {
  players: { table: 'players', columns: ENTITY_COLUMNS, orderBy: 'created_at, id' },
  teams: {
    table: 'teams',
    columns: { ...ENTITY_COLUMNS, description: 'string', logo_file: 'text?', captain_id: 'text?', vice_captain_id: 'text?' },
    orderBy: 'created_at, id',
  },
  teamPlayers: {
    table: 'team_players',
    columns: { team_id: 'text', player_id: 'text', added_at: 'text' },
    orderBy: 'team_id, player_id',
  },
  matches: {
    table: 'matches',
    columns: {
      id: 'text',
      status: 'text',
      team_a_id: 'text',
      team_a_name: 'text',
      team_b_id: 'text',
      team_b_name: 'text',
      overs_per_innings: 'int',
      players_per_side: 'int',
      free_hit_after_no_ball: 'int',
      max_overs_per_bowler: 'int?',
      toss_winner_team_id: 'text',
      toss_decision: 'text',
      summary: 'text',
      event_count: 'int',
      created_at: 'text',
      updated_at: 'text',
      player_of_match_id: 'text?',
      best_batter_id: 'text?',
      best_bowler_id: 'text?',
      venue: 'string',
      format_name: 'string',
    },
    orderBy: 'created_at, id',
  },
  scheduledMatches: {
    table: 'scheduled_matches',
    columns: {
      id: 'text',
      team_a_id: 'text',
      team_b_id: 'text',
      scheduled_at: 'text',
      venue: 'string',
      format_name: 'text',
      overs_per_innings: 'int',
      players_per_side: 'int',
      status: 'text',
      match_id: 'text?',
      created_at: 'text',
      updated_at: 'text',
    },
    orderBy: 'scheduled_at, id',
  },
  matchPlayers: {
    table: 'match_players',
    columns: {
      match_id: 'text',
      team_id: 'text',
      player_id: 'text',
      lineup_order: 'int',
      player_name: 'text',
      is_substitute: 'int',
      role: 'text?',
    },
    orderBy: 'match_id, team_id, is_substitute, lineup_order',
  },
  matchEvents: {
    table: 'match_events',
    columns: {
      match_id: 'text',
      ...Object.fromEntries(EVENT_COLUMNS.map((c) => [c, eventColumnKind(c)])),
      created_at: 'text',
    },
    orderBy: 'match_id, seq',
  },
};

/** Parents before children, so foreign keys are satisfied while inserting. */
export const INSERT_ORDER: BackupTableKey[] = [
  'players',
  'teams',
  'teamPlayers',
  'matches',
  'matchPlayers',
  'matchEvents',
  'scheduledMatches',
];
