// Stores matches: the setup snapshot plus the ordered event history.
// This layer does not know cricket rules; the match service checks events with the scoring
// engine before calling `appendEvent`.
import type { MatchAwards } from '../domain/awards';
import { teamSize, type LineupPlayer, type MatchEvent, type MatchSetup, type TeamLineup, type TossDecision } from '../domain/match';
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
  /** Completed with no result (the match was abandoned). */
  abandoned: boolean;
  /** Set while an in-progress match is paused. */
  pause: MatchPause | null;
  teamAName: string;
  teamBName: string;
  venue: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

/** A match in progress that the scorers paused (rain, bad light, a break, ...). */
export interface MatchPause {
  pausedAt: string;
  /** Short reason such as "Rain", or null when none was given. */
  reason: string | null;
}

export const PAUSE_REASON_MAX_LENGTH = 40;

/** Descriptive details shown on scorecards and exports (not used by the scoring). */
export interface MatchDetails {
  venue: string;
  formatName: string;
}

export const NO_DETAILS: MatchDetails = { venue: '', formatName: '' };

export interface StoredMatch {
  id: string;
  status: MatchStatus;
  createdAt: string;
  updatedAt: string;
  setup: MatchSetup;
  events: MatchEvent[];
  awards: MatchAwards;
  details: MatchDetails;
  pause: MatchPause | null;
}

/** Values the service recomputes from the engine on every change. */
export interface MatchRowUpdate {
  status: MatchStatus;
  summary: string;
  abandoned: boolean;
}

export interface MatchRow {
  id: string;
  status: MatchStatus;
  team_a_id: string;
  team_a_name: string;
  team_b_id: string;
  team_b_name: string;
  overs_per_innings: number;
  /** The larger team size, for information only: the scoring uses team_a_size and team_b_size. */
  players_per_side: number;
  free_hit_after_no_ball: number;
  max_overs_per_bowler: number | null;
  toss_winner_team_id: string;
  toss_decision: TossDecision;
  summary: string;
  event_count: number;
  created_at: string;
  updated_at: string;
  player_of_match_id: string | null;
  best_batter_id: string | null;
  best_bowler_id: string | null;
  venue: string;
  format_name: string;
  /** Players each team fields (schema 8); the lineup rows may name fewer at the start. */
  team_a_size: number;
  team_b_size: number;
  /** 1 = completed with no result (schema 9). */
  abandoned: number;
  /** Set while the match is paused, with the optional reason (schema 9). */
  paused_at: string | null;
  pause_reason: string | null;
}

export interface MatchPlayerRow {
  match_id: string;
  team_id: string;
  player_id: string;
  /** Order within the team's playing lineup, or within its substitutes. */
  lineup_order: number;
  player_name: string;
  is_substitute: number;
  role: 'captain' | 'viceCaptain' | null;
}

/**
 * Rebuilds a stored match from its rows (lineup rows in lineup order, event rows in seq order).
 * Used when loading and when checking a backup. Throws RepositoryError('DAMAGED') if the rows
 * are inconsistent. It does not replay the events; the match service does that.
 */
export function storedMatchFromRows(m: MatchRow, players: readonly MatchPlayerRow[], rows: readonly EventRow[]): StoredMatch {
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

  // Optional parts (substitutes, captain, vice-captain) are only present when recorded, and the
  // team size only when the lineup did not name the whole team.
  const lineup = (teamId: string, name: string, size: number): TeamLineup => {
    const rows = players.filter((p) => p.team_id === teamId);
    const toPlayer = (p: MatchPlayerRow) => ({ playerId: p.player_id, name: p.player_name });
    const team: TeamLineup = { teamId, name, players: rows.filter((p) => !p.is_substitute).map(toPlayer) };
    if (size !== team.players.length) team.size = size;
    const subs = rows.filter((p) => p.is_substitute).map(toPlayer);
    if (subs.length) team.substitutes = subs;
    const captain = rows.find((p) => p.role === 'captain');
    const vice = rows.find((p) => p.role === 'viceCaptain');
    if (captain) team.captainId = captain.player_id;
    if (vice) team.viceCaptainId = vice.player_id;
    return team;
  };
  const setup: MatchSetup = {
    rules: {
      oversPerInnings: m.overs_per_innings,
      freeHitAfterNoBall: m.free_hit_after_no_ball === 1,
      maxOversPerBowler: m.max_overs_per_bowler,
    },
    teams: [lineup(m.team_a_id, m.team_a_name, m.team_a_size), lineup(m.team_b_id, m.team_b_name, m.team_b_size)],
    toss: { winnerTeamId: m.toss_winner_team_id, decision: m.toss_decision },
  };
  const awards: MatchAwards = {
    playerOfMatchId: m.player_of_match_id,
    bestBatterId: m.best_batter_id,
    bestBowlerId: m.best_bowler_id,
  };
  const details: MatchDetails = { venue: m.venue, formatName: m.format_name };
  return { id: m.id, status: m.status, createdAt: m.created_at, updatedAt: m.updated_at, setup, events, awards, details, pause: pauseOf(m) };
}

/** A completed match is never shown as paused. */
function pauseOf(m: MatchRow): MatchPause | null {
  return m.status === 'inProgress' && m.paused_at !== null ? { pausedAt: m.paused_at, reason: m.pause_reason } : null;
}

const INSERT_EVENT_SQL = `INSERT INTO match_events (match_id, created_at, ${EVENT_COLUMNS.join(', ')})
  VALUES (?, ?, ${EVENT_COLUMNS.map(() => '?').join(', ')})`;

/** Testing aid: makes a write fail after its rows were written, to prove rollback works. */
export interface WriteOptions {
  failBeforeCommit?: boolean;
}

export interface CreateOptions extends WriteOptions {
  details?: MatchDetails;
  /** Start this scheduled match: it is marked started in the same transaction, exactly once. */
  scheduleId?: string;
}

function simulatedFailure(options?: WriteOptions) {
  if (options?.failBeforeCommit) throw new Error('Simulated save failure (developer setting). Nothing was saved.');
}

export function createMatchRepository(db: Database, deps: RepositoryDeps) {
  return {
    async create(setup: MatchSetup, first: EventToStore, update: MatchRowUpdate, options?: CreateOptions): Promise<string> {
      const id = deps.newId();
      const now = deps.now();
      const [a, b] = setup.teams;
      const r = setup.rules;
      const details = options?.details ?? NO_DETAILS;
      await db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO matches (id, status, team_a_id, team_a_name, team_b_id, team_b_name,
             overs_per_innings, players_per_side, free_hit_after_no_ball, max_overs_per_bowler,
             toss_winner_team_id, toss_decision, summary, event_count, created_at, updated_at, venue, format_name,
             team_a_size, team_b_size, abandoned)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            update.status,
            a.teamId,
            a.name,
            b.teamId,
            b.name,
            r.oversPerInnings,
            Math.max(teamSize(a), teamSize(b)),
            r.freeHitAfterNoBall ? 1 : 0,
            r.maxOversPerBowler,
            setup.toss.winnerTeamId,
            setup.toss.decision,
            update.summary,
            now,
            now,
            details.venue,
            details.formatName,
            teamSize(a),
            teamSize(b),
            update.abandoned ? 1 : 0,
          ],
        );
        if (options?.scheduleId) {
          // Only a schedule that is still "scheduled" can start; a second attempt changes nothing.
          const started = await tx.run(
            "UPDATE scheduled_matches SET status = 'started', match_id = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'",
            [id, now, options.scheduleId],
          );
          if (started.changes !== 1) {
            throw new RepositoryError('CONFLICT', 'This scheduled match has already been started or was cancelled.');
          }
        }
        for (const team of setup.teams) {
          const role = (playerId: string) =>
            playerId === team.captainId ? 'captain' : playerId === team.viceCaptainId ? 'viceCaptain' : null;
          const groups: [LineupPlayer[], number][] = [
            [team.players, 0],
            [team.substitutes ?? [], 1],
          ];
          for (const [list, isSubstitute] of groups) {
            for (let i = 0; i < list.length; i++) {
              const p = list[i];
              await tx.run(
                `INSERT INTO match_players (match_id, team_id, player_id, lineup_order, player_name, is_substitute, role)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, team.teamId, p.playerId, i, p.name, isSubstitute, isSubstitute ? null : role(p.playerId)],
              );
            }
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
        abandoned: m.abandoned === 1,
        pause: pauseOf(m),
        teamAName: m.team_a_name,
        teamBName: m.team_b_name,
        venue: m.venue,
        summary: m.summary,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      }));
    },

    /** Loads a match. Throws RepositoryError('DAMAGED') if stored rows are inconsistent. */
    async load(id: string): Promise<StoredMatch | null> {
      const m = await db.first<MatchRow>('SELECT * FROM matches WHERE id = ?', [id]);
      if (!m) return null;
      const players = await db.all<MatchPlayerRow>(
        'SELECT * FROM match_players WHERE match_id = ? ORDER BY is_substitute, lineup_order',
        [id],
      );
      const rows = await db.all<EventRow>(
        `SELECT ${EVENT_COLUMNS.join(', ')} FROM match_events WHERE match_id = ? ORDER BY seq`,
        [id],
      );
      return storedMatchFromRows(m, players, rows);
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
        await tx.run('UPDATE matches SET event_count = ?, status = ?, summary = ?, abandoned = ?, updated_at = ? WHERE id = ?', [
          expectedSeq + 1,
          update.status,
          update.summary,
          update.abandoned ? 1 : 0,
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
        await tx.run('UPDATE matches SET event_count = ?, status = ?, summary = ?, abandoned = ?, updated_at = ? WHERE id = ?', [
          expectedCount - 1,
          update.status,
          update.summary,
          update.abandoned ? 1 : 0,
          deps.now(),
          matchId,
        ]);
        simulatedFailure(options);
      });
    },

    /**
     * Replaces the events from `fromSeq` to the end with `items` (an edited delivery and the
     * replayed actions after it), in one transaction with the match row update. The history
     * must still have `expectedCount` events and keeps that length. Each rewritten row keeps
     * the time it was first recorded.
     */
    async replaceEventsFrom(
      matchId: string,
      fromSeq: number,
      expectedCount: number,
      items: readonly EventToStore[],
      update: MatchRowUpdate,
      options?: WriteOptions,
    ): Promise<void> {
      if (fromSeq < 0 || fromSeq + items.length !== expectedCount) {
        throw new RepositoryError('CONFLICT', 'The edited match history has the wrong length.');
      }
      await db.transaction(async (tx) => {
        const m = await tx.first<{ event_count: number }>('SELECT event_count FROM matches WHERE id = ?', [matchId]);
        if (!m) throw new RepositoryError('NOT_FOUND', 'This match no longer exists.');
        if (m.event_count !== expectedCount) {
          throw new RepositoryError('CONFLICT', 'The saved match is not in the expected state. Reload and try again.');
        }
        const times = await tx.all<{ seq: number; created_at: string }>(
          'SELECT seq, created_at FROM match_events WHERE match_id = ? AND seq >= ? ORDER BY seq',
          [matchId, fromSeq],
        );
        if (times.length !== items.length) throw new RepositoryError('DAMAGED', 'The saved history of this match is incomplete.');
        await tx.run('DELETE FROM match_events WHERE match_id = ? AND seq >= ?', [matchId, fromSeq]);
        for (let i = 0; i < items.length; i++) {
          await tx.run(INSERT_EVENT_SQL, [matchId, times[i].created_at, ...rowValues(eventToRow(fromSeq + i, items[i]))]);
        }
        await tx.run('UPDATE matches SET status = ?, summary = ?, abandoned = ?, updated_at = ? WHERE id = ?', [
          update.status,
          update.summary,
          update.abandoned ? 1 : 0,
          deps.now(),
          matchId,
        ]);
        simulatedFailure(options);
      });
    },

    /**
     * Replaces the overs, team sizes, bowling limit and free-hit rule of a match whose history
     * still has `expectedCount` events, none of them a delivery (the service has replayed the
     * history on the new setup first).
     */
    async updateSettings(
      matchId: string,
      expectedCount: number,
      setup: MatchSetup,
      update: MatchRowUpdate,
      options?: WriteOptions,
    ): Promise<void> {
      const [a, b] = setup.teams;
      const r = setup.rules;
      await db.transaction(async (tx) => {
        const m = await tx.first<{ event_count: number }>('SELECT event_count FROM matches WHERE id = ?', [matchId]);
        if (!m) throw new RepositoryError('NOT_FOUND', 'This match no longer exists.');
        if (m.event_count !== expectedCount) {
          throw new RepositoryError('CONFLICT', 'The saved match is not in the expected state. Reload and try again.');
        }
        const balls = await tx.first<{ n: number }>(
          "SELECT COUNT(*) AS n FROM match_events WHERE match_id = ? AND type = 'delivery'",
          [matchId],
        );
        if ((balls?.n ?? 0) > 0) {
          throw new RepositoryError('CONFLICT', 'The first ball has been bowled, so the settings can no longer be changed.');
        }
        await tx.run(
          `UPDATE matches SET overs_per_innings = ?, players_per_side = ?, free_hit_after_no_ball = ?, max_overs_per_bowler = ?,
             team_a_size = ?, team_b_size = ?, status = ?, summary = ?, abandoned = ?, updated_at = ? WHERE id = ?`,
          [
            r.oversPerInnings,
            Math.max(teamSize(a), teamSize(b)),
            r.freeHitAfterNoBall ? 1 : 0,
            r.maxOversPerBowler,
            teamSize(a),
            teamSize(b),
            update.status,
            update.summary,
            update.abandoned ? 1 : 0,
            deps.now(),
            matchId,
          ],
        );
        simulatedFailure(options);
      });
    },

    /** Pauses a match in progress (with an optional short reason), or resumes it (null). */
    async setPause(matchId: string, pause: { reason: string | null } | null): Promise<MatchPause | null> {
      const now = deps.now();
      const r = await db.run(
        "UPDATE matches SET paused_at = ?, pause_reason = ?, updated_at = ? WHERE id = ? AND status = 'inProgress'",
        [pause ? now : null, pause?.reason ?? null, now, matchId],
      );
      if (r.changes === 0) {
        const exists = await db.first<{ id: string }>('SELECT id FROM matches WHERE id = ?', [matchId]);
        throw exists
          ? new RepositoryError('CONFLICT', 'The match is already complete.')
          : new RepositoryError('NOT_FOUND', 'This match no longer exists.');
      }
      return pause ? { pausedAt: now, reason: pause.reason } : null;
    },

    /** Saves the awards (the service checks them against the match first). */
    async setAwards(matchId: string, awards: MatchAwards): Promise<void> {
      const r = await db.run(
        'UPDATE matches SET player_of_match_id = ?, best_batter_id = ?, best_bowler_id = ?, updated_at = ? WHERE id = ?',
        [awards.playerOfMatchId, awards.bestBatterId, awards.bestBowlerId, deps.now(), matchId],
      );
      if (r.changes === 0) throw new RepositoryError('NOT_FOUND', 'This match no longer exists.');
    },

    /** Permanently deletes a match and its history (lineup and events cascade). */
    async delete(matchId: string): Promise<void> {
      const r = await db.run('DELETE FROM matches WHERE id = ?', [matchId]);
      if (r.changes === 0) throw new RepositoryError('NOT_FOUND', 'This match no longer exists.');
    },

    /** IDs of matches where the player is in a lineup (from the start, or joined during play), oldest first. */
    async idsForPlayer(playerId: string): Promise<string[]> {
      const rows = await db.all<{ id: string }>(
        `SELECT m.id FROM matches m
          WHERE EXISTS (SELECT 1 FROM match_players mp WHERE mp.match_id = m.id AND mp.player_id = ?)
             OR EXISTS (SELECT 1 FROM match_events me WHERE me.match_id = m.id AND me.type = 'addPlayer' AND me.player_id = ?)
          ORDER BY m.created_at, m.id`,
        [playerId, playerId],
      );
      return rows.map((r) => r.id);
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
