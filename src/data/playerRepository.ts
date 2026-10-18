import type { Player } from '../domain/people';
import { validateName } from '../domain/people';
import type { Database } from './database';
import { RepositoryError } from './RepositoryError';
import type { RepositoryDeps } from './deps';

interface PlayerRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function createPlayerRepository(db: Database, deps: RepositoryDeps) {
  async function requirePlayer(id: string): Promise<Player> {
    const player = await repo.get(id);
    if (!player) throw new RepositoryError('NOT_FOUND', 'This player no longer exists.');
    return player;
  }

  const repo = {
    async list(options: { includeArchived?: boolean } = {}): Promise<Player[]> {
      const where = options.includeArchived ? '' : 'WHERE archived_at IS NULL';
      const rows = await db.all<PlayerRow>(
        `SELECT * FROM players ${where} ORDER BY name COLLATE NOCASE, id`,
      );
      return rows.map(toPlayer);
    },

    async get(id: string): Promise<Player | null> {
      const row = await db.first<PlayerRow>('SELECT * FROM players WHERE id = ?', [id]);
      return row ? toPlayer(row) : null;
    },

    /**
     * Player names are NOT unique: two real people can share a name, which is why
     * everything refers to players by ID.
     */
    async create(rawName: string): Promise<Player> {
      const name = validateName(rawName, 'Player');
      if (!name.ok) throw new RepositoryError('INVALID_NAME', name.error);
      const id = deps.newId();
      const now = deps.now();
      await db.run(
        'INSERT INTO players (id, name, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, NULL)',
        [id, name.value, now, now],
      );
      return { id, name: name.value, createdAt: now, updatedAt: now, archivedAt: null };
    },

    async rename(id: string, rawName: string): Promise<Player> {
      const name = validateName(rawName, 'Player');
      if (!name.ok) throw new RepositoryError('INVALID_NAME', name.error);
      await requirePlayer(id);
      await db.run('UPDATE players SET name = ?, updated_at = ? WHERE id = ?', [
        name.value,
        deps.now(),
        id,
      ]);
      return requirePlayer(id);
    },

    /**
     * Archiving hides a player from new selections but keeps the row, so existing
     * rosters and (later) match records stay intact. There is deliberately no delete.
     */
    async setArchived(id: string, archived: boolean): Promise<Player> {
      await requirePlayer(id);
      const now = deps.now();
      await db.run('UPDATE players SET archived_at = ?, updated_at = ? WHERE id = ?', [
        archived ? now : null,
        now,
        id,
      ]);
      return requirePlayer(id);
    },

    /** Names of non-archived teams this player is on (used for the archive warning). */
    async activeTeamNames(playerId: string): Promise<string[]> {
      const rows = await db.all<{ name: string }>(
        `SELECT t.name FROM teams t
           JOIN team_players tp ON tp.team_id = t.id
          WHERE tp.player_id = ? AND t.archived_at IS NULL
          ORDER BY t.name COLLATE NOCASE`,
        [playerId],
      );
      return rows.map((r) => r.name);
    },
  };
  return repo;
}

export type PlayerRepository = ReturnType<typeof createPlayerRepository>;
