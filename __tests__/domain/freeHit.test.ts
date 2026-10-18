import { out, startedMatch } from '../helpers/matchBuilder';

describe('free hit (ICC playing condition, optional)', () => {
  it('the delivery after a no-ball is a free hit', () => {
    const m = startedMatch().ball({ ballType: 'noBall' });
    expect(m.innings.freeHitNext).toBe(true);
    m.ball({ runs: 1 });
    expect(m.innings.deliveries[1].isFreeHit).toBe(true);
    expect(m.innings.freeHitNext).toBe(false);
  });

  it('carries over when the free-hit delivery is a wide or another no-ball', () => {
    const m = startedMatch().ball({ ballType: 'noBall' }).ball({ ballType: 'wide' });
    expect(m.innings.freeHitNext).toBe(true);
    m.ball({ ballType: 'noBall' });
    expect(m.innings.freeHitNext).toBe(true);
  });

  it('a wide that is not on a free hit does not create one', () => {
    const m = startedMatch().ball({ ballType: 'wide' });
    expect(m.innings.freeHitNext).toBe(false);
  });

  it('only run out is accepted on a free hit, even when the free hit is a wide', () => {
    const m = startedMatch().ball({ ballType: 'noBall' });
    expect(m.rejection({ dismissal: out.bowled() })).toMatch(/free hit/);
    expect(m.rejection({ dismissal: out.caught('b2') })).toMatch(/free hit/);
    expect(m.rejection({ ballType: 'wide', dismissal: out.stumped('b2') })).toMatch(/free hit/);
    m.ball({ runs: 1, dismissal: out.runOut('a1', 'nonStriker') });
    expect(m.innings.wickets).toBe(1);
  });

  it('a free hit stays pending across a mid-over wicket on a no-ball', () => {
    const m = startedMatch().ball({ ballType: 'noBall', dismissal: out.runOut('a1', 'striker') }).batter('a3');
    expect(m.innings.freeHitNext).toBe(true);
  });

  it('is not applied when the rule is switched off', () => {
    const m = startedMatch({ freeHitAfterNoBall: false }).ball({ ballType: 'noBall' });
    expect(m.innings.freeHitNext).toBe(false);
    m.ball({ dismissal: out.bowled() });
    expect(m.innings.wickets).toBe(1);
  });
});
