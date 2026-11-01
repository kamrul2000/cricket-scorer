import type { BattingHand, Player, PlayerProfile, PlayerRole } from '../domain/people';
import { NO_PROFILE, validateName } from '../domain/people';
import type { Database } from './database';
import { RepositoryError } from './RepositoryError';
import type { RepositoryDeps } from './deps';

interface PlayerRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /** The table's CHECK constraints allow only these values. */
  batting_hand: BattingHand | null;
  role: PlayerRole | null;
}

export function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    battingHand: row.batting_hand,
    role: row.role,
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
    async create(rawName: string, profile: PlayerProfile = NO_PROFILE): Promise<Player> {
      const name = validateName(rawName, 'Player');
      if (!name.ok) throw new RepositoryError('INVALID_NAME', name.error);
      const id = deps.newId();
      const now = deps.now();
      const { battingHand, role } = profile;
      await db.run(
        'INSERT INTO players (id, name, created_at, updated_at, archived_at, batting_hand, role) VALUES (?, ?, ?, ?, NULL, ?, ?)',
        [id, name.value, now, now, battingHand, role],
      );
      return { id, name: name.value, createdAt: now, updatedAt: now, archivedAt: null, battingHand, role };
    },

    /** Changes the name and, when given, the batting hand and role (otherwise they are kept). */
    async update(id: string, rawName: string, profile?: PlayerProfile): Promise<Player> {
      const name = validateName(rawName, 'Player');
      if (!name.ok) throw new RepositoryError('INVALID_NAME', name.error);
      const { battingHand, role } = profile ?? (await requirePlayer(id));
      const { changes } = await db.run(
        'UPDATE players SET name = ?, batting_hand = ?, role = ?, updated_at = ? WHERE id = ?',
        [name.value, battingHand, role, deps.now(), id],
      );
      if (changes === 0) throw new RepositoryError('NOT_FOUND', 'This player no longer exists.');
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
