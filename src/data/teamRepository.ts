import type { Team, TeamSummary, TeamWithRoster } from '../domain/people';
import { validateName } from '../domain/people';
import type { Database, SqlExecutor } from './database';
import { RepositoryError } from './RepositoryError';
import type { RepositoryDeps } from './deps';

interface TeamRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function createTeamRepository(db: Database, deps: RepositoryDeps) {
  async function getTeamRow(ex: SqlExecutor, id: string): Promise<TeamRow> {
    const row = await ex.first<TeamRow>('SELECT * FROM teams WHERE id = ?', [id]);
    if (!row) throw new RepositoryError('NOT_FOUND', 'This team no longer exists.');
    return row;
  }

  async function assertNameFree(ex: SqlExecutor, name: string, exceptTeamId: string | null) {
    const clash = await ex.first<{ id: string }>(
      `SELECT id FROM teams
        WHERE name = ? COLLATE NOCASE AND archived_at IS NULL AND id <> ?`,
      [name, exceptTeamId ?? ''],
    );
    if (clash) {
      throw new RepositoryError('DUPLICATE_NAME', `A team named "${name}" already exists.`);
    }
  }

  async function readRoster(ex: SqlExecutor, teamId: string): Promise<string[]> {
    const rows = await ex.all<{ player_id: string }>(
      `SELECT tp.player_id FROM team_players tp
         JOIN players p ON p.id = tp.player_id
        WHERE tp.team_id = ?
        ORDER BY p.name COLLATE NOCASE, p.id`,
      [teamId],
    );
    return rows.map((r) => r.player_id);
  }

  /**
   * Makes the stored roster equal `playerIds`. Players added by this call must exist and
   * be active; players already on the roster may stay even if archived since they were
   * valid when added.
   */
  async function writeRoster(ex: SqlExecutor, teamId: string, playerIds: string[]) {
    const wanted = Array.from(new Set(playerIds));
    const current = new Set(await readRoster(ex, teamId));

    for (const playerId of wanted) {
      if (current.has(playerId)) continue;
      const p = await ex.first<{ archived_at: string | null }>(
        'SELECT archived_at FROM players WHERE id = ?',
        [playerId],
      );
      if (!p) throw new RepositoryError('INVALID_ROSTER', 'A selected player no longer exists.');
      if (p.archived_at) {
        throw new RepositoryError('ARCHIVED', 'Archived players cannot be added to a team.');
      }
    }

    const wantedSet = new Set(wanted);
    for (const playerId of current) {
      if (!wantedSet.has(playerId)) {
        await ex.run('DELETE FROM team_players WHERE team_id = ? AND player_id = ?', [
          teamId,
          playerId,
        ]);
      }
    }
    const now = deps.now();
    for (const playerId of wanted) {
      if (current.has(playerId)) continue;
      await ex.run('INSERT INTO team_players (team_id, player_id, added_at) VALUES (?, ?, ?)', [
        teamId,
        playerId,
        now,
      ]);
    }
  }

  return {
    async list(options: { includeArchived?: boolean } = {}): Promise<TeamSummary[]> {
      const where = options.includeArchived ? '' : 'WHERE t.archived_at IS NULL';
      const rows = await db.all<TeamRow & { player_count: number }>(
        `SELECT t.*, (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id) AS player_count
           FROM teams t ${where}
          ORDER BY t.name COLLATE NOCASE, t.id`,
      );
      return rows.map((r) => ({ ...toTeam(r), playerCount: r.player_count }));
    },

    async get(id: string): Promise<TeamWithRoster | null> {
      const row = await db.first<TeamRow>('SELECT * FROM teams WHERE id = ?', [id]);
      if (!row) return null;
      return { ...toTeam(row), playerIds: await readRoster(db, id) };
    },

    async create(rawName: string, playerIds: string[]): Promise<TeamWithRoster> {
      const name = validateName(rawName, 'Team');
      if (!name.ok) throw new RepositoryError('INVALID_NAME', name.error);
      const id = deps.newId();
      const now = deps.now();
      await db.transaction(async (tx) => {
        await assertNameFree(tx, name.value, null);
        await tx.run(
          'INSERT INTO teams (id, name, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, NULL)',
          [id, name.value, now, now],
        );
        await writeRoster(tx, id, playerIds);
      });
      return (await this.get(id))!;
    },

    /** Renames the team and replaces its roster in one transaction. */
    async update(id: string, rawName: string, playerIds: string[]): Promise<TeamWithRoster> {
      const name = validateName(rawName, 'Team');
      if (!name.ok) throw new RepositoryError('INVALID_NAME', name.error);
      await db.transaction(async (tx) => {
        const row = await getTeamRow(tx, id);
        if (row.archived_at) {
          throw new RepositoryError('ARCHIVED', 'Restore this team before editing it.');
        }
        await assertNameFree(tx, name.value, id);
        await tx.run('UPDATE teams SET name = ?, updated_at = ? WHERE id = ?', [
          name.value,
          deps.now(),
          id,
        ]);
        await writeRoster(tx, id, playerIds);
      });
      return (await this.get(id))!;
    },

    /** Archive instead of delete so that match records can keep pointing at the team. */
    async setArchived(id: string, archived: boolean): Promise<Team> {
      const now = deps.now();
      await db.transaction(async (tx) => {
        const row = await getTeamRow(tx, id);
        if (!archived) await assertNameFree(tx, row.name, id); // name may have been reused
        await tx.run('UPDATE teams SET archived_at = ?, updated_at = ? WHERE id = ?', [
          archived ? now : null,
          now,
          id,
        ]);
      });
      return toTeam(await getTeamRow(db, id));
    },
  };
}

export type TeamRepository = ReturnType<typeof createTeamRepository>;
