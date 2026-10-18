// Versioned schema migrations.
// The applied version is stored in SQLite's built-in `PRAGMA user_version`.
// RULES: never edit a migration that has shipped; add a new one at the end.
import type { Database } from './database';

export interface Migration {
  version: number;
  description: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'players, teams and team rosters',
    sql: `
      CREATE TABLE players (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        archived_at TEXT
      );

      CREATE TABLE teams (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        archived_at TEXT
      );

      -- Two active teams cannot share a name (ignoring upper/lower case).
      CREATE UNIQUE INDEX idx_teams_active_name
        ON teams (name COLLATE NOCASE) WHERE archived_at IS NULL;

      -- A player can be on many teams; a team has many players.
      -- RESTRICT: the database refuses to delete a player or team that is still referenced.
      CREATE TABLE team_players (
        team_id   TEXT NOT NULL REFERENCES teams (id)   ON DELETE RESTRICT,
        player_id TEXT NOT NULL REFERENCES players (id) ON DELETE RESTRICT,
        added_at  TEXT NOT NULL,
        PRIMARY KEY (team_id, player_id)
      );
      CREATE INDEX idx_team_players_player ON team_players (player_id);
    `,
  },
  {
    version: 2,
    description: 'matches, lineup snapshots and the ordered event history',
    sql: `
      -- One row per match. Rules and team names are copied in so later edits to teams
      -- never change a recorded match.
      CREATE TABLE matches (
        id                     TEXT PRIMARY KEY NOT NULL,
        status                 TEXT NOT NULL CHECK (status IN ('inProgress', 'completed')),
        team_a_id              TEXT NOT NULL REFERENCES teams (id) ON DELETE RESTRICT,
        team_a_name            TEXT NOT NULL,
        team_b_id              TEXT NOT NULL REFERENCES teams (id) ON DELETE RESTRICT,
        team_b_name            TEXT NOT NULL,
        overs_per_innings      INTEGER NOT NULL CHECK (overs_per_innings BETWEEN 1 AND 100),
        players_per_side       INTEGER NOT NULL CHECK (players_per_side BETWEEN 2 AND 11),
        free_hit_after_no_ball INTEGER NOT NULL CHECK (free_hit_after_no_ball IN (0, 1)),
        max_overs_per_bowler   INTEGER CHECK (max_overs_per_bowler IS NULL OR max_overs_per_bowler > 0),
        toss_winner_team_id    TEXT NOT NULL,
        toss_decision          TEXT NOT NULL CHECK (toss_decision IN ('bat', 'bowl')),
        -- Short text for the match list, recomputed by the scoring engine on every change.
        summary                TEXT NOT NULL,
        -- Number of stored events; the next event must have seq = event_count.
        event_count            INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
        created_at             TEXT NOT NULL,
        updated_at             TEXT NOT NULL,
        CHECK (team_a_id <> team_b_id),
        CHECK (toss_winner_team_id IN (team_a_id, team_b_id))
      );
      CREATE INDEX idx_matches_updated ON matches (updated_at);

      -- The playing lineup snapshot (name as it was when the match was set up).
      CREATE TABLE match_players (
        match_id     TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        team_id      TEXT NOT NULL,
        player_id    TEXT NOT NULL REFERENCES players (id) ON DELETE RESTRICT,
        lineup_order INTEGER NOT NULL,
        player_name  TEXT NOT NULL,
        PRIMARY KEY (match_id, player_id)
      );
      CREATE INDEX idx_match_players_player ON match_players (player_id);

      -- The ordered event history: the source of truth for the match.
      -- Input columns (what the scorer recorded) rebuild the event; the "derived" columns are
      -- the scoring engine's interpretation when it was saved, kept for inspection and export.
      CREATE TABLE match_events (
        match_id        TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        seq             INTEGER NOT NULL CHECK (seq >= 0),
        type            TEXT NOT NULL CHECK (type IN ('inningsStart', 'delivery', 'newBatter', 'newBowler')),
        innings_index   INTEGER NOT NULL CHECK (innings_index IN (0, 1)),
        striker_id      TEXT,
        non_striker_id  TEXT,
        bowler_id       TEXT,
        player_id       TEXT,
        ball_type       TEXT CHECK (ball_type IN ('fair', 'wide', 'noBall')),
        runs_from       TEXT CHECK (runs_from IN ('bat', 'byes', 'legByes')),
        runs_completed  INTEGER CHECK (runs_completed >= 0),
        boundary        TEXT CHECK (boundary IN ('none', 'four', 'six', 'overthrowFour')),
        dismissal_kind  TEXT CHECK (dismissal_kind IN ('bowled', 'caught', 'lbw', 'stumped', 'hitWicket', 'runOut')),
        dismissed_player_id TEXT,
        run_out_end     TEXT CHECK (run_out_end IN ('striker', 'nonStriker')),
        fielder_id      TEXT,
        -- derived
        batter_runs     INTEGER,
        extras_wides    INTEGER,
        extras_no_balls INTEGER,
        extras_byes     INTEGER,
        extras_leg_byes INTEGER,
        total_runs      INTEGER,
        bowler_runs     INTEGER,
        is_legal_ball   INTEGER CHECK (is_legal_ball IN (0, 1)),
        is_ball_faced   INTEGER CHECK (is_ball_faced IN (0, 1)),
        is_free_hit     INTEGER CHECK (is_free_hit IN (0, 1)),
        wicket_credited_to_bowler INTEGER CHECK (wicket_credited_to_bowler IN (0, 1)),
        created_at      TEXT NOT NULL,
        PRIMARY KEY (match_id, seq)
      );
    `,
  },
  {
    version: 3,
    description: 'match events: swap batters (scorer correction) and abandon (no result)',
    // SQLite cannot change a CHECK constraint in place, so the table is rebuilt with the new
    // allowed types and every existing row is copied across unchanged.
    sql: `
      CREATE TABLE match_events_v3 (
        match_id        TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        seq             INTEGER NOT NULL CHECK (seq >= 0),
        type            TEXT NOT NULL CHECK (type IN ('inningsStart', 'delivery', 'newBatter', 'newBowler', 'swapBatters', 'abandon')),
        innings_index   INTEGER NOT NULL CHECK (innings_index IN (0, 1)),
        striker_id      TEXT,
        non_striker_id  TEXT,
        bowler_id       TEXT,
        player_id       TEXT,
        ball_type       TEXT CHECK (ball_type IN ('fair', 'wide', 'noBall')),
        runs_from       TEXT CHECK (runs_from IN ('bat', 'byes', 'legByes')),
        runs_completed  INTEGER CHECK (runs_completed >= 0),
        boundary        TEXT CHECK (boundary IN ('none', 'four', 'six', 'overthrowFour')),
        dismissal_kind  TEXT CHECK (dismissal_kind IN ('bowled', 'caught', 'lbw', 'stumped', 'hitWicket', 'runOut')),
        dismissed_player_id TEXT,
        run_out_end     TEXT CHECK (run_out_end IN ('striker', 'nonStriker')),
        fielder_id      TEXT,
        batter_runs     INTEGER,
        extras_wides    INTEGER,
        extras_no_balls INTEGER,
        extras_byes     INTEGER,
        extras_leg_byes INTEGER,
        total_runs      INTEGER,
        bowler_runs     INTEGER,
        is_legal_ball   INTEGER CHECK (is_legal_ball IN (0, 1)),
        is_ball_faced   INTEGER CHECK (is_ball_faced IN (0, 1)),
        is_free_hit     INTEGER CHECK (is_free_hit IN (0, 1)),
        wicket_credited_to_bowler INTEGER CHECK (wicket_credited_to_bowler IN (0, 1)),
        created_at      TEXT NOT NULL,
        PRIMARY KEY (match_id, seq)
      );
      INSERT INTO match_events_v3 SELECT * FROM match_events;
      DROP TABLE match_events;
      ALTER TABLE match_events_v3 RENAME TO match_events;
    `,
  },
  {
    version: 4,
    description: 'team details (description, logo, captain, vice-captain) and match substitutes and roles',
    sql: `
      ALTER TABLE teams ADD COLUMN description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 300);
      -- File name of the logo inside the app's private "logos" folder, or NULL for none.
      ALTER TABLE teams ADD COLUMN logo_file TEXT;
      ALTER TABLE teams ADD COLUMN captain_id TEXT REFERENCES players (id) ON DELETE RESTRICT;
      ALTER TABLE teams ADD COLUMN vice_captain_id TEXT REFERENCES players (id) ON DELETE RESTRICT;

      -- Substitutes are named in the match snapshot but cannot bat, bowl or field in the scoring.
      ALTER TABLE match_players ADD COLUMN is_substitute INTEGER NOT NULL DEFAULT 0 CHECK (is_substitute IN (0, 1));
      ALTER TABLE match_players ADD COLUMN role TEXT CHECK (role IN ('captain', 'viceCaptain'));
    `,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** Applies every migration newer than the stored version. Returns the resulting version. */
export async function migrate(
  db: Database,
  migrations: Migration[] = MIGRATIONS,
): Promise<number> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  const latest = migrations.length ? migrations[migrations.length - 1].version : 0;

  if (current > latest) {
    // The database was written by a newer app version. Do not touch it.
    throw new Error(
      `Database schema version ${current} is newer than this app supports (${latest}). Update the app.`,
    );
  }

  for (const m of migrations) {
    if (m.version <= current) continue;
    // Each migration and its version bump commit together, or not at all.
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.exec(`PRAGMA user_version = ${m.version}`);
    });
  }
  return latest;
}
