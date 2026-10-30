// Adds players to a match lineup while scoring, when the lineup has fewer players than the team
// size: someone on the team's roster who is not in the match yet, or a new player (created on
// the team's roster first). Joining the lineup is one 'addPlayer' event, checked and saved like
// any other scoring action (so it can be undone).
import { useCallback, useEffect, useState } from 'react';

import { useRepositories } from '../data/AppDataProvider';
import type { MatchEvent } from '../domain/match';
import { openSlots } from '../domain/scoring';
import type { LoadedMatch } from '../services/matchService';
import { errorMessage } from '../utils/errors';
import type { SubmitResult } from './useMatchScoring';

export interface RosterPlayer {
  playerId: string;
  name: string;
}

export type AddResult = { ok: true; playerId: string } | { ok: false; error: string | null };
export type CreateResult = { ok: true; player: RosterPlayer } | { ok: false; error: string };

export interface LineupAdder {
  /** Free places in the team's lineup now. */
  slots: (teamId: string) => number;
  /** Players on the team's roster who are not named in this match (empty when the lineup is full). */
  extras: (teamId: string) => RosterPlayer[];
  /** Puts a roster player into the team's lineup. */
  addExisting: (teamId: string, player: RosterPlayer) => Promise<AddResult>;
  /** Creates a player on the team's roster only (they join the lineup when chosen). */
  createOnRoster: (teamId: string, name: string) => Promise<CreateResult>;
  /** Creates a player on the team's roster and puts them into the lineup. */
  addNew: (teamId: string, name: string) => Promise<AddResult>;
}

export function useLineupAdder(match: LoadedMatch | null, submit: (event: MatchEvent) => Promise<SubmitResult>): LineupAdder {
  const { teams, players } = useRepositories();
  const [rosters, setRosters] = useState<Record<string, RosterPlayer[]>>({});
  const teamIds = match ? match.setup.teams.map((t) => t.teamId).join('\n') : '';

  useEffect(() => {
    if (!teamIds) return;
    let live = true;
    void (async () => {
      try {
        const active = new Map((await players.list()).map((p) => [p.id, p.name]));
        const next: Record<string, RosterPlayer[]> = {};
        for (const teamId of teamIds.split('\n')) {
          const ids = (await teams.get(teamId))?.playerIds ?? [];
          next[teamId] = ids.filter((id) => active.has(id)).map((id) => ({ playerId: id, name: active.get(id)! }));
        }
        if (live) setRosters(next);
      } catch {
        // Without the roster, new players can still be added by name.
      }
    })();
    return () => {
      live = false;
    };
  }, [teamIds, teams, players]);

  const team = useCallback((teamId: string) => match?.state.setup.teams.find((t) => t.teamId === teamId) ?? null, [match]);

  const slots = useCallback((teamId: string) => {
    const t = team(teamId);
    return t && match?.state.next.type !== 'matchComplete' ? openSlots(t) : 0;
  }, [team, match]);

  const extras = useCallback(
    (teamId: string) => {
      if (!match || slots(teamId) === 0) return [];
      const named = new Set(match.state.setup.teams.flatMap((t) => [...t.players, ...(t.substitutes ?? [])].map((p) => p.playerId)));
      return (rosters[teamId] ?? []).filter((p) => !named.has(p.playerId));
    },
    [match, rosters, slots],
  );

  const addExisting = useCallback(
    async (teamId: string, player: RosterPlayer): Promise<AddResult> => {
      const r = await submit({ type: 'addPlayer', teamId, playerId: player.playerId, name: player.name });
      return r.ok ? { ok: true, playerId: player.playerId } : r;
    },
    [submit],
  );

  const createOnRoster = useCallback(
    async (teamId: string, name: string): Promise<CreateResult> => {
      const t = team(teamId);
      if (!t || slots(teamId) === 0) return { ok: false, error: `The ${t?.name ?? ''} lineup is full.` };
      try {
        const p = await players.create(name);
        await teams.addToRoster(teamId, p.id);
        const player = { playerId: p.id, name: p.name };
        setRosters((r) => ({ ...r, [teamId]: [...(r[teamId] ?? []), player] }));
        return { ok: true, player };
      } catch (e) {
        return { ok: false, error: errorMessage(e) };
      }
    },
    [team, slots, players, teams],
  );

  const addNew = useCallback(
    async (teamId: string, name: string): Promise<AddResult> => {
      const created = await createOnRoster(teamId, name);
      return created.ok ? addExisting(teamId, created.player) : created;
    },
    [createOnRoster, addExisting],
  );

  return { slots, extras, addExisting, createOnRoster, addNew };
}
