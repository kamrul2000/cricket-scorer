import { bowlerOptions } from '../../src/domain/scoring';
import { canBowlRemainingOvers, validateMatchSetup } from '../../src/domain/setupValidation';
import { makeSetup, startedMatch, TestMatch } from '../helpers/matchBuilder';

const over = (m: TestMatch) => m.balls(0, 0, 0, 0, 0, 0);

describe('bowler rules', () => {
  it('a bowler cannot bowl consecutive overs (Law 17.6)', () => {
    const m = over(startedMatch({ oversPerInnings: 3 }));
    expect(m.rejectionOf({ type: 'newBowler', playerId: 'b1' })).toMatch(/consecutive/);
    const opts = bowlerOptions(m.state);
    expect(opts.find((o) => o.playerId === 'b1')).toMatchObject({ allowed: false });
    expect(opts.find((o) => o.playerId === 'b2')).toMatchObject({ allowed: true });
    m.bowler('b2');
    over(m).bowler('b1'); // allowed again after a gap
    expect(m.innings.bowlerId).toBe('b1');
  });

  it('only fielding-side players can bowl', () => {
    const m = over(startedMatch({ oversPerInnings: 3 }));
    expect(m.rejectionOf({ type: 'newBowler', playerId: 'a3' })).toMatch(/lineup/);
  });

  it('enforces a competition max-overs limit', () => {
    const m = over(startedMatch({ oversPerInnings: 4, playersPerSide: 3, maxOversPerBowler: 2 }));
    m.bowler('b2');
    over(m).bowler('b1');
    over(m);
    expect(m.rejectionOf({ type: 'newBowler', playerId: 'b1' })).toMatch(/consecutive|maximum/);
    m.bowler('b3');
  });

  it('blocks a choice that would make the innings impossible to finish under the limit', () => {
    // 6 overs, 3 bowlers, max 2 each: A B A can still finish (A B A C B C),
    // but A B A B would leave C to bowl the last two overs in a row.
    const m = over(startedMatch({ oversPerInnings: 6, playersPerSide: 3, maxOversPerBowler: 2 }));
    m.bowler('b2');
    over(m).bowler('b1');
    over(m);
    expect(m.rejectionOf({ type: 'newBowler', playerId: 'b2' })).toMatch(/too few eligible bowlers/);
    m.bowler('b3');
  });

  it('canBowlRemainingOvers', () => {
    const caps = (entries: [string, number][]) => new Map(entries);
    expect(canBowlRemainingOvers(2, caps([['x', 2], ['y', 0]]), null)).toBe(false);
    expect(canBowlRemainingOvers(3, caps([['x', 2], ['y', 1]]), null)).toBe(true);
    expect(canBowlRemainingOvers(3, caps([['x', 2], ['y', 1]]), 'x')).toBe(false);
    expect(canBowlRemainingOvers(0, caps([]), null)).toBe(true);
  });
});

describe('match setup validation', () => {
  it('accepts a default setup and equal local teams of 2 to 11', () => {
    expect(validateMatchSetup(makeSetup())).toEqual([]);
    expect(validateMatchSetup(makeSetup({ playersPerSide: 2 }))).toEqual([]);
    expect(validateMatchSetup(makeSetup({ playersPerSide: 7 }))).toEqual([]);
  });

  it.each([
    ['zero overs', { oversPerInnings: 0 }, /Overs per innings/],
    ['fractional overs', { oversPerInnings: 2.5 }, /Overs per innings/],
    ['1 player', { playersPerSide: 1 }, /Players per side/],
    ['12 players', { playersPerSide: 12 }, /Players per side/],
    ['bad max overs', { maxOversPerBowler: 0 }, /Maximum overs/],
  ])('rejects %s', (_n, opts, message) => {
    expect(validateMatchSetup(makeSetup(opts)).join(' ')).toMatch(message);
  });

  it('rejects the same team twice, wrong lineup sizes, and a player in both lineups', () => {
    const s = makeSetup({ playersPerSide: 3 });
    expect(validateMatchSetup({ ...s, teams: [s.teams[0], { ...s.teams[1], teamId: 'team-a' }] }).join(' ')).toMatch(/different teams/);

    const short = { ...s.teams[1], players: s.teams[1].players.slice(0, 2) };
    expect(validateMatchSetup({ ...s, teams: [s.teams[0], short] }).join(' ')).toMatch(/exactly 3 players/);

    const shared = { ...s.teams[1], players: [s.teams[0].players[0], ...s.teams[1].players.slice(1)] };
    expect(validateMatchSetup({ ...s, teams: [s.teams[0], shared] }).join(' ')).toMatch(/more than once/);
  });

  it('rejects a toss winner that is not playing', () => {
    const s = makeSetup();
    expect(validateMatchSetup({ ...s, toss: { winnerTeamId: 'other', decision: 'bat' } }).join(' ')).toMatch(/toss winner/);
  });

  it('rejects a max-overs limit that cannot cover the innings', () => {
    expect(validateMatchSetup(makeSetup({ oversPerInnings: 20, playersPerSide: 4, maxOversPerBowler: 4 })).join(' ')).toMatch(/cannot be bowled/);
    expect(validateMatchSetup(makeSetup({ oversPerInnings: 20, playersPerSide: 5, maxOversPerBowler: 4 }))).toEqual([]);
  });

  it('opening batters must be two different players from the batting side', () => {
    const m = new TestMatch(makeSetup());
    expect(m.rejectionOf({ type: 'inningsStart', strikerId: 'a1', nonStrikerId: 'a1', bowlerId: 'b1' })).toMatch(/different/);
    expect(m.rejectionOf({ type: 'inningsStart', strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'a3' })).toMatch(/bowler/);
  });

  it('a new batter must not have batted already', () => {
    const m = startedMatch().ball({ dismissal: { kind: 'bowled' } });
    expect(m.rejectionOf({ type: 'newBatter', playerId: 'a1' })).toMatch(/already batted/);
    expect(m.rejectionOf({ type: 'newBatter', playerId: 'a2' })).toMatch(/already batted/);
    expect(m.rejectionOf({ type: 'newBatter', playerId: 'b3' })).toMatch(/lineup/);
  });
});
