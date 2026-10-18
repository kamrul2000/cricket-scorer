// Match awards. Best Batter and Best Bowler are worked out automatically by the transparent,
// deterministic rules below. These are this app's own rules, NOT an official cricket formula.
// The scorer may override either one, and chooses the Player of the Match by hand.
//
// Best Batter: every player who batted (came to the crease) is eligible. Ranked by
//   1. most runs
//   2. fewest balls faced (the higher strike rate)
//   3. not out ahead of out
//   4. most boundaries (4s + 6s)
//   5. batting earlier (first innings before second, then batting position).
//   No automatic award when nobody scored a run.
//
// Best Bowler: players who bowled at least one legal ball are eligible; if anyone bowled a full
// over, only bowlers with at least one full over (6 legal balls) are. Ranked by
//   1. most wickets
//   2. lowest economy (runs conceded per legal ball)
//   3. most legal balls bowled
//   4. most maidens
//   5. bowling earlier (first innings before second, then order of first bowling).
//
// Player of the Match: chosen by the scorer from the two playing lineups (not substitutes).
import { BALLS_PER_OVER } from './match';
import type { MatchState } from './scoring';

/** What is stored for a match. null = not chosen (POM) or automatic (best batter / bowler). */
export interface MatchAwards {
  playerOfMatchId: string | null;
  bestBatterId: string | null;
  bestBowlerId: string | null;
}

export const NO_AWARDS: MatchAwards = { playerOfMatchId: null, bestBatterId: null, bestBowlerId: null };

export interface BattingPerformance {
  playerId: string;
  name: string;
  teamId: string;
  runs: number;
  balls: number;
  notOut: boolean;
  fours: number;
  sixes: number;
}

export interface BowlingPerformance {
  playerId: string;
  name: string;
  teamId: string;
  wickets: number;
  runsConceded: number;
  legalBalls: number;
  maidens: number;
}

/** Eligible batters, best first. */
export function rankBatters(state: MatchState): BattingPerformance[] {
  const list = state.innings.flatMap((inn) =>
    inn.batters.map((b) => ({
      playerId: b.playerId,
      name: b.name,
      teamId: inn.battingTeam.teamId,
      runs: b.runs,
      balls: b.ballsFaced,
      notOut: b.wicket === null,
      fours: b.fours,
      sixes: b.sixes,
    })),
  );
  // Array.prototype.sort is stable, so equal entries keep innings and batting order (rule 5).
  return list.sort(
    (a, b) =>
      b.runs - a.runs ||
      a.balls - b.balls ||
      Number(b.notOut) - Number(a.notOut) ||
      b.fours + b.sixes - (a.fours + a.sixes),
  );
}

/** Eligible bowlers, best first. */
export function rankBowlers(state: MatchState): BowlingPerformance[] {
  const all = state.innings.flatMap((inn) =>
    inn.bowlers
      .filter((b) => b.legalBalls > 0)
      .map((b) => ({
        playerId: b.playerId,
        name: b.name,
        teamId: inn.bowlingTeam.teamId,
        wickets: b.wickets,
        runsConceded: b.runsConceded,
        legalBalls: b.legalBalls,
        maidens: b.maidens,
      })),
  );
  const fullOver = all.filter((b) => b.legalBalls >= BALLS_PER_OVER);
  const eligible = fullOver.length ? fullOver : all;
  // Economy compared without division: a.runs / a.balls < b.runs / b.balls.
  return eligible.sort(
    (a, b) =>
      b.wickets - a.wickets ||
      a.runsConceded * b.legalBalls - b.runsConceded * a.legalBalls ||
      b.legalBalls - a.legalBalls ||
      b.maidens - a.maidens,
  );
}

export interface ResolvedAward<T> {
  performance: T;
  /** true = chosen by the rules above; false = the scorer's override. */
  automatic: boolean;
}

export interface ResolvedAwards {
  playerOfMatch: { playerId: string; name: string; teamId: string } | null;
  bestBatter: ResolvedAward<BattingPerformance> | null;
  bestBowler: ResolvedAward<BowlingPerformance> | null;
}

/** Players in either playing lineup (substitutes excluded). */
export function participants(state: MatchState) {
  return state.setup.teams.flatMap((t) => t.players.map((p) => ({ ...p, teamId: t.teamId })));
}

export function resolveAwards(state: MatchState, awards: MatchAwards): ResolvedAwards {
  const batters = rankBatters(state);
  const bowlers = rankBowlers(state);
  const overrideBatter = awards.bestBatterId ? batters.find((b) => b.playerId === awards.bestBatterId) : undefined;
  const overrideBowler = awards.bestBowlerId ? bowlers.find((b) => b.playerId === awards.bestBowlerId) : undefined;
  const autoBatter = batters[0] && batters[0].runs > 0 ? batters[0] : undefined;
  const pom = awards.playerOfMatchId ? participants(state).find((p) => p.playerId === awards.playerOfMatchId) : undefined;
  return {
    playerOfMatch: pom ?? null,
    bestBatter: overrideBatter
      ? { performance: overrideBatter, automatic: false }
      : autoBatter
        ? { performance: autoBatter, automatic: true }
        : null,
    bestBowler: overrideBowler
      ? { performance: overrideBowler, automatic: false }
      : bowlers[0]
        ? { performance: bowlers[0], automatic: true }
        : null,
  };
}

/** Returns a problem with the chosen awards, or null if they are valid for this match. */
export function awardsError(state: MatchState, awards: MatchAwards): string | null {
  if (awards.playerOfMatchId && !participants(state).some((p) => p.playerId === awards.playerOfMatchId)) {
    return 'The Player of the Match must be in one of the playing lineups.';
  }
  if (awards.bestBatterId && !rankBatters(state).some((b) => b.playerId === awards.bestBatterId)) {
    return 'The Best Batter must be a player who batted in this match.';
  }
  if (awards.bestBowlerId && !rankBowlers(state).some((b) => b.playerId === awards.bestBowlerId)) {
    return 'The Best Bowler must be an eligible bowler in this match (see the award rules).';
  }
  return null;
}
