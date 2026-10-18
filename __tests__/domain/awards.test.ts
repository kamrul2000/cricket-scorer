import { awardsError, NO_AWARDS, rankBatters, rankBowlers, resolveAwards } from '../../src/domain/awards';
import type { BatterStats, BowlerStats, MatchState } from '../../src/domain/scoring';
import { makeSetup, out, startedMatch } from '../helpers/matchBuilder';

type Bat = Partial<BatterStats> & { playerId: string };
type Bowl = Partial<BowlerStats> & { playerId: string };

/** A minimal match state with the given figures (enough for the award rules). */
function stateWith(innings: { batters?: Bat[]; bowlers?: Bowl[] }[]): MatchState {
  const setup = makeSetup({ playersPerSide: 11 });
  return {
    setup,
    result: { type: 'tie' },
    next: { type: 'matchComplete' },
    innings: innings.map((inn, i) => ({
      battingTeam: setup.teams[i],
      bowlingTeam: setup.teams[1 - i],
      batters: (inn.batters ?? []).map((b) => ({ name: b.playerId, runs: 0, ballsFaced: 0, fours: 0, sixes: 0, wicket: null, ...b })),
      bowlers: (inn.bowlers ?? []).map((b) => ({
        name: b.playerId,
        legalBalls: 6,
        runsConceded: 0,
        wickets: 0,
        maidens: 0,
        wideBalls: 0,
        noBallBalls: 0,
        ...b,
      })),
    })),
  } as unknown as MatchState;
}

const OUT = { kind: 'bowled', playerOutId: 'x', fielderId: null, bowlerId: 'b1', creditedToBowler: true } as const;
const ids = (list: { playerId: string }[]) => list.map((x) => x.playerId);

describe('Best Batter ranking', () => {
  it('most runs first', () => {
    const s = stateWith([{ batters: [{ playerId: 'a1', runs: 10 }, { playerId: 'a2', runs: 30 }] }]);
    expect(ids(rankBatters(s))).toEqual(['a2', 'a1']);
  });

  it('equal runs: fewer balls, then not out, then more boundaries, then batting earlier', () => {
    const s = stateWith([
      {
        batters: [
          { playerId: 'a1', runs: 20, ballsFaced: 15, wicket: OUT },
          { playerId: 'a2', runs: 20, ballsFaced: 10, wicket: OUT },
          { playerId: 'a3', runs: 20, ballsFaced: 10, wicket: null },
          { playerId: 'a4', runs: 20, ballsFaced: 15, wicket: OUT, fours: 3 },
        ],
      },
      { batters: [{ playerId: 'b1', runs: 20, ballsFaced: 15, wicket: OUT }] },
    ]);
    expect(ids(rankBatters(s))).toEqual(['a3', 'a2', 'a4', 'a1', 'b1']);
  });

  it('gives no automatic award when nobody scored', () => {
    const s = stateWith([{ batters: [{ playerId: 'a1' }, { playerId: 'a2' }] }]);
    expect(resolveAwards(s, NO_AWARDS).bestBatter).toBeNull();
  });
});

describe('Best Bowler ranking', () => {
  it('most wickets, then lowest economy, then more balls, then more maidens, then bowling earlier', () => {
    const s = stateWith([
      {
        bowlers: [
          { playerId: 'b1', wickets: 1, runsConceded: 12, legalBalls: 12 }, // economy 6
          { playerId: 'b2', wickets: 2, runsConceded: 30, legalBalls: 12 },
          { playerId: 'b3', wickets: 1, runsConceded: 6, legalBalls: 12 }, // economy 3
          { playerId: 'b4', wickets: 1, runsConceded: 12, legalBalls: 24 }, // economy 3, more balls than b3
          { playerId: 'b5', wickets: 1, runsConceded: 12, legalBalls: 12, maidens: 1 }, // same as b1 + a maiden
        ],
      },
    ]);
    expect(ids(rankBowlers(s))).toEqual(['b2', 'b4', 'b3', 'b5', 'b1']);
  });

  it('only full-over bowlers are eligible when anyone bowled a full over; otherwise anyone who bowled', () => {
    const s = stateWith([{ bowlers: [{ playerId: 'b1', legalBalls: 2, runsConceded: 0 }, { playerId: 'b2', legalBalls: 6, runsConceded: 20 }] }]);
    expect(ids(rankBowlers(s))).toEqual(['b2']);
    const short = stateWith([{ bowlers: [{ playerId: 'b1', legalBalls: 2, runsConceded: 5 }, { playerId: 'b2', legalBalls: 3 }] }]);
    expect(ids(rankBowlers(short))).toEqual(['b2', 'b1']);
    const widesOnly = stateWith([{ bowlers: [{ playerId: 'b1', legalBalls: 0, wideBalls: 2 }] }]);
    expect(rankBowlers(widesOnly)).toEqual([]);
  });
});

describe('overrides and eligibility', () => {
  /** A real 1-over match: a1 and a2 bat for Alpha, b1 bowls; b2 is not used. */
  function realMatch() {
    const m = startedMatch({ oversPerInnings: 1, playersPerSide: 3 });
    m.ball({ runs: 2 }).ball({ runs: 1 }).ball({ boundary: 'four' }).ball({ dismissal: out.bowled() }).batter('a3').balls(0, 0);
    m.start('b1', 'b2', 'a1').ball({ runs: 1 });
    return m;
  }

  it('resolves automatic awards from the real match state', () => {
    const r = resolveAwards(realMatch().state, NO_AWARDS);
    expect(r.bestBatter).toMatchObject({ automatic: true, performance: { playerId: 'a2', runs: 4 } });
    expect(r.bestBowler).toMatchObject({ automatic: true, performance: { playerId: 'b1', wickets: 1 } });
    expect(r.playerOfMatch).toBeNull();
  });

  it('uses a valid override and marks it as chosen by the scorer', () => {
    const s = realMatch().state;
    const r = resolveAwards(s, { playerOfMatchId: 'b1', bestBatterId: 'a1', bestBowlerId: null });
    expect(r.bestBatter).toMatchObject({ automatic: false, performance: { playerId: 'a1' } });
    expect(r.playerOfMatch).toMatchObject({ playerId: 'b1', name: 'B1' });
  });

  it('only players who took part are eligible', () => {
    const s = realMatch().state;
    expect(awardsError(s, { ...NO_AWARDS, playerOfMatchId: 'nobody' })).toMatch(/playing lineups/);
    expect(awardsError(s, { ...NO_AWARDS, bestBatterId: 'b3' })).toMatch(/batted/); // b3 did not bat
    expect(awardsError(s, { ...NO_AWARDS, bestBowlerId: 'b2' })).toMatch(/eligible bowler/); // b2 did not bowl
    // a1 bowled one ball while b1 bowled a full over, so only b1 is eligible.
    expect(awardsError(s, { ...NO_AWARDS, bestBowlerId: 'a1' })).toMatch(/eligible bowler/);
    expect(awardsError(s, { playerOfMatchId: 'a3', bestBatterId: 'b1', bestBowlerId: 'b1' })).toBeNull();
  });

  it('a substitute cannot be Player of the Match', () => {
    const m = realMatch();
    m.setup.teams[0].substitutes = [{ playerId: 'a9', name: 'A9' }];
    expect(awardsError(m.state, { ...NO_AWARDS, playerOfMatchId: 'a9' })).toMatch(/playing lineups/);
  });
});
