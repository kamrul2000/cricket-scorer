// Upcoming (scheduled) matches. Starting one is done by the match repository, in the same
// transaction that creates the match (see `create` there), so it can only ever start once.
import { validateSchedule, type ScheduledMatch, type ScheduleInput, type ScheduleStatus } from '../domain/schedule';
import type { Database, SqlExecutor } from './database';
import type { RepositoryDeps } from './deps';
import { RepositoryError } from './RepositoryError';

export interface ScheduleRow {
  id: string;
  team_a_id: string;
  team_b_id: string;
  scheduled_at: string;
  venue: string;
  format_name: string;
  overs_per_innings: number;
  players_per_side: number;
  status: ScheduleStatus;
  match_id: string | null;
  created_at: string;
  updated_at: string;
}

function toSchedule(r: ScheduleRow): ScheduledMatch {
  return {
    id: r.id,
    teamAId: r.team_a_id,
    teamBId: r.team_b_id,
    scheduledAt: r.scheduled_at,
    venue: r.venue,
    formatName: r.format_name,
    oversPerInnings: r.overs_per_innings,
    playersPerSide: r.players_per_side,
    status: r.status,
    matchId: r.match_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function checked(input: ScheduleInput): ScheduleInput {
  const { errors, cleaned } = validateSchedule(input);
  if (errors.length) throw new RepositoryError('INVALID_NAME', errors[0]);
  return cleaned;
}

async function assertTeamsActive(ex: SqlExecutor, input: ScheduleInput) {
  for (const id of [input.teamAId, input.teamBId]) {
    const t = await ex.first<{ archived_at: string | null }>('SELECT archived_at FROM teams WHERE id = ?', [id]);
    if (!t) throw new RepositoryError('NOT_FOUND', 'A chosen team no longer exists.');
    if (t.archived_at) throw new RepositoryError('ARCHIVED', 'Archived teams cannot be scheduled.');
  }
}

export function createScheduleRepository(db: Database, deps: RepositoryDeps) {
  async function requireRow(ex: SqlExecutor, id: string): Promise<ScheduleRow> {
    const row = await ex.first<ScheduleRow>('SELECT * FROM scheduled_matches WHERE id = ?', [id]);
    if (!row) throw new RepositoryError('NOT_FOUND', 'This scheduled match no longer exists.');
    return row;
  }

  return {
    async list(): Promise<ScheduledMatch[]> {
      const rows = await db.all<ScheduleRow>('SELECT * FROM scheduled_matches ORDER BY scheduled_at, id');
      return rows.map(toSchedule);
    },

    async get(id: string): Promise<ScheduledMatch | null> {
      const row = await db.first<ScheduleRow>('SELECT * FROM scheduled_matches WHERE id = ?', [id]);
      return row ? toSchedule(row) : null;
    },

    async create(input: ScheduleInput): Promise<ScheduledMatch> {
      const s = checked(input);
      const id = deps.newId();
      const now = deps.now();
      await db.transaction(async (tx) => {
        await assertTeamsActive(tx, s);
        await tx.run(
          `INSERT INTO scheduled_matches (id, team_a_id, team_b_id, scheduled_at, venue, format_name,
             overs_per_innings, players_per_side, status, match_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', NULL, ?, ?)`,
          [id, s.teamAId, s.teamBId, s.scheduledAt, s.venue, s.formatName, s.oversPerInnings, s.playersPerSide, now, now],
        );
      });
      return (await this.get(id))!;
    },

    /** Edits a schedule that has not started (a cancelled one must be restored first). */
    async update(id: string, input: ScheduleInput): Promise<ScheduledMatch> {
      const s = checked(input);
      await db.transaction(async (tx) => {
        const row = await requireRow(tx, id);
        if (row.status !== 'scheduled') {
          throw new RepositoryError('CONFLICT', row.status === 'started' ? 'This match has already started.' : 'Restore this match before editing it.');
        }
        await assertTeamsActive(tx, s);
        await tx.run(
          `UPDATE scheduled_matches SET team_a_id = ?, team_b_id = ?, scheduled_at = ?, venue = ?, format_name = ?,
             overs_per_innings = ?, players_per_side = ?, updated_at = ? WHERE id = ?`,
          [s.teamAId, s.teamBId, s.scheduledAt, s.venue, s.formatName, s.oversPerInnings, s.playersPerSide, deps.now(), id],
        );
      });
      return (await this.get(id))!;
    },

    /** Cancels a scheduled match, or restores a cancelled one. A started match cannot change. */
    async setCancelled(id: string, cancelled: boolean): Promise<ScheduledMatch> {
      const from = cancelled ? 'scheduled' : 'cancelled';
      const to = cancelled ? 'cancelled' : 'scheduled';
      const r = await db.run('UPDATE scheduled_matches SET status = ?, updated_at = ? WHERE id = ? AND status = ?', [
        to,
        deps.now(),
        id,
        from,
      ]);
      if (r.changes === 0) {
        const row = await requireRow(db, id);
        throw new RepositoryError('CONFLICT', row.status === 'started' ? 'This match has already started.' : 'This match was changed elsewhere. Reload and try again.');
      }
      return (await this.get(id))!;
    },
  };
}

export type ScheduleRepository = ReturnType<typeof createScheduleRepository>;
