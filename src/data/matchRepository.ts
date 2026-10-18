// Stores matches: the setup snapshot plus the ordered event history.
// This layer does not know cricket rules; the match service checks events with the scoring
// engine before calling `appendEvent`.
import type { MatchEvent, MatchSetup, TossDecision } from '../domain/match';
import type { Database } from './database';
import type { RepositoryDeps } from './deps';
import {
  DamagedRowError,
  EVENT_COLUMNS,
  eventToRow,
  rowToEvent,
  rowValues,
  type EventRow,
  type EventToStore,
} from './matchEventRows';
import { RepositoryError } from './RepositoryError';

export type MatchStatus = 'inProgress' | 'completed';

export interface MatchSummary {
  id: string;
  status: MatchStatus;
  teamAName: string;
  teamBName: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMatch {
  id: string;
  status: MatchStatus;
  createdAt: string;
  updatedAt: string;
  setup: MatchSetup;
  events: MatchEvent[];
}

/** Values the service recomputes from the engine on every change. */
export interface MatchRowUpdate {
  status: MatchStatus;
  summary: string;
}

interface MatchRow {
  id: string;
  status: MatchStatus;
  team_a_id: string;
  team_a_name: string;
  team_b_id: string;
  team_b_name: string;
  overs_per_innings: number;
  players_per_side: number;
  free_hit_after_no_ball: number;
  max_overs_per_bowler: number | null;
  toss_winner_team_id: string;
  toss_decision: TossDecision;
  summary: string;
  event_count: number;
  created_at: string;
  updated_at: string;
}

const INSERT_EVENT_SQL = `INSERT INTO match_events (match_id, created_at, ${EVENT_COLUMNS.join(', ')})
  VALUES (?, ?, ${EVENT_COLUMNS.map(() => '?').join(', ')})`;

/** Testing aid: makes a write fail after its rows were written, to prove rollback works. */
export interface WriteOptions {
  failBeforeCommit?: boolean;
}

function simulatedFailure(options?: WriteOptions) {
  if (options?.failBeforeCommit) throw new Error('Simulated save failure (developer setting). Nothing was saved.');
}

export function createMatchRepository(db: Database, deps: RepositoryDeps) {
  return {
    async create(setup: MatchSetup, first: EventToStore, update: MatchRowUpdate, options?: WriteOptions): Promise<string> {
      const id = deps.newId();
      const now = deps.now();
      const [a, b] = setup.teams;
      const r = setup.rules;
      await db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO matches (id, status, team_a_id, team_a_name, team_b_id, team_b_name,
             overs_per_innings, players_per_side, free_hit_after_no_ball, max_overs_per_bowler,
             toss_winner_team_id, toss_decision, summary, event_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [
            id,
            update.status,
            a.teamId,
            a.name,
            b.teamId,
            b.name,
            r.oversPerInnings,
            r.playersPerSide,
            r.freeHitAfterNoBall ? 1 : 0,
            r.maxOversPerBowler,
            setup.toss.winnerTeamId,
            setup.toss.decision,
            update.summary,
            now,
            now,
          ],
        );
        for (const team of setup.teams) {
          for (let i = 0; i < team.players.length; i++) {
            const p = team.players[i];
            await tx.run(
              'INSERT INTO match_players (match_id, team_id, player_id, lineup_order, player_name) VALUES (?, ?, ?, ?, ?)',
              [id, team.teamId, p.playerId, i, p.name],
            );
          }
        }
        await tx.run(INSERT_EVENT_SQL, [id, now, ...rowValues(eventToRow(0, first))]);
        simulatedFailure(options);
      });
      return id;
    },

    async list(): Promise<MatchSummary[]> {
      const rows = await db.all<MatchRow>('SELECT * FROM matches ORDER BY updated_at DESC, id');
      return rows.map((m) => ({
        id: m.id,
        status: m.status,
        teamAName: m.team_a_name,
        teamBName: m.team_b_name,
        summary: m.summary,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      }));
    },

    /** Loads a match. Throws RepositoryError('DAMAGED') if stored rows are inconsistent. */
    async load(id: string): Promise<StoredMatch | null> {
      const m = await db.first<MatchRow>('SELECT * FROM matches WHERE id = ?', [id]);
      if (!m) return null;
      const players = await db.all<{ team_id: string; player_id: string; player_name: string }>(
        'SELECT team_id, player_id, player_name FROM match_players WHERE match_id = ? ORDER BY lineup_order',
        [id],
      );
      const rows = await db.all<EventRow>(
        `SELECT ${EVENT_COLUMNS.join(', ')} FROM match_events WHERE match_id = ? ORDER BY seq`,
        [id],
      );

      if (rows.length !== m.event_count || rows.some((row, i) => row.seq !== i)) {
        throw new RepositoryError('DAMAGED', 'The saved history of this match is incomplete.');
      }
      let events: MatchEvent[];
      try {
        events = rows.map(rowToEvent);
      } catch (e) {
        if (e instanceof DamagedRowError) throw new RepositoryError('DAMAGED', e.message);
        throw e;
      }

      const lineup = (teamId: string) =>
        players.filter((p) => p.team_id === teamId).map((p) => ({ playerId: p.player_id, name: p.player_name }));
      const setup: MatchSetup = {
        rules: {
          oversPerInnings: m.overs_per_innings,
          playersPerSide: m.players_per_side,
          freeHitAfterNoBall: m.free_hit_after_no_ball === 1,
          maxOversPerBowler: m.max_overs_per_bowler,
        },
        teams: [
          { teamId: m.team_a_id, name: m.team_a_name, players: lineup(m.team_a_id) },
          { teamId: m.team_b_id, name: m.team_b_name, players: lineup(m.team_b_id) },
        ],
        toss: { winnerTeamId: m.toss_winner_team_id, decision: m.toss_decision },
      };
      return { id: m.id, status: m.status, createdAt: m.created_at, updatedAt: m.updated_at, setup, events };
    },

    /**
     * Appends one event as the `expectedSeq`-th event, in one transaction with the match row
     * update. Fails with CONFLICT if the stored history has a different length (for example a
     * duplicate submission), so the same action can never be stored twice.
     */
    async appendEvent(
      matchId: string,
      expectedSeq: number,
      item: EventToStore,
      update: MatchRowUpdate,
      options?: WriteOptions,
    ): Promise<void> {
      await db.transaction(async (tx) => {
        const m = await tx.first<{ event_count: number }>('SELECT event_count FROM matches WHERE id = ?', [matchId]);
        if (!m) throw new RepositoryError('NOT_FOUND', 'This match no longer exists.');
        if (m.event_count !== expectedSeq) {
          throw new RepositoryError('CONFLICT', 'The saved match is not in the expected state. Reload and try again.');
        }
        const now = deps.now();
        await tx.run(INSERT_EVENT_SQL, [matchId, now, ...rowValues(eventToRow(expectedSeq, item))]);
        await tx.run('UPDATE matches SET event_count = ?, status = ?, summary = ?, updated_at = ? WHERE id = ?', [
          expectedSeq + 1,
          update.status,
          update.summary,
          now,
          matchId,
        ]);
        simulatedFailure(options);
      });
    },

    /** Deletes the latest event (undo), provided the history has `expectedCount` events. */
    async removeLastEvent(
      matchId: string,
      expectedCount: number,
      update: MatchRowUpdate,
      options?: WriteOptions,
    ): Promise<void> {
      await db.transaction(async (tx) => {
        const m = await tx.first<{ event_count: number }>('SELECT event_count FROM matches WHERE id = ?', [matchId]);
        if (!m) throw new RepositoryError('NOT_FOUND', 'This match no longer exists.');
        if (m.event_count !== expectedCount || expectedCount < 1) {
          throw new RepositoryError('CONFLICT', 'The saved match is not in the expected state. Reload and try again.');
        }
        const result = await tx.run('DELETE FROM match_events WHERE match_id = ? AND seq = ?', [matchId, expectedCount - 1]);
        if (result.changes !== 1) throw new RepositoryError('DAMAGED', 'The last event of this match could not be found.');
        await tx.run('UPDATE matches SET event_count = ?, status = ?, summary = ?, updated_at = ? WHERE id = ?', [
          expectedCount - 1,
          update.status,
          update.summary,
          deps.now(),
          matchId,
        ]);
        simulatedFailure(options);
      });
    },

    /** Permanently deletes a match and its history (lineup and events cascade). */
    async delete(matchId: string): Promise<void> {
      const r = await db.run('DELETE FROM matches WHERE id = ?', [matchId]);
      if (r.changes === 0) throw new RepositoryError('NOT_FOUND', 'This match no longer exists.');
    },

    /** Number of matches a team played in (shown when archiving). */
    async countForTeam(teamId: string): Promise<number> {
      const r = await db.first<{ n: number }>(
        'SELECT COUNT(*) AS n FROM matches WHERE team_a_id = ? OR team_b_id = ?',
        [teamId, teamId],
      );
      return r?.n ?? 0;
    },
  };
}

export type MatchRepository = ReturnType<typeof createMatchRepository>;
