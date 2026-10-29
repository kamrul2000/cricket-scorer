import { teamSizeText } from '../../src/domain/format';
import { validateMatchSetup } from '../../src/domain/setupValidation';
import { makeSetup, out, TestMatch } from '../helpers/matchBuilder';

describe('teams with different numbers of players', () => {
  it('each side is all out when only one of its own batters is left; the margin uses the chasing side', () => {
    const m = new TestMatch(makeSetup({ playersPerSide: 3, playersB: 2, oversPerInnings: 2 })).start('a1', 'a2', 'b1');
    expect(teamSizeText(m.setup)).toBe('3 v 2 players');
    expect(m.innings.wicketsLimit).toBe(2);
    m.ball({ dismissal: out.bowled() }).batter('a3');
    expect(m.state.next.type).toBe('delivery'); // 1 wicket of 2: not all out
    m.ball({ boundary: 'four' }).ball({ dismissal: out.bowled() });
    expect(m.state.innings[0]).toMatchObject({ completed: true, endReason: 'allOut', wickets: 2, runs: 4 });

    m.start('b1', 'b2', 'a1');
    expect(m.innings.wicketsLimit).toBe(1);
    m.ball({ boundary: 'six' });
    expect(m.state.result).toEqual({ type: 'winByWickets', winnerTeamId: 'team-b', wickets: 1, ballsRemaining: 11 });
  });

  it('equal sizes are still shown as "a side"', () => {
    expect(teamSizeText(makeSetup({ playersPerSide: 7 }))).toBe('7 a side');
  });

  it('checks the maximum overs per bowler against each bowling side', () => {
    expect(validateMatchSetup(makeSetup({ oversPerInnings: 20, playersPerSide: 5, maxOversPerBowler: 4 }))).toEqual([]);
    const errors = validateMatchSetup(makeSetup({ oversPerInnings: 20, playersPerSide: 5, playersB: 4, maxOversPerBowler: 4 }));
    expect(errors.join(' ')).toMatch(/4 players \(Bravo\).*cannot be bowled/);
  });
});
