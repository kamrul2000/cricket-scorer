// Statistics across several matches (career figures), built only from engine match states.
// Averages live here because one innings is not a meaningful sample: within a match the
// scorecard shows runs, balls, strike rate and economy instead.
import type { MatchState } from './scoring';

export interface BattingCareer {
  innings: number;
  notOuts: number;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  /** Highest score; notOut marks e.g. 45*. null before the first innings. */
  highest: { runs: number; notOut: boolean } | null;
  /** Times dismissed = innings - not outs. Average = runs / dismissals. */
  dismissals: number;
}

export interface BowlingCareer {
  innings: number;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  maidens: number;
  /** Best figures in one innings: most wickets, then fewest runs. */
  best: { wickets: number; runs: number } | null;
}

export interface PlayerCareer {
  /** Matches where the player was in a playing lineup. */
  matches: number;
  batting: BattingCareer;
  bowling: BowlingCareer;
}

export function playerCareer(playerId: string, states: readonly MatchState[]): PlayerCareer {
  const batting: BattingCareer = {
    innings: 0,
    notOuts: 0,
    runs: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    fifties: 0,
    hundreds: 0,
    highest: null,
    dismissals: 0,
  };
  const bowling: BowlingCareer = { innings: 0, legalBalls: 0, runsConceded: 0, wickets: 0, maidens: 0, best: null };
  let matches = 0;

  for (const state of states) {
    if (state.setup.teams.some((t) => t.players.some((p) => p.playerId === playerId))) matches += 1;
    for (const inn of state.innings) {
      const b = inn.batters.find((x) => x.playerId === playerId);
      if (b) {
        batting.innings += 1;
        const notOut = b.wicket === null;
        if (notOut) batting.notOuts += 1;
        else batting.dismissals += 1;
        batting.runs += b.runs;
        batting.ballsFaced += b.ballsFaced;
        batting.fours += b.fours;
        batting.sixes += b.sixes;
        if (b.runs >= 100) batting.hundreds += 1;
        else if (b.runs >= 50) batting.fifties += 1;
        const h = batting.highest;
        if (!h || b.runs > h.runs || (b.runs === h.runs && notOut && !h.notOut)) {
          batting.highest = { runs: b.runs, notOut };
        }
      }
      const w = inn.bowlers.find((x) => x.playerId === playerId);
      // Counted as a bowling innings once they have bowled any delivery (legal or not).
      if (w && w.legalBalls + w.wideBalls + w.noBallBalls > 0) {
        bowling.innings += 1;
        bowling.legalBalls += w.legalBalls;
        bowling.runsConceded += w.runsConceded;
        bowling.wickets += w.wickets;
        bowling.maidens += w.maidens;
        const best = bowling.best;
        if (!best || w.wickets > best.wickets || (w.wickets === best.wickets && w.runsConceded < best.runs)) {
          bowling.best = { wickets: w.wickets, runs: w.runsConceded };
        }
      }
    }
  }
  return { matches, batting, bowling };
}
