import { deliveryLabel } from '../../src/domain/format';
import { extrasTotal } from '../../src/domain/scoring';
import { startedMatch } from '../helpers/matchBuilder';

describe('extras', () => {
  it('wide: one-run penalty, not a legal ball, not a ball faced, charged to bowler', () => {
    const m = startedMatch().ball({ ballType: 'wide' });
    const inn = m.innings;
    expect(inn.runs).toBe(1);
    expect(inn.extras.wides).toBe(1);
    expect(inn.legalBalls).toBe(0);
    expect(inn.batters[0].ballsFaced).toBe(0);
    expect(inn.bowlers[0]).toMatchObject({ runsConceded: 1, legalBalls: 0, wideBalls: 1 });
    expect(deliveryLabel(inn.deliveries[0])).toBe('1wd');
  });

  it('wide with runs completed and wide to the boundary: all scored as wides (Law 22.7)', () => {
    const m = startedMatch().ball({ ballType: 'wide', runs: 2 });
    expect(m.innings.extras.wides).toBe(3);
    m.ball({ ballType: 'wide', boundary: 'four' });
    expect(m.innings.extras.wides).toBe(8);
    expect(m.innings.bowlers[0].runsConceded).toBe(8);
    expect(m.innings.batters[0].runs).toBe(0);
  });

  it('no-ball off the bat: penalty is a no-ball extra, runs go to the striker', () => {
    const m = startedMatch().ball({ ballType: 'noBall', runsFrom: 'bat', boundary: 'four' });
    const inn = m.innings;
    expect(inn.runs).toBe(5);
    expect(inn.extras).toEqual({ wides: 0, noBalls: 1, byes: 0, legByes: 0 });
    expect(inn.batters[0]).toMatchObject({ runs: 4, ballsFaced: 1, fours: 1 });
    expect(inn.bowlers[0]).toMatchObject({ runsConceded: 5, legalBalls: 0, noBallBalls: 1 });
    expect(inn.legalBalls).toBe(0);
    expect(deliveryLabel(inn.deliveries[0])).toBe('nb+4');
  });

  it('no-ball with byes or leg byes: only the penalty is a no-ball extra (Law 18.10.2)', () => {
    const m = startedMatch().ball({ ballType: 'noBall', runsFrom: 'byes', runs: 2 });
    expect(m.innings.extras).toEqual({ wides: 0, noBalls: 1, byes: 2, legByes: 0 });
    expect(m.innings.bowlers[0].runsConceded).toBe(1);
    expect(deliveryLabel(m.innings.deliveries[0])).toBe('nb+2b');

    // a no-ball is followed by a free hit; that does not affect leg byes
    m.ball({ ballType: 'noBall', runsFrom: 'legByes', runs: 1 });
    expect(m.innings.extras).toEqual({ wides: 0, noBalls: 2, byes: 2, legByes: 1 });
    expect(m.innings.bowlers[0].runsConceded).toBe(2);
  });

  it('byes and leg byes from a fair ball: team runs, not batter or bowler runs', () => {
    const m = startedMatch().ball({ runsFrom: 'byes', boundary: 'four' }).ball({ runsFrom: 'legByes', runs: 2 });
    const inn = m.innings;
    expect(inn.runs).toBe(6);
    expect(inn.extras).toEqual({ wides: 0, noBalls: 0, byes: 4, legByes: 2 });
    expect(inn.batters.map((b) => b.runs)).toEqual([0, 0]);
    expect(inn.batters[0].ballsFaced).toBe(2); // byes and leg byes are still balls faced
    expect(inn.bowlers[0].runsConceded).toBe(0);
    expect(inn.legalBalls).toBe(2);
    expect(inn.batters[0].fours).toBe(0); // a bye boundary is not a four hit by the batter
  });

  it('team total equals batter runs plus all extras', () => {
    const m = startedMatch()
      .balls(1, 2)
      .ball({ ballType: 'wide', runs: 1 })
      .ball({ ballType: 'noBall', runsFrom: 'bat', runs: 3 })
      .ball({ runsFrom: 'legByes', runs: 1 });
    const inn = m.innings;
    const batterTotal = inn.batters.reduce((s, b) => s + b.runs, 0);
    expect(inn.runs).toBe(batterTotal + extrasTotal(inn.extras));
    expect(inn.runs).toBe(1 + 2 + 2 + 4 + 1);
  });

  it('overthrow to the boundary scores the allowance plus runs completed (Law 19.8)', () => {
    const m = startedMatch().ball({ runsFrom: 'bat', runs: 1, boundary: 'overthrowFour' });
    expect(m.innings.batters[0]).toMatchObject({ runs: 5, fours: 0 });
    expect(m.innings.runs).toBe(5);
  });

  describe('invalid combinations are rejected', () => {
    const m = startedMatch();
    it.each([
      [{ ballType: 'wide' as const, runsFrom: 'bat' as const }, /wides/],
      [{ ballType: 'wide' as const, runsFrom: 'legByes' as const, runs: 1 }, /wides/],
      [{ runsFrom: 'byes' as const, boundary: 'six' as const }, /six/i],
      [{ ballType: 'wide' as const, boundary: 'six' as const }, /six/i],
      [{ runsFrom: 'byes' as const, runs: 0 }, /at least one run/],
      [{ runs: 2, boundary: 'four' as const }, /boundary only/],
      [{ runsFrom: null }, /bat, as byes/],
    ])('%j', (input, message) => {
      expect(m.rejection(input)).toMatch(message);
    });
  });
});
