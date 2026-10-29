import { battingStatus, describeLastEvent, dismissalText } from '../../src/domain/format';
import {
  availableBatters,
  canEndInnings,
  canRetire,
  computeMatchState,
  currentInnings,
  eventsAfterUndo,
} from '../../src/domain/scoring';
import { playerCareer } from '../../src/domain/stats';
import { out, startedMatch } from '../helpers/matchBuilder';

describe('retired hurt (Law 25.4.2)', () => {
  it('is not a wicket: the new batter takes the retired batter’s place, on strike if they were', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ runs: 2 }).retire('a1', 'hurt');
    const inn = m.innings;
    expect(inn.wickets).toBe(0);
    expect(inn.fallOfWickets).toEqual([]);
    expect(inn).toMatchObject({ strikerId: null, nonStrikerId: 'a2' });
    expect(m.state.next.type).toBe('selectBatter');
    expect(inn.batters[0]).toMatchObject({ playerId: 'a1', runs: 2, wicket: null, retiredHurt: true });
    expect(inn.partnerships[0]).toMatchObject({ broken: false, retired: true });
    expect(battingStatus(m.setup, inn, inn.batters[0])).toBe('retired hurt');
    expect(describeLastEvent(m.state, m.events)).toBe('A1 retired hurt');

    m.batter('a3');
    expect(m.innings.strikerId).toBe('a3');
    // Still the partnership for the 1st wicket: no wicket has fallen.
    expect(m.innings.partnerships[1]).toMatchObject({ number: 1, batterIds: ['a2', 'a3'], broken: false, retired: false });
  });

  it('the batter cannot fill their own place, but resumes at the next vacancy with their score', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ runs: 2 }).retire('a1', 'hurt');
    expect(availableBatters(m.state)).not.toContain('a1');
    expect(m.rejectionOf({ type: 'newBatter', playerId: 'a1' })).toMatch(/just retired/);

    m.batter('a3').ball({ dismissal: out.bowled() });
    expect(availableBatters(m.state)).toContain('a1');
    m.batter('a1').ball({ boundary: 'four' });
    const a1 = m.innings.batters.filter((b) => b.playerId === 'a1');
    expect(a1).toHaveLength(1); // the same scorecard row continues
    expect(a1[0]).toMatchObject({ runs: 6, ballsFaced: 2, retiredHurt: false, wicket: null });
  });

  it('is allowed between overs, but not while a new batter is needed', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.balls(0, 0, 0, 0, 0, 0);
    expect(m.state.next.type).toBe('selectBowler');
    expect(canRetire(m.state)).toBe(true);
    m.retire('a2', 'hurt');
    expect(m.state.next.type).toBe('selectBatter');
    expect(canRetire(m.state)).toBe(false);
    expect(m.rejectionOf({ type: 'retire', playerId: 'a1', retirement: 'hurt' })).toMatch(/new batter/);
    m.batter('a3');
    expect(m.state.next.type).toBe('selectBowler'); // then the next over as usual
  });

  it('only a batter at the crease can retire', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    expect(m.rejectionOf({ type: 'retire', playerId: 'a5', retirement: 'hurt' })).toMatch(/at the crease/);
  });

  it('ends the innings when nobody is left who may bat', () => {
    const m = startedMatch({ oversPerInnings: 5, playersPerSide: 3 });
    m.ball({ dismissal: out.bowled() }).batter('a3');
    m.retire('a2', 'hurt'); // a1 out, a3 batting, a2 cannot replace themselves
    expect(m.state.innings[0]).toMatchObject({ completed: true, endReason: 'allOut', wickets: 1 });
    expect(m.state.next).toEqual({ type: 'selectOpeners', inningsIndex: 1 });
  });

  it('the innings can be ended by hand when only retired-hurt batters are left', () => {
    const m = startedMatch({ oversPerInnings: 5, playersPerSide: 4 });
    m.retire('a1', 'hurt').batter('a3');
    expect(canEndInnings(m.state)).toBe(false);
    m.ball({ dismissal: out.bowled() });
    expect(canEndInnings(m.state)).toBe(false); // a4 has not batted yet
    expect(m.rejectionOf({ type: 'endInnings' })).toMatch(/not batted/);
    m.batter('a4').ball({ dismissal: out.bowled() });
    expect(availableBatters(m.state)).toEqual(['a1']);
    expect(canEndInnings(m.state)).toBe(true);
    m.event({ type: 'endInnings' });
    expect(m.state.innings[0]).toMatchObject({ completed: true, endReason: 'allOut', wickets: 2 });
  });

  it('undo removes the retirement', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ runs: 2 }).retire('a1', 'hurt');
    const undone = computeMatchState(m.setup, eventsAfterUndo(m.events)!);
    expect(currentInnings(undone)).toMatchObject({ strikerId: 'a1', retirements: [] });
    expect(currentInnings(undone)!.batters[0].retiredHurt).toBe(false);
    expect(undone.next.type).toBe('delivery');
  });
});

describe('retired out (Law 25.4.3)', () => {
  it('is a wicket, not credited to the bowler, with a fall of wicket', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ runs: 1 }).retire('a2', 'out');
    const inn = m.innings;
    expect(inn.wickets).toBe(1);
    expect(inn.batters[1].wicket).toMatchObject({ kind: 'retiredOut', bowlerId: null, creditedToBowler: false });
    expect(inn.bowlers[0].wickets).toBe(0);
    expect(inn.fallOfWickets).toEqual([{ wicketNumber: 1, teamRuns: 1, legalBalls: 1, playerOutId: 'a2' }]);
    expect(inn.partnerships[0].broken).toBe(true);
    expect(inn.overs[0]).toMatchObject({ wickets: 1, totalWickets: 1 });
    expect(dismissalText(m.setup, inn.batters[1].wicket!)).toBe('retired out');
    m.batter('a3');
    expect(m.innings).toMatchObject({ strikerId: 'a3', nonStrikerId: 'a1' });
    expect(m.innings.partnerships[1].number).toBe(2);
  });

  it('can be the last wicket of the innings', () => {
    const m = startedMatch({ oversPerInnings: 5, playersPerSide: 2 });
    m.retire('a1', 'out');
    expect(m.state.innings[0]).toMatchObject({ completed: true, endReason: 'allOut', wickets: 1 });
  });
});

describe('career figures', () => {
  it('retired hurt counts as not out, retired out as a dismissal', () => {
    const hurt = startedMatch({ oversPerInnings: 5 }).ball({ runs: 2 }).retire('a1', 'hurt');
    const retiredOut = startedMatch({ oversPerInnings: 5 }).ball({ runs: 2 }).retire('a1', 'out');
    expect(playerCareer('a1', [hurt.state]).batting).toMatchObject({ innings: 1, notOuts: 1, dismissals: 0, runs: 2 });
    expect(playerCareer('a1', [retiredOut.state]).batting).toMatchObject({ innings: 1, notOuts: 0, dismissals: 1, runs: 2 });
  });
});
