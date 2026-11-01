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
  {
    version: 5,
    description: 'match awards',
    // NULL = not chosen (Player of the Match) or worked out automatically (best batter/bowler).
    sql: `
      ALTER TABLE matches ADD COLUMN player_of_match_id TEXT REFERENCES players (id) ON DELETE RESTRICT;
      ALTER TABLE matches ADD COLUMN best_batter_id TEXT REFERENCES players (id) ON DELETE RESTRICT;
      ALTER TABLE matches ADD COLUMN best_bowler_id TEXT REFERENCES players (id) ON DELETE RESTRICT;
    `,
  },
  {
    version: 6,
    description: 'upcoming (scheduled) matches, and venue and format on matches',
    sql: `
      CREATE TABLE scheduled_matches (
        id                TEXT PRIMARY KEY NOT NULL,
        team_a_id         TEXT NOT NULL REFERENCES teams (id) ON DELETE RESTRICT,
        team_b_id         TEXT NOT NULL REFERENCES teams (id) ON DELETE RESTRICT,
        scheduled_at      TEXT NOT NULL,
        venue             TEXT NOT NULL DEFAULT '' CHECK (length(venue) <= 80),
        format_name       TEXT NOT NULL CHECK (length(format_name) BETWEEN 1 AND 40),
        overs_per_innings INTEGER NOT NULL CHECK (overs_per_innings BETWEEN 1 AND 100),
        players_per_side  INTEGER NOT NULL CHECK (players_per_side BETWEEN 2 AND 11),
        status            TEXT NOT NULL CHECK (status IN ('scheduled', 'started', 'cancelled')),
        -- UNIQUE: one scheduled match can start at most one match.
        match_id          TEXT UNIQUE REFERENCES matches (id) ON DELETE SET NULL,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        CHECK (team_a_id <> team_b_id)
      );
      CREATE INDEX idx_scheduled_matches_at ON scheduled_matches (scheduled_at);

      ALTER TABLE matches ADD COLUMN venue TEXT NOT NULL DEFAULT '' CHECK (length(venue) <= 80);
      ALTER TABLE matches ADD COLUMN format_name TEXT NOT NULL DEFAULT '' CHECK (length(format_name) <= 40);
    `,
  },
  {
    version: 7,
    description: 'match events: retirements, bowler replacement, ending an innings, Super Overs',
    // Rebuilt like version 3 to change CHECK constraints: four new event types, innings 2 and
    // up (Super Overs), and the new `retirement` column. Existing rows are copied unchanged.
    // Since this version, matches.players_per_side is the larger lineup size, for information
    // only: the two lineups may differ and the scoring uses the lineups themselves.
    sql: `
      CREATE TABLE match_events_v7 (
        match_id        TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        seq             INTEGER NOT NULL CHECK (seq >= 0),
        type            TEXT NOT NULL CHECK (type IN ('inningsStart', 'delivery', 'newBatter', 'newBowler', 'swapBatters', 'abandon',
                                                      'retire', 'replaceBowler', 'endInnings', 'superOver')),
        innings_index   INTEGER NOT NULL CHECK (innings_index >= 0),
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
        retirement      TEXT CHECK (retirement IN ('hurt', 'out')),
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
      INSERT INTO match_events_v7 (match_id, seq, type, innings_index, striker_id, non_striker_id, bowler_id, player_id,
          ball_type, runs_from, runs_completed, boundary, dismissal_kind, dismissed_player_id, run_out_end, fielder_id,
          batter_runs, extras_wides, extras_no_balls, extras_byes, extras_leg_byes, total_runs, bowler_runs,
          is_legal_ball, is_ball_faced, is_free_hit, wicket_credited_to_bowler, created_at)
        SELECT match_id, seq, type, innings_index, striker_id, non_striker_id, bowler_id, player_id,
          ball_type, runs_from, runs_completed, boundary, dismissal_kind, dismissed_player_id, run_out_end, fielder_id,
          batter_runs, extras_wides, extras_no_balls, extras_byes, extras_leg_byes, total_runs, bowler_runs,
          is_legal_ball, is_ball_faced, is_free_hit, wicket_credited_to_bowler, created_at
        FROM match_events;
      DROP TABLE match_events;
      ALTER TABLE match_events_v7 RENAME TO match_events;
    `,
  },
  {
    version: 8,
    description: 'team sizes on matches, and players joining a lineup during the match',
    // Each team's size (players per side) is stored on the match: a lineup may now name fewer
    // players at the start, and the rest join with 'addPlayer' events. Existing matches named
    // the whole team, so their size is their lineup size. The events table is rebuilt like
    // version 7 for the new type and its team_id and player_name columns.
    sql: `
      ALTER TABLE matches ADD COLUMN team_a_size INTEGER NOT NULL DEFAULT 11 CHECK (team_a_size BETWEEN 2 AND 11);
      ALTER TABLE matches ADD COLUMN team_b_size INTEGER NOT NULL DEFAULT 11 CHECK (team_b_size BETWEEN 2 AND 11);
      UPDATE matches SET
        team_a_size = MAX(2, MIN(11, (SELECT COUNT(*) FROM match_players mp
          WHERE mp.match_id = matches.id AND mp.team_id = matches.team_a_id AND mp.is_substitute = 0))),
        team_b_size = MAX(2, MIN(11, (SELECT COUNT(*) FROM match_players mp
          WHERE mp.match_id = matches.id AND mp.team_id = matches.team_b_id AND mp.is_substitute = 0)));

      CREATE TABLE match_events_v8 (
        match_id        TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        seq             INTEGER NOT NULL CHECK (seq >= 0),
        type            TEXT NOT NULL CHECK (type IN ('inningsStart', 'delivery', 'newBatter', 'newBowler', 'swapBatters', 'abandon',
                                                      'retire', 'replaceBowler', 'endInnings', 'superOver', 'addPlayer')),
        innings_index   INTEGER NOT NULL CHECK (innings_index >= 0),
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
        retirement      TEXT CHECK (retirement IN ('hurt', 'out')),
        team_id         TEXT,
        player_name     TEXT CHECK (player_name IS NULL OR length(player_name) BETWEEN 1 AND 60),
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
      INSERT INTO match_events_v8 (match_id, seq, type, innings_index, striker_id, non_striker_id, bowler_id, player_id,
          ball_type, runs_from, runs_completed, boundary, dismissal_kind, dismissed_player_id, run_out_end, fielder_id,
          retirement, batter_runs, extras_wides, extras_no_balls, extras_byes, extras_leg_byes, total_runs, bowler_runs,
          is_legal_ball, is_ball_faced, is_free_hit, wicket_credited_to_bowler, created_at)
        SELECT match_id, seq, type, innings_index, striker_id, non_striker_id, bowler_id, player_id,
          ball_type, runs_from, runs_completed, boundary, dismissal_kind, dismissed_player_id, run_out_end, fielder_id,
          retirement, batter_runs, extras_wides, extras_no_balls, extras_byes, extras_leg_byes, total_runs, bowler_runs,
          is_legal_ball, is_ball_faced, is_free_hit, wicket_credited_to_bowler, created_at
        FROM match_events;
      DROP TABLE match_events;
      ALTER TABLE match_events_v8 RENAME TO match_events;
      -- Finds the matches a player joined during play (career statistics).
      CREATE INDEX idx_match_events_added_player ON match_events (player_id) WHERE type = 'addPlayer';
    `,
  },
  {
    version: 9,
    description: 'paused and abandoned matches, closing an innings early, and reduced overs',
    // A match can be paused (with an optional reason) and the match list shows abandoned
    // matches apart: the abandoned flag is recomputed by the engine on every change, and for
    // existing matches it follows from the stored result text. The events table is rebuilt like
    // version 8 for the closeInnings and reviseOvers types and reviseOvers' three columns.
    sql: `
      ALTER TABLE matches ADD COLUMN abandoned INTEGER NOT NULL DEFAULT 0 CHECK (abandoned IN (0, 1));
      UPDATE matches SET abandoned = 1 WHERE status = 'completed' AND summary = 'No result (match abandoned)';
      ALTER TABLE matches ADD COLUMN paused_at TEXT;
      ALTER TABLE matches ADD COLUMN pause_reason TEXT CHECK (pause_reason IS NULL OR length(pause_reason) BETWEEN 1 AND 40);

      CREATE TABLE match_events_v9 (
        match_id        TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        seq             INTEGER NOT NULL CHECK (seq >= 0),
        type            TEXT NOT NULL CHECK (type IN ('inningsStart', 'delivery', 'newBatter', 'newBowler', 'swapBatters', 'abandon',
                                                      'retire', 'replaceBowler', 'endInnings', 'superOver', 'addPlayer',
                                                      'closeInnings', 'reviseOvers')),
        innings_index   INTEGER NOT NULL CHECK (innings_index >= 0),
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
        retirement      TEXT CHECK (retirement IN ('hurt', 'out')),
        team_id         TEXT,
        player_name     TEXT CHECK (player_name IS NULL OR length(player_name) BETWEEN 1 AND 60),
        revised_overs   INTEGER CHECK (revised_overs IS NULL OR revised_overs >= 1),
        revised_target  INTEGER CHECK (revised_target IS NULL OR revised_target >= 1),
        revised_bowler_limit INTEGER CHECK (revised_bowler_limit IS NULL OR revised_bowler_limit >= 1),
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
      INSERT INTO match_events_v9 (match_id, seq, type, innings_index, striker_id, non_striker_id, bowler_id, player_id,
          ball_type, runs_from, runs_completed, boundary, dismissal_kind, dismissed_player_id, run_out_end, fielder_id,
          retirement, team_id, player_name, batter_runs, extras_wides, extras_no_balls, extras_byes, extras_leg_byes,
          total_runs, bowler_runs, is_legal_ball, is_ball_faced, is_free_hit, wicket_credited_to_bowler, created_at)
        SELECT match_id, seq, type, innings_index, striker_id, non_striker_id, bowler_id, player_id,
          ball_type, runs_from, runs_completed, boundary, dismissal_kind, dismissed_player_id, run_out_end, fielder_id,
          retirement, team_id, player_name, batter_runs, extras_wides, extras_no_balls, extras_byes, extras_leg_byes,
          total_runs, bowler_runs, is_legal_ball, is_ball_faced, is_free_hit, wicket_credited_to_bowler, created_at
        FROM match_events;
      DROP TABLE match_events;
      ALTER TABLE match_events_v9 RENAME TO match_events;
      CREATE INDEX idx_match_events_added_player ON match_events (player_id) WHERE type = 'addPlayer';
    `,
  },
  {
    version: 10,
    description: 'batting hand and role of players',
    // Both are optional (NULL = not set), so existing players are unchanged.
    sql: `
      ALTER TABLE players ADD COLUMN batting_hand TEXT CHECK (batting_hand IS NULL OR batting_hand IN ('right', 'left'));
      ALTER TABLE players ADD COLUMN role TEXT CHECK (role IS NULL OR role IN ('batter', 'bowler', 'allRounder', 'wicketKeeper'));
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
