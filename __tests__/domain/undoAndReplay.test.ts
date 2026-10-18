import type { MatchEvent } from '../../src/domain/match';
import { computeMatchState, eventsAfterUndo, ScoringError } from '../../src/domain/scoring';
import { makeSetup, out, startedMatch, TestMatch } from '../helpers/matchBuilder';

/** Undo must give exactly the state that existed before the last event. */
function expectUndoRestores(m: TestMatch) {
  const before = computeMatchState(m.setup, m.events.slice(0, -1));
  const undone = eventsAfterUndo(m.events)!;
  expect(computeMatchState(m.setup, undone)).toEqual(before);
  return undone;
}

describe('undo', () => {
  it('nothing to undo on an empty match', () => {
    expect(eventsAfterUndo([])).toBeNull();
  });

  it('undoes a wide and a no-ball (including the free hit it created)', () => {
    const m = startedMatch().ball({ runs: 1 }).ball({ ballType: 'wide', runs: 2 });
    expectUndoRestores(m);
    m.events = eventsAfterUndo(m.events)!;
    expect(m.innings.extras.wides).toBe(0);

    m.ball({ ballType: 'noBall', runsFrom: 'byes', runs: 1 });
    expect(m.innings.freeHitNext).toBe(true);
    m.events = expectUndoRestores(m);
    expect(m.innings.freeHitNext).toBe(false);
    expect(m.innings.runs).toBe(1);
  });

  it('undoes a wicket, then the new-batter selection separately', () => {
    const m = startedMatch().ball({ runs: 2 }).ball({ dismissal: out.caught('b4') }).batter('a3');
    m.events = expectUndoRestores(m); // removes the batter selection
    expect(m.state.next.type).toBe('selectBatter');
    m.events = expectUndoRestores(m); // removes the wicket
    expect(m.innings.wickets).toBe(0);
    expect(m.innings.batters[0].wicket).toBeNull();
    expect(m.innings.bowlers[0].wickets).toBe(0);
    expect(m.innings.strikerId).toBe('a1');
  });

  it('undoes the ball that completed an over', () => {
    const m = startedMatch().balls(0, 0, 0, 0, 0, 1);
    m.events = expectUndoRestores(m);
    expect(m.innings.legalBalls).toBe(5);
    expect(m.innings.bowlerId).toBe('b1');
    expect(m.innings.bowlers[0].maidens).toBe(0);
    expect(m.state.next.type).toBe('delivery');
  });

  it('undoes the ball that completed the first innings', () => {
    const m = startedMatch({ oversPerInnings: 1 }).balls(0, 0, 0, 0, 0, 4);
    expect(m.state.next.type).toBe('selectOpeners');
    m.events = expectUndoRestores(m);
    expect(m.state.innings).toHaveLength(1);
    expect(m.innings.completed).toBe(false);
  });

  it('undoes the ball that completed the match', () => {
    const m = startedMatch({ oversPerInnings: 1 }).balls(1, 0, 0, 0, 0, 0).start('b1', 'b2', 'a1').ball({ runs: 2 });
    expect(m.state.result?.type).toBe('winByWickets');
    m.events = expectUndoRestores(m);
    expect(m.state.result).toBeNull();
    expect(m.state.next.type).toBe('delivery');
    m.ball({ dismissal: out.bowled() }); // scoring can continue differently
    expect(m.innings.wickets).toBe(1);
  });
});

describe('replay', () => {
  function playFullMatch(): TestMatch {
    const m = startedMatch({ oversPerInnings: 2, playersPerSide: 4 });
    m.ball({ runs: 1 })
      .ball({ ballType: 'wide', runs: 1 })
      .ball({ ballType: 'noBall', runsFrom: 'bat', boundary: 'four' })
      .ball({ runs: 2, dismissal: out.runOut('a1', 'nonStriker', 'b3') })
      .batter('a3')
      .ball({ runsFrom: 'legByes', runs: 1 })
      .ball({ dismissal: out.caught('b2') })
      .batter('a4')
      .ball({ boundary: 'six' })
      .ball({ runs: 0 })
      .bowler('b2')
      .balls(1, 1, 0, 0, 0, 3)
      .start('b1', 'b2', 'a1')
      .ball({ boundary: 'four' })
      .ball({ dismissal: out.stumped('a4') })
      .batter('b3')
      .balls(2, 2, 2, 2);
    return m;
  }

  it('replaying the saved events reproduces the same match state', () => {
    const m = playFullMatch();
    const saved: MatchEvent[] = JSON.parse(JSON.stringify(m.events)); // as if stored and reloaded
    expect(computeMatchState(m.setup, saved)).toEqual(m.state);
  });

  it('every prefix of a match replays without error (resume at any point)', () => {
    const m = playFullMatch();
    for (let i = 0; i <= m.events.length; i++) {
      expect(() => computeMatchState(m.setup, m.events.slice(0, i))).not.toThrow();
    }
  });

  it('a corrupted event log is reported with the failing event index', () => {
    const m = playFullMatch();
    const broken = [...m.events];
    broken.splice(2, 1); // drop a delivery: later batter/bowler snapshots no longer match
    try {
      computeMatchState(m.setup, broken);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ScoringError);
      expect((e as ScoringError).eventIndex).not.toBeNull();
    }
  });

  it('refuses to replay with an invalid setup', () => {
    expect(() => computeMatchState(makeSetup({ oversPerInnings: 0 }), [])).toThrow(ScoringError);
  });
});
