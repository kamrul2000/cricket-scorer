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
