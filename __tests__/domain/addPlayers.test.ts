// Lineups that name fewer players than the team size, and players joining during the match.
import type { MatchSetup } from '../../src/domain/match';
import {
  bowlerOptions,
  canAddPlayer,
  canEndInnings,
  computeMatchState,
  currentInnings,
  eventsAfterUndo,
  openSlots,
} from '../../src/domain/scoring';
import { validateMatchSetup } from '../../src/domain/setupValidation';
import { makeSetup, out, TestMatch } from '../helpers/matchBuilder';

/** Team size `size` each, but only the named players listed (A bats first). */
function partialSetup(namedA: string[], namedB: string[], size = 11, rules: Parameters<typeof makeSetup>[0] = {}): MatchSetup {
  const s = makeSetup(rules);
  const pick = (ids: string[]) => ids.map((id) => ({ playerId: id, name: id.toUpperCase() }));
  return {
    ...s,
    teams: [
      { ...s.teams[0], size, players: pick(namedA) },
      { ...s.teams[1], size, players: pick(namedB) },
    ],
  };
}

const add = (teamId: 'team-a' | 'team-b', playerId: string) =>
  ({ type: 'addPlayer', teamId, playerId, name: playerId.toUpperCase() }) as const;

describe('team size and named lineup', () => {
  it('a match can start with only the openers and the opening bowler named', () => {
    const m = new TestMatch(partialSetup(['a1', 'a2'], ['b1'])).start('a1', 'a2', 'b1');
    expect(m.innings.wicketsLimit).toBe(10); // all out is decided by the team size, not the names
    expect(openSlots(m.state.setup.teams[0])).toBe(9);
    expect(openSlots(m.state.setup.teams[1])).toBe(10);
  });

  it('even an empty lineup is a valid setup', () => {
    expect(validateMatchSetup(partialSetup([], []))).toEqual([]);
  });

  it('rejects a lineup larger than its team, and a team size outside 2 to 11', () => {
    expect(validateMatchSetup(partialSetup(['a1', 'a2', 'a3'], [], 2)).join(' ')).toMatch(
      /Alpha has 3 players in the lineup, more than its 2 players per side/,
    );
    expect(validateMatchSetup(partialSetup([], [], 12)).join(' ')).toMatch(/Players per side must be from 2 to 11: Alpha has 12\./);
    expect(validateMatchSetup(partialSetup([], [], 1)).join(' ')).toMatch(/Players per side must be from 2 to 11/);
  });

  it('the max-overs check counts players still to join', () => {
    // 4 overs, at most 2 each, team of 2: possible (2 + 2), even with nobody named yet.
    expect(validateMatchSetup(partialSetup([], [], 2, { oversPerInnings: 4, maxOversPerBowler: 2 }))).toEqual([]);
    expect(validateMatchSetup(partialSetup([], [], 2, { oversPerInnings: 5, maxOversPerBowler: 2 })).join(' ')).toMatch(
      /cannot be bowled/,
    );
  });
});

describe('players joining during the match', () => {
  it('after a wicket with no named batter left, a new player joins and comes in', () => {
    const m = new TestMatch(partialSetup(['a1', 'a2'], ['b1'])).start('a1', 'a2', 'b1');
    m.ball({ dismissal: out.bowled() });
    expect(m.state.next).toEqual({ type: 'selectBatter' }); // not all out: 9 places are still free
    m.event(add('team-a', 'a3')).batter('a3');
    expect(m.innings).toMatchObject({ strikerId: 'a3', nonStrikerId: 'a2', wickets: 1 });
    expect(m.state.setup.teams[0].players.map((p) => p.playerId)).toEqual(['a1', 'a2', 'a3']);
  });

  it('a new bowler joins at the end of the over', () => {
    const m = new TestMatch(partialSetup(['a1', 'a2'], ['b1'])).start('a1', 'a2', 'b1');
    m.balls(0, 0, 0, 0, 0, 0);
    expect(bowlerOptions(m.state)).toEqual([expect.objectContaining({ playerId: 'b1', allowed: false })]);
    m.event(add('team-b', 'b2')).bowler('b2');
    expect(m.innings.bowlerId).toBe('b2');
  });

  it('a fielder can join before the catch is recorded', () => {
    const m = new TestMatch(partialSetup(['a1', 'a2'], ['b1'])).start('a1', 'a2', 'b1');
    expect(m.rejection({ dismissal: out.caught('b7') })).toMatch(/fielder must be in the fielding team/);
    m.event(add('team-b', 'b7')).ball({ dismissal: out.caught('b7') });
    expect(m.innings.wickets).toBe(1);
  });

  it('refuses a player already named in the match, a full lineup, an unknown team and a missing name', () => {
    const m = new TestMatch(partialSetup(['a1', 'a2'], ['b1'], 3)).start('a1', 'a2', 'b1');
    expect(m.rejectionOf(add('team-a', 'b1'))).toMatch(/already named for Bravo/);
    expect(m.rejectionOf(add('team-b', 'a1'))).toMatch(/already named for Alpha/);
    m.event(add('team-a', 'a3'));
    expect(canAddPlayer(m.state, 'team-a')).toBe(false);
    expect(m.rejectionOf(add('team-a', 'a4'))).toMatch(/Alpha lineup is full \(3 players\)/);
    expect(m.rejectionOf({ type: 'addPlayer', teamId: 'team-x', playerId: 'x1', name: 'X' })).toMatch(/one of the two teams/);
    expect(m.rejectionOf({ type: 'addPlayer', teamId: 'team-b', playerId: 'b2', name: '  ' })).toMatch(/Choose the player/);
  });

  it('a lineup without a declared size is the whole team and cannot grow', () => {
    const m = new TestMatch(makeSetup({ playersPerSide: 3 })).start('a1', 'a2', 'b1');
    expect(canAddPlayer(m.state, 'team-a')).toBe(false);
    expect(m.rejectionOf(add('team-a', 'a9'))).toMatch(/lineup is full/);
  });

  it('no players can join once the match is complete', () => {
    const m = new TestMatch(partialSetup(['a1', 'a2'], ['b1'])).start('a1', 'a2', 'b1');
    m.event({ type: 'abandon' });
    expect(canAddPlayer(m.state, 'team-a')).toBe(false);
    expect(m.rejectionOf(add('team-a', 'a3'))).toMatch(/already complete/);
  });

  it('undo takes the player out of the lineup again', () => {
    const m = new TestMatch(partialSetup(['a1', 'a2'], ['b1'])).start('a1', 'a2', 'b1');
    m.event(add('team-b', 'b2'));
    const undone = computeMatchState(m.setup, eventsAfterUndo(m.events)!);
    expect(undone.setup.teams[1].players.map((p) => p.playerId)).toEqual(['b1']);
    expect(m.setup.teams[1].players).toHaveLength(1); // the stored setup itself never changes
  });
});

describe('ending an innings when the missing players never came', () => {
  it('the scorer can end the innings when no named batter is left and places are still free', () => {
    const m = new TestMatch(partialSetup(['a1', 'a2'], ['b1'], 5)).start('a1', 'a2', 'b1');
    m.ball({ dismissal: out.bowled() });
    expect(canEndInnings(m.state)).toBe(true);
    m.event({ type: 'endInnings' });
    expect(m.state.innings[0]).toMatchObject({ completed: true, endReason: 'allOut', wickets: 1 });
  });

  it('a full lineup with nobody left is all out at once, as before', () => {
    const m = new TestMatch(partialSetup(['a1', 'a2'], ['b1', 'b2'], 2)).start('a1', 'a2', 'b1');
    m.ball({ dismissal: out.bowled() });
    expect(m.state.innings[0]).toMatchObject({ completed: true, endReason: 'allOut' });
  });

  it('players who join later never change how an earlier innings is replayed', () => {
    // Alpha bat first and end their innings with places still free; Alpha then name a new
    // bowler in the second innings. Replaying the history must give the same first innings.
    const m = new TestMatch(partialSetup(['a1', 'a2'], ['b1', 'b2'], 5)).start('a1', 'a2', 'b1');
    m.ball({ runs: 1 }).ball({ dismissal: out.bowled() }).event({ type: 'endInnings' });
    m.event(add('team-a', 'a3')).start('b1', 'b2', 'a3').ball({ runs: 0 });
    const replayed = computeMatchState(m.setup, m.events);
    expect(replayed.innings[0]).toMatchObject({ runs: 1, wickets: 1, endReason: 'allOut' });
    expect(currentInnings(replayed)!.bowlerId).toBe('a3');
  });
});

describe('the bowling limit with players still to join', () => {
  it('counts the free places as fresh bowlers', () => {
    // 5 overs, at most 1 each, 5 players: only b1 and b2 are named so far.
    const m = new TestMatch(partialSetup(['a1', 'a2'], ['b1', 'b2'], 5, { oversPerInnings: 5, maxOversPerBowler: 1 }));
    m.start('a1', 'a2', 'b1').balls(0, 0, 0, 0, 0, 0);
    expect(bowlerOptions(m.state).find((o) => o.playerId === 'b2')).toMatchObject({ allowed: true });
    m.bowler('b2');
  });
});
