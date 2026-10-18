import { describeLastEvent, economy, formatAverage, formatRate, resultText, runRate, strikeRate } from '../../src/domain/format';
import { canSwapBatters, eventsAfterUndo, computeMatchState } from '../../src/domain/scoring';
import { playerCareer } from '../../src/domain/stats';
import { out, startedMatch } from '../helpers/matchBuilder';

describe('partnerships', () => {
  it('tracks team runs (with extras), each batter’s bat runs, and balls faced (not wides)', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ runs: 1 }) // a1 1 -> a2 on strike
      .ball({ boundary: 'four' }) // a2 4
      .ball({ ballType: 'wide', runs: 0 }) // 1 wide, no ball faced
      .ball({ runsFrom: 'legByes', runs: 2 }); // 2 leg byes, ball faced, no bat runs
    const [p] = m.innings.partnerships;
    expect(p).toEqual({ number: 1, batterIds: ['a1', 'a2'], batterRuns: [1, 4], runs: 8, balls: 3, broken: false });
  });

  it('a wicket breaks the partnership; the survivor and the new batter start the next one', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ runs: 2 }).ball({ dismissal: out.bowled() }).batter('a3').ball({ runs: 3 });
    const [first, second] = m.innings.partnerships;
    expect(first).toMatchObject({ number: 1, runs: 2, balls: 2, broken: true });
    expect(second).toMatchObject({ number: 2, batterIds: ['a2', 'a3'], batterRuns: [0, 3], runs: 3, broken: false });
  });

  it('after a run out of the non-striker, the striker partners the new batter', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ runs: 1, dismissal: out.runOut('a2', 'striker') }).batter('a3');
    expect(m.innings.partnerships[1].batterIds).toEqual(['a1', 'a3']);
  });

  it('partnership runs always add up to the innings total', () => {
    const m = startedMatch({ oversPerInnings: 2, playersPerSide: 4, freeHitAfterNoBall: false });
    m.ball({ runs: 1 })
      .ball({ ballType: 'noBall', runs: 2 })
      .ball({ dismissal: out.caught('b2') })
      .batter('a3')
      .ball({ ballType: 'wide', boundary: 'four' })
      .ball({ boundary: 'six' })
      .ball({ runs: 1, dismissal: out.runOut('a3', 'nonStriker') })
      .batter('a4');
    const inn = m.innings;
    expect(inn.partnerships.reduce((s, p) => s + p.runs, 0)).toBe(inn.runs);
    expect(inn.partnerships.map((p) => p.broken)).toEqual([true, true, false]);
  });
});

describe('over-by-over summary', () => {
  it('records runs and wickets per over, the running total, and whether the over is complete', () => {
    const m = startedMatch({ oversPerInnings: 3 });
    m.ball({ runs: 1 }).ball({ ballType: 'wide' }).balls(0, 4, 0, 0).ball({ dismissal: out.bowled() });
    m.batter('a3').bowler('b2').ball({ runs: 2 });
    expect(m.innings.overs).toEqual([
      { over: 0, bowlerId: 'b1', runs: 6, wickets: 1, legalBalls: 6, totalRuns: 6, totalWickets: 1, complete: true },
      { over: 1, bowlerId: 'b2', runs: 2, wickets: 0, legalBalls: 1, totalRuns: 8, totalWickets: 1, complete: false },
    ]);
  });

  it('is recomputed after undo', () => {
    const m = startedMatch({ oversPerInnings: 3 });
    m.balls(1, 1, 1, 1, 1, 1);
    m.events = eventsAfterUndo(m.events)!;
    expect(m.innings.overs[0]).toMatchObject({ runs: 5, legalBalls: 5, complete: false });
  });
});

describe('swap batters (scorer correction)', () => {
  it('swaps striker and non-striker without a ball, runs or other changes', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ runs: 2 });
    const before = m.innings;
    m.events.push({ type: 'swapBatters' });
    const after = m.innings;
    expect([after.strikerId, after.nonStrikerId]).toEqual(['a2', 'a1']);
    expect(after.legalBalls).toBe(before.legalBalls);
    expect(after.runs).toBe(before.runs);
    expect(after.batters).toEqual(before.batters);
    expect(after.strikeSwaps).toEqual([{ eventIndex: 2, legalBalls: 1 }]);
    expect(describeLastEvent(m.state, m.events)).toMatch(/scorer correction/);
    // The next ball is faced by the new striker and credited to them.
    m.ball({ runs: 4 });
    expect(m.innings.batters.find((b) => b.playerId === 'a2')!.runs).toBe(4);
    expect(m.innings.partnerships[0].batterRuns).toEqual([2, 4]);
  });

  it('is allowed between overs, but not while a new batter must be chosen, or after the innings', () => {
    const m = startedMatch({ oversPerInnings: 1 });
    m.balls(0, 0, 0, 0, 0);
    m.ball({ runs: 0 });
    expect(m.state.next.type).toBe('selectOpeners'); // 1-over innings finished
    expect(canSwapBatters(m.state)).toBe(false);
    expect(m.rejectionOf({ type: 'swapBatters' })).toMatch(/only be swapped while an innings is in progress/);

    const n = startedMatch({ oversPerInnings: 2 });
    n.balls(0, 0, 0, 0, 0, 0);
    expect(n.state.next.type).toBe('selectBowler');
    expect(canSwapBatters(n.state)).toBe(true);
    n.events.push({ type: 'swapBatters' });
    expect(n.state.next.type).toBe('selectBowler');

    const w = startedMatch({ oversPerInnings: 2 });
    w.ball({ dismissal: out.bowled() });
    expect(canSwapBatters(w.state)).toBe(false);
    expect(w.rejectionOf({ type: 'swapBatters' })).toMatch(/Choose the new batter/);
  });

  it('undo removes the swap', () => {
    const m = startedMatch();
    m.events.push({ type: 'swapBatters' });
    m.events = eventsAfterUndo(m.events)!;
    expect([m.innings.strikerId, m.innings.nonStrikerId]).toEqual(['a1', 'a2']);
    expect(m.innings.strikeSwaps).toEqual([]);
  });
});

describe('abandoned match (no result)', () => {
  it('ends the match with no result and closes the current innings', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.balls(1, 4);
    m.events.push({ type: 'abandon' });
    const s = m.state;
    expect(s.result).toEqual({ type: 'noResult' });
    expect(s.next.type).toBe('matchComplete');
    expect(s.innings[0]).toMatchObject({ completed: true, endReason: 'abandoned', runs: 5 });
    expect(resultText(s.setup, s.result!)).toBe('No result (match abandoned)');
    expect(m.rejection({ runs: 1 })).toMatch(/already complete/);
    expect(m.rejectionOf({ type: 'abandon' })).toMatch(/already complete/);
  });

  it('can be undone, which reopens the match where it was', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.balls(1);
    m.events.push({ type: 'abandon' });
    m.events = eventsAfterUndo(m.events)!;
    expect(m.state.result).toBeNull();
    expect(m.state.next.type).toBe('delivery');
    expect(m.innings.completed).toBe(false);
  });

  it('cannot abandon a match that already has a result', () => {
    const m = startedMatch({ oversPerInnings: 1 });
    m.balls(0, 0, 0, 0, 0, 0).start('b1', 'b2', 'a1').ball({ runs: 1 });
    expect(m.state.result?.type).toBe('winByWickets');
    expect(m.rejectionOf({ type: 'abandon' })).toMatch(/already complete/);
  });
});

describe('rates, averages and rounding', () => {
  it('formats rates to fixed decimals and never divides by zero', () => {
    expect(strikeRate(2, 3)).toBe('66.7');
    expect(strikeRate(0, 0)).toBe('-');
    expect(economy(7, 4)).toBe('10.50');
    expect(economy(0, 0)).toBe('-');
    expect(formatRate(runRate(100, 120))).toBe('5.00');
    expect(formatAverage(100, 3)).toBe('33.33');
    expect(formatAverage(45, 0)).toBe('-');
  });
});

describe('career statistics', () => {
  it('adds up batting and bowling across matches, with not outs, highest score and best figures', () => {
    // Match 1: a1 bats through the over and is not out; b1 bowls it for 6 runs.
    const m1 = startedMatch({ oversPerInnings: 1 });
    m1.balls(1, 0, 4, 1, 0, 0);
    // Match 2: a1 is bowled for 0 first ball; b1 takes the wicket.
    const m2 = startedMatch({ oversPerInnings: 1 });
    m2.ball({ dismissal: out.bowled() });

    const a1First = m1.innings.batters.find((b) => b.playerId === 'a1')!;
    const career = playerCareer('a1', [m1.state, m2.state]);
    expect(career.matches).toBe(2);
    expect(career.batting).toMatchObject({
      innings: 2,
      notOuts: 1,
      dismissals: 1,
      runs: a1First.runs,
      highest: { runs: a1First.runs, notOut: true },
    });

    const bowler = playerCareer('b1', [m1.state, m2.state]);
    expect(bowler.bowling).toMatchObject({ innings: 2, wickets: 1, legalBalls: 7, runsConceded: 6 });
    expect(bowler.bowling.best).toEqual({ wickets: 1, runs: 0 });
    expect(formatAverage(bowler.bowling.runsConceded, bowler.bowling.wickets)).toBe('6.00');
  });

  it('ignores matches the player was not in, and replaying gives the same figures', () => {
    const m = startedMatch({ oversPerInnings: 1 });
    m.balls(1, 2);
    expect(playerCareer('nobody', [m.state]).matches).toBe(0);
    const replayed = computeMatchState(m.setup, m.events);
    expect(playerCareer('a1', [replayed])).toEqual(playerCareer('a1', [m.state]));
  });
});
