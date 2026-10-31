import { describeLastEvent, inningsNotes, matchSummary, resultText } from '../../src/domain/format';
import type { MatchEvent } from '../../src/domain/match';
import { canCloseInnings, computeMatchState, eventsAfterUndo, oversRevision, suggestedTarget } from '../../src/domain/scoring';
import { out, startedMatch } from '../helpers/matchBuilder';

const revise = (overs: number, target: number | null = null, maxOversPerBowler: number | null = null): MatchEvent => ({
  type: 'reviseOvers',
  overs,
  target,
  maxOversPerBowler,
});

describe('ending an innings early', () => {
  it('closes the first innings at any point; the chase is for the runs scored + 1', () => {
    const m = startedMatch({ oversPerInnings: 5 }).balls(4, 1, 0);
    expect(canCloseInnings(m.state)).toBe(true);
    m.event({ type: 'closeInnings' });
    expect(m.state.innings[0]).toMatchObject({ completed: true, endReason: 'closed', runs: 5, legalBalls: 3 });
    expect(m.state.next).toEqual({ type: 'selectOpeners', inningsIndex: 1 });
    expect(canCloseInnings(m.state)).toBe(false);
    expect(m.rejectionOf({ type: 'closeInnings' })).toMatch(/no innings in progress/);
    m.start('b1', 'b2', 'a1');
    expect(m.innings).toMatchObject({ target: 6, oversLimit: 5 });
    expect(inningsNotes(m.state.innings[0])).toEqual(['Innings ended early']);
  });

  it('closing the second innings decides the result on the runs scored', () => {
    const m = startedMatch({ oversPerInnings: 2 }).balls(4, 4, 0, 0, 0, 0).bowler('b2').balls(0, 0, 0, 0, 0, 0);
    m.start('b1', 'b2', 'a1').balls(1, 2).event({ type: 'closeInnings' });
    expect(m.state.result).toEqual({ type: 'winByRuns', winnerTeamId: 'team-a', runs: 5 });
    expect(m.rejectionOf({ type: 'closeInnings' })).toMatch(/no innings in progress/);
    expect(describeLastEvent(m.state, m.events)).toBe('Innings ended early');
  });

  it('works while a new batter or bowler is needed, and undo reopens the innings', () => {
    const m = startedMatch({ oversPerInnings: 5 }).ball({ dismissal: out.bowled() });
    expect(m.state.next.type).toBe('selectBatter');
    m.event({ type: 'closeInnings' });
    expect(m.state.innings[0].endReason).toBe('closed');
    const reopened = computeMatchState(m.setup, eventsAfterUndo(m.events)!);
    expect(reopened.next.type).toBe('selectBatter');
    expect(reopened.innings[0].completed).toBe(false);
  });
});

describe('changing the overs', () => {
  it('in the first innings, both innings get the new overs and the target is not revised', () => {
    const m = startedMatch({ oversPerInnings: 5 }).balls(1, 1, 1);
    expect(oversRevision(m.state)).toMatchObject({ inningsIndex: 0, beforeStart: false, overs: 5, minOvers: 1, maxOvers: 5, target: null });
    m.event(revise(3));
    expect(m.innings).toMatchObject({ oversLimit: 3, plannedOvers: 5, completed: false });
    expect(m.state.setup.rules.oversPerInnings).toBe(3);
    expect(m.setup.rules.oversPerInnings).toBe(5); // the stored setup is never changed
    expect(inningsNotes(m.innings)).toEqual(['Reduced to 3 overs (from 5)']);
    expect(describeLastEvent(m.state, m.events)).toBe('Overs changed to 3');
  });

  it('cannot take away an over that has started, nor add overs beyond the match overs', () => {
    const m = startedMatch({ oversPerInnings: 5 }).balls(0, 0, 0, 0, 0, 0).bowler('b2').balls(0, 0);
    expect(oversRevision(m.state)!.minOvers).toBe(2);
    expect(m.rejectionOf(revise(1))).toBe('Choose from 2 to 5 overs (2 have already been started).');
    expect(m.rejectionOf(revise(6))).toMatch(/Choose from 2 to 5 overs/);
    expect(m.rejectionOf(revise(5))).toBe('Nothing would change.');
    expect(m.rejectionOf(revise(3, 20))).toMatch(/only set for the second innings/);
  });

  it('ends the first innings at once when the new overs have all been bowled', () => {
    const m = startedMatch({ oversPerInnings: 5 }).balls(1, 0, 0, 0, 0, 2).bowler('b2');
    m.event(revise(1));
    expect(m.state.innings[0]).toMatchObject({ completed: true, endReason: 'overs', runs: 3 });
    m.start('b1', 'b2', 'a1');
    expect(m.innings).toMatchObject({ oversLimit: 1, plannedOvers: 5, target: 4, targetRevised: false });
  });

  it('in the innings break, sets the second innings overs and a revised target', () => {
    const m = startedMatch({ oversPerInnings: 2 }).balls(6, 6, 6, 6, 0, 0).bowler('b2').balls(0, 0, 0, 0, 0, 0);
    expect(oversRevision(m.state)).toMatchObject({ inningsIndex: 1, beforeStart: true, overs: 2, target: 25 });
    expect(suggestedTarget(m.state, 1)).toBe(13); // 24 runs in 2 overs, scaled to 1 over, plus 1
    expect(m.rejectionOf(revise(1))).toMatch(/Enter the target/);
    m.event(revise(1, 13));
    expect(m.state.revisedTarget).toBe(13);
    m.start('b1', 'b2', 'a1');
    expect(m.innings).toMatchObject({ oversLimit: 1, target: 13, targetRevised: true });
    expect(inningsNotes(m.innings)).toEqual(['Reduced to 1 over (from 2)', 'Revised target 13']);
    m.balls(6, 6, 1);
    expect(m.state.result).toEqual({ type: 'winByWickets', winnerTeamId: 'team-b', wickets: 10, ballsRemaining: 3, revisedTarget: true });
    expect(resultText(m.setup, m.state.result!)).toBe('Bravo won by 10 wickets (3 balls left) (revised target)');
  });

  it('during the chase; a revised target already passed ends the match', () => {
    const m = startedMatch({ oversPerInnings: 2 }).balls(4, 4, 4, 0, 0, 0).bowler('b2').balls(0, 0, 0, 0, 0, 0);
    m.start('b1', 'b2', 'a1').balls(4, 4);
    expect(oversRevision(m.state)).toMatchObject({ inningsIndex: 1, beforeStart: false, minOvers: 1, target: 13 });
    m.event(revise(1, 8));
    expect(m.state.result).toMatchObject({ type: 'winByWickets', winnerTeamId: 'team-b', revisedTarget: true });
  });

  it('a chase that falls short of a revised target loses by the runs short of it', () => {
    const m = startedMatch({ oversPerInnings: 2 }).balls(4, 4, 4, 0, 0, 0).bowler('b2').balls(0, 0, 0, 0, 0, 0);
    m.start('b1', 'b2', 'a1').balls(1, 0).event(revise(1, 10)).balls(0, 0, 0, 0);
    expect(m.state.result).toEqual({ type: 'winByRuns', winnerTeamId: 'team-a', runs: 8, revisedTarget: true });
    expect(matchSummary(m.state)).toBe('Alpha won by 8 runs (revised target)');
  });

  it('keeps the target unrevised when only the overs change', () => {
    const m = startedMatch({ oversPerInnings: 2 }).balls(1, 0, 0, 0, 0, 0).bowler('b2').balls(0, 0, 0, 0, 0, 0);
    m.event(revise(1, 2)).start('b1', 'b2', 'a1');
    expect(m.innings).toMatchObject({ target: 2, targetRevised: false });
  });

  it('is not possible in a Super Over or once the match is complete', () => {
    const m = startedMatch({ oversPerInnings: 1, playersPerSide: 3 }).balls(1, 0, 0, 0, 0, 0);
    m.start('b1', 'b2', 'a1').balls(1, 0, 0, 0, 0, 0);
    expect(m.rejectionOf(revise(1, 3))).toBe('The match is already complete.');
    m.event({ type: 'superOver' }).start('b1', 'b2', 'a3');
    expect(oversRevision(m.state)).toBeNull();
    expect(m.rejectionOf(revise(1))).toBe('The overs of a Super Over cannot be changed.');
  });

  it('checks the bowling limit against the bowler of the current over and the overs left', () => {
    const m = startedMatch({ oversPerInnings: 6, maxOversPerBowler: 3, playersPerSide: 3 });
    m.balls(0, 0, 0, 0, 0, 0).bowler('b2').balls(0, 0, 0, 0, 0, 0).bowler('b1').balls(0, 0);
    // b1 is in their 2nd over: a limit of 1 would stop them finishing it.
    expect(m.rejectionOf(revise(4, null, 1))).toMatch(/B1 is bowling this over and would bowl more than 1 over/);
    // With at most 2 overs each, b1 can finish this over and b2 and b3 can bowl the 4th.
    m.event(revise(4, null, 2));
    expect(m.state.setup.rules.maxOversPerBowler).toBe(2);
    expect(describeLastEvent(m.state, m.events)).toBe('Overs changed to 4, at most 2 overs per bowler');
  });

  it('is replayed from the events: undo restores the overs and target', () => {
    const m = startedMatch({ oversPerInnings: 5 }).balls(1).event(revise(2));
    const undone = computeMatchState(m.setup, eventsAfterUndo(m.events)!);
    expect(undone.innings[0].oversLimit).toBe(5);
    expect(undone.setup.rules.oversPerInnings).toBe(5);
  });
});
