import { describeLastEvent, economy, matchSummary, strikeRate } from '../../src/domain/format';
import { out, startedMatch } from '../helpers/matchBuilder';

describe('display helpers', () => {
  it('strike rate and economy', () => {
    expect(strikeRate(0, 0)).toBe('-');
    expect(strikeRate(25, 20)).toBe('125.0');
    expect(economy(0, 0)).toBe('-');
    expect(economy(9, 9)).toBe('6.00'); // 9 runs off 1.3 overs
  });

  it('match summary through the match', () => {
    const m = startedMatch({ oversPerInnings: 1 });
    expect(matchSummary(m.state)).toBe('Alpha 0/0 (0 ov)');
    m.balls(4, 0, 0, 0, 0, 0);
    expect(matchSummary(m.state)).toBe('Alpha 4/0 (1 ov), innings break');
    m.start('b1', 'b2', 'a1').ball({ runs: 1 });
    expect(matchSummary(m.state)).toBe('Bravo 1/0 (0.1 ov), need 4 from 5 balls');
    m.ball({ boundary: 'four' });
    expect(matchSummary(m.state)).toBe('Bravo won by 10 wickets (4 balls left)');
  });

  it('describes the last event for the undo confirmation', () => {
    const m = startedMatch().ball({ dismissal: out.caught('b3') });
    expect(describeLastEvent(m.state, m.events)).toBe('Over 1: W (B1 to A1, A1 out)');
    m.batter('a3');
    expect(describeLastEvent(m.state, m.events)).toBe('A3 chosen as the new batter');
  });
});
