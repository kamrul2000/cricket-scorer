import { chaseInfo, resultText } from '../../src/domain/format';
import { out, startedMatch, TestMatch, makeSetup } from '../helpers/matchBuilder';

/** Plays the first innings of a 1-over match: a1 scores the given runs off six fair balls. */
function firstInnings(runs: number[], opts: Parameters<typeof makeSetup>[0] = {}) {
  const m = startedMatch({ oversPerInnings: 1, ...opts });
  m.balls(...runs);
  return m;
}

describe('innings completion', () => {
  it('ends when the overs are used and asks for second-innings openers', () => {
    const m = firstInnings([1, 0, 0, 0, 0, 0]);
    expect(m.state.innings[0]).toMatchObject({ completed: true, endReason: 'overs', runs: 1 });
    expect(m.state.next).toEqual({ type: 'selectOpeners', inningsIndex: 1 });
  });

  it.each([2, 3, 5, 11])('with %i players per side, all out is %i-1 wickets', (players) => {
    const m = startedMatch({ playersPerSide: players, oversPerInnings: 20 });
    for (let w = 1; w < players; w++) {
      m.ball({ dismissal: out.bowled() });
      if (w < players - 1) {
        expect(m.state.next.type).toBe('selectBatter');
        m.batter(`a${w + 2}`);
        if (m.state.next.type === 'selectBowler') m.bowler(m.innings.previousOverBowlerId === 'b1' ? 'b2' : 'b1');
      }
    }
    expect(m.state.innings[0]).toMatchObject({ completed: true, endReason: 'allOut', wickets: players - 1 });
    expect(m.state.next.type).toBe('selectOpeners');
  });

  it('the second innings is batted by the other team, with target = first innings + 1', () => {
    const m = firstInnings([4, 0, 0, 0, 0, 0]).start('b1', 'b2', 'a1');
    const inn = m.innings;
    expect(inn.battingTeam.teamId).toBe('team-b');
    expect(inn.target).toBe(5);
    expect(chaseInfo(m.state, inn)).toMatchObject({ target: 5, runsNeeded: 5, ballsRemaining: 6 });
  });

  it('respects the toss decision: toss winner choosing to bowl fields first', () => {
    const m = new TestMatch(makeSetup({ tossDecision: 'bowl' }));
    expect(m.rejectionOf({ type: 'inningsStart', strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b1' })).toMatch(/Bravo/);
    m.start('b1', 'b2', 'a1');
    expect(m.innings.battingTeam.teamId).toBe('team-b');
  });

  it('rejects scoring after the innings has ended until openers are chosen', () => {
    const m = firstInnings([0, 0, 0, 0, 0, 0]);
    expect(m.rejectionOf(m.deliveryEvent())).toMatch(/opening batters/);
  });
});

describe('chases and results', () => {
  it('chasing side wins by wickets when it passes the target, ending the match immediately', () => {
    const m = firstInnings([4, 0, 0, 0, 0, 0]).start('b1', 'b2', 'a1');
    m.balls(2, 0).ball({ dismissal: out.bowled() }).batter('b3').ball({ boundary: 'four' });
    const s = m.state;
    expect(s.innings[1]).toMatchObject({ completed: true, endReason: 'targetReached', runs: 6 });
    expect(s.result).toEqual({ type: 'winByWickets', winnerTeamId: 'team-b', wickets: 9, ballsRemaining: 2 });
    expect(resultText(s.setup, s.result!)).toBe('Bravo won by 9 wickets (2 balls left)');
    expect(s.next.type).toBe('matchComplete');
    expect(m.rejectionOf(m.deliveryEvent())).toMatch(/already complete/);
  });

  it('side batting first wins by runs when the chase falls short', () => {
    const m = firstInnings([4, 1, 0, 0, 0, 0]).start('b1', 'b2', 'a1').balls(1, 1, 1, 0, 0, 0);
    expect(m.state.result).toEqual({ type: 'winByRuns', winnerTeamId: 'team-a', runs: 2 });
    expect(resultText(m.setup, m.state.result!)).toBe('Alpha won by 2 runs');
  });

  it('equal scores at the end is a tie', () => {
    const m = firstInnings([2, 0, 0, 0, 0, 0]).start('b1', 'b2', 'a1').balls(1, 1, 0, 0, 0, 0);
    expect(m.state.result).toEqual({ type: 'tie' });
    expect(resultText(m.setup, m.state.result!)).toBe('Match tied');
  });

  it('a tie when the chasing side is all out level', () => {
    const m = firstInnings([1, 0, 0, 0, 0, 0], { playersPerSide: 2 }).start('b1', 'b2', 'a1');
    m.ball({ runs: 1 }).ball({ dismissal: out.bowled() });
    expect(m.state.innings[1].endReason).toBe('allOut');
    expect(m.state.result).toEqual({ type: 'tie' });
  });

  it('the winning boundary counts in full (Law 16.6.3)', () => {
    const m = firstInnings([1, 0, 0, 0, 0, 0]).start('b1', 'b2', 'a1').ball({ boundary: 'six' });
    expect(m.state.innings[1].runs).toBe(6);
    expect(m.state.innings[1].batters[0].runs).toBe(6);
  });

  it('cannot run more runs than needed to win (Law 16.6)', () => {
    const m = firstInnings([1, 0, 0, 0, 0, 0]).start('b1', 'b2', 'a1');
    expect(m.rejection({ runs: 3 })).toMatch(/Only 2 more run/);
    m.ball({ runs: 2 });
    expect(m.state.result?.type).toBe('winByWickets');
  });

  it('a wide or no-ball penalty can win the match; nothing else counts on that delivery', () => {
    const m = firstInnings([1, 0, 0, 0, 0, 0]).start('b1', 'b2', 'a1').ball({ runs: 1 });
    expect(m.rejection({ ballType: 'wide', dismissal: out.stumped('a2') })).toMatch(/penalty already wins/);
    expect(m.rejection({ ballType: 'noBall', runsFrom: 'bat', boundary: 'four' })).toMatch(/penalty already wins/);
    m.ball({ ballType: 'wide' });
    expect(m.state.result).toMatchObject({ type: 'winByWickets', ballsRemaining: 5 });
  });

  it('no run out after the winning run was completed', () => {
    const m = firstInnings([1, 0, 0, 0, 0, 0]).start('b1', 'b2', 'a1');
    expect(m.rejection({ runs: 2, dismissal: out.runOut('b1', 'striker') })).toMatch(/already ended/);
    m.ball({ runs: 1, dismissal: out.runOut('b1', 'striker') }); // one short of winning: allowed
    expect(m.state.innings[1].wickets).toBe(1);
  });

  it('a chasing side of 2 players wins "by 1 wicket"', () => {
    const m = firstInnings([0, 0, 0, 0, 0, 0], { playersPerSide: 2 }).start('b1', 'b2', 'a1').ball({ runs: 1 });
    expect(m.state.result).toMatchObject({ wickets: 1 });
    expect(resultText(m.setup, m.state.result!)).toBe('Bravo won by 1 wicket (5 balls left)');
  });
});
