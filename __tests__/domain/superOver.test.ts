import { rankBatters } from '../../src/domain/awards';
import { matchSummary, resultText } from '../../src/domain/format';
import { canStartSuperOver, computeMatchState, eventsAfterUndo, upcomingInnings } from '../../src/domain/scoring';
import { playerCareer } from '../../src/domain/stats';
import { out, startedMatch } from '../helpers/matchBuilder';

/** A 1-over, 3-a-side match that ends 1 run each: Alpha batted first, Bravo second. */
function tiedMatch() {
  const m = startedMatch({ oversPerInnings: 1, playersPerSide: 3 });
  m.balls(1, 0, 0, 0, 0, 0);
  m.start('b1', 'b2', 'a1').balls(1, 0, 0, 0, 0, 0);
  return m;
}

describe('Super Over', () => {
  it('can only be started when the match is tied', () => {
    const m = tiedMatch();
    expect(m.state.result).toEqual({ type: 'tie' });
    expect(canStartSuperOver(m.state)).toBe(true);

    const won = startedMatch({ oversPerInnings: 1, playersPerSide: 3 });
    won.balls(1, 0, 0, 0, 0, 0).start('b1', 'b2', 'a1').balls(0, 0, 0, 0, 0, 0);
    expect(won.state.result?.type).toBe('winByRuns');
    expect(won.rejectionOf({ type: 'superOver' })).toMatch(/scores are level/);
  });

  it('the side that batted second bats first; one over; two wickets end the innings', () => {
    const m = tiedMatch().event({ type: 'superOver' });
    expect(m.state.result).toBeNull();
    expect(m.state.next).toEqual({ type: 'selectOpeners', inningsIndex: 2 });
    expect(upcomingInnings(m.state)!.battingTeam.teamId).toBe('team-b');
    expect(matchSummary(m.state)).toBe('Match tied, Super Over to come');

    m.start('b1', 'b2', 'a3');
    expect(m.innings).toMatchObject({ index: 2, superOver: 1, oversLimit: 1, wicketsLimit: 2, target: null });
    m.ball({ dismissal: out.bowled() }).batter('b3').ball({ dismissal: out.bowled() });
    expect(m.state.innings[2]).toMatchObject({ completed: true, endReason: 'allOut', wickets: 2, runs: 0 });
    expect(m.state.next).toEqual({ type: 'selectOpeners', inningsIndex: 3 });
  });

  it('the second Super Over innings chases, and reaching the target wins', () => {
    const m = tiedMatch().event({ type: 'superOver' }).start('b1', 'b2', 'a3');
    m.ball({ boundary: 'six' }).balls(0, 0, 0, 0, 0);
    m.start('a1', 'a2', 'b3');
    expect(m.innings.target).toBe(7);
    m.ball({ boundary: 'six' }).ball({ runs: 1 });
    expect(m.state.result).toEqual({ type: 'superOverWin', winnerTeamId: 'team-a', superOvers: 1 });
    expect(resultText(m.setup, m.state.result!)).toBe('Match tied · Alpha won the Super Over');
    expect(canStartSuperOver(m.state)).toBe(false);
  });

  it('after a tied Super Over another can be played, with the ICC eligibility rules', () => {
    const m = tiedMatch().event({ type: 'superOver' }).start('b1', 'b2', 'a3');
    m.ball({ dismissal: out.bowled() }).batter('b3').balls(1, 0, 0, 0, 0); // Bravo 1/1, b1 out
    m.start('a1', 'a2', 'b3').balls(1, 0, 0, 0, 0, 0); // Alpha 1/0
    expect(m.state.result).toEqual({ type: 'superOverTie', superOvers: 1 });
    expect(resultText(m.setup, m.state.result!)).toBe('Match tied · Super Over tied');
    expect(canStartSuperOver(m.state)).toBe(true);

    m.event({ type: 'superOver' });
    const next = upcomingInnings(m.state)!;
    expect(next).toMatchObject({ index: 4, superOver: 2 });
    expect(next.battingTeam.teamId).toBe('team-a'); // batted second in the previous Super Over
    expect(next.ineligibleBowlerIds).toEqual(['a3', 'b3']); // the previous Super Over's bowlers
    expect(next.ineligibleBatterIds).toEqual(['b1']); // dismissed in an earlier Super Over
    expect(m.rejectionOf({ type: 'inningsStart', strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b3' })).toMatch(
      /previous Super Over/,
    );
    m.start('a1', 'a2', 'b2').balls(0, 0, 0, 0, 0, 0);
    expect(m.rejectionOf({ type: 'inningsStart', strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'a1' })).toMatch(
      /dismissed in an earlier Super Over/,
    );
    m.start('b2', 'b3', 'a1').ball({ runs: 1 });
    expect(m.state.result).toEqual({ type: 'superOverWin', winnerTeamId: 'team-b', superOvers: 2 });
    expect(resultText(m.setup, m.state.result!)).toBe('Match tied · Bravo won the 2nd Super Over');
  });

  it('Super Over figures are left out of the awards and career statistics', () => {
    const m = tiedMatch().event({ type: 'superOver' }).start('b1', 'b2', 'a3');
    m.ball({ boundary: 'six' }).ball({ boundary: 'six' });
    expect(m.state.innings[2].batters[0]).toMatchObject({ playerId: 'b1', runs: 12 });
    expect(playerCareer('b1', [m.state]).batting).toMatchObject({ innings: 1, runs: 1 });
    expect(rankBatters(m.state).find((b) => b.playerId === 'b1')!.runs).toBe(1);
  });

  it('abandoning a Super Over leaves the match tied, with no further Super Over', () => {
    const m = tiedMatch().event({ type: 'superOver' }).start('b1', 'b2', 'a3').ball({ runs: 1 });
    m.event({ type: 'abandon' });
    expect(m.state.result).toEqual({ type: 'tie' });
    expect(canStartSuperOver(m.state)).toBe(false);
  });

  it('undoing the start of a Super Over returns to the tie', () => {
    const m = tiedMatch().event({ type: 'superOver' });
    expect(computeMatchState(m.setup, eventsAfterUndo(m.events)!).result).toEqual({ type: 'tie' });
  });
});
