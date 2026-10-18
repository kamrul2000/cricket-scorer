import { deliveryLabel, dismissalText } from '../../src/domain/format';
import { availableBatters } from '../../src/domain/scoring';
import { out, startedMatch } from '../helpers/matchBuilder';

describe('dismissals', () => {
  it.each([
    ['bowled', out.bowled(), 'b B1'],
    ['lbw', out.lbw(), 'lbw b B1'],
    ['hit wicket', out.hitWicket(), 'hit wicket b B1'],
    ['caught', out.caught('b5'), 'c B5 b B1'],
    ['caught and bowled', out.caught('b1'), 'c & b B1'],
    ['stumped', out.stumped('b2'), 'st B2 b B1'],
  ])('%s: striker out, credited to the bowler', (_name, dismissal, text) => {
    const m = startedMatch().ball({ dismissal });
    const inn = m.innings;
    expect(inn.wickets).toBe(1);
    expect(inn.bowlers[0].wickets).toBe(1);
    const w = inn.batters[0].wicket!;
    expect(w).toMatchObject({ playerOutId: 'a1', creditedToBowler: true });
    expect(dismissalText(m.setup, w)).toBe(text);
    expect(inn.batters[0].ballsFaced).toBe(1);
    expect(deliveryLabel(inn.deliveries[0])).toBe('W');
  });

  it('after a striker dismissal the not-out batter stays at their end; the new batter takes strike (Law 18.11)', () => {
    const m = startedMatch().ball({ dismissal: out.caught('b3') });
    expect(m.state.next.type).toBe('selectBatter');
    expect(m.innings.strikerId).toBeNull();
    expect(m.innings.nonStrikerId).toBe('a2');
    expect(availableBatters(m.state)).not.toContain('a1');
    m.batter('a3');
    expect([m.innings.strikerId, m.innings.nonStrikerId]).toEqual(['a3', 'a2']);
  });

  it('a wicket on the last ball of the over: new batter is non-striker for the next over', () => {
    const m = startedMatch().balls(0, 0, 0, 0, 0).ball({ dismissal: out.bowled() });
    expect(m.state.next.type).toBe('selectBatter');
    m.batter('a3');
    expect(m.state.next.type).toBe('selectBowler');
    m.bowler('b2');
    expect([m.innings.strikerId, m.innings.nonStrikerId]).toEqual(['a2', 'a3']);
  });

  it('stumped off a wide: the wide penalty stands and the wicket is the bowler’s (Laws 22.9, 39.4)', () => {
    const m = startedMatch().ball({ ballType: 'wide', dismissal: out.stumped('b2') });
    const inn = m.innings;
    expect(inn.runs).toBe(1);
    expect(inn.extras.wides).toBe(1);
    expect(inn.wickets).toBe(1);
    expect(inn.bowlers[0]).toMatchObject({ wickets: 1, runsConceded: 1 });
    expect(inn.legalBalls).toBe(0);
    expect(deliveryLabel(inn.deliveries[0])).toBe('1wd+W');
  });

  it('hit wicket off a wide is allowed', () => {
    const m = startedMatch().ball({ ballType: 'wide', dismissal: out.hitWicket() });
    expect(m.innings.wickets).toBe(1);
  });

  describe('run out', () => {
    it('is not credited to the bowler, and runs completed before it count (Laws 38.5, 38.6)', () => {
      const m = startedMatch().ball({ runs: 1, dismissal: out.runOut('a2', 'striker', 'b4') });
      const inn = m.innings;
      expect(inn.runs).toBe(1);
      expect(inn.batters[0].runs).toBe(1);
      expect(inn.bowlers[0].wickets).toBe(0);
      expect(inn.bowlers[0].runsConceded).toBe(1);
      expect(inn.batters[1].wicket).toMatchObject({ kind: 'runOut', creditedToBowler: false });
      expect(dismissalText(m.setup, inn.batters[1].wicket!)).toBe('run out (B4)');
      expect(deliveryLabel(inn.deliveries[0])).toBe('1+W');
    });

    it('non-striker run out at the striker’s end after crossing: striker ends at the non-striker’s end', () => {
      const m = startedMatch().ball({ runs: 1, dismissal: out.runOut('a2', 'striker') });
      expect([m.innings.strikerId, m.innings.nonStrikerId]).toEqual([null, 'a1']);
      m.batter('a3');
      expect([m.innings.strikerId, m.innings.nonStrikerId]).toEqual(['a3', 'a1']);
    });

    it('striker run out at the striker’s end without crossing: new batter takes strike', () => {
      const m = startedMatch().ball({ dismissal: out.runOut('a1', 'striker') });
      expect([m.innings.strikerId, m.innings.nonStrikerId]).toEqual([null, 'a2']);
    });

    it('striker run out at the non-striker’s end: non-striker finishes at the striker’s end', () => {
      const m = startedMatch().ball({ dismissal: out.runOut('a1', 'nonStriker') });
      expect([m.innings.strikerId, m.innings.nonStrikerId]).toEqual(['a2', null]);
      m.batter('a3');
      expect([m.innings.strikerId, m.innings.nonStrikerId]).toEqual(['a2', 'a3']);
    });

    it('is possible off a no-ball and off a wide, with penalty and runs counted', () => {
      const m = startedMatch().ball({ ballType: 'noBall', runsFrom: 'bat', runs: 1, dismissal: out.runOut('a1', 'nonStriker') });
      expect(m.innings.runs).toBe(2);
      expect(m.innings.batters[0].runs).toBe(1);
      m.batter('a3');
      m.ball({ ballType: 'wide', runs: 1, dismissal: out.runOut('a3', 'striker') });
      expect(m.innings.extras.wides).toBe(2);
      expect(m.innings.wickets).toBe(2);
    });
  });

  describe('invalid dismissal combinations', () => {
    const m = startedMatch();
    it.each([
      ['caught off a no-ball', { ballType: 'noBall' as const, dismissal: out.caught('b2') }, /no-ball/],
      ['bowled off a wide', { ballType: 'wide' as const, dismissal: out.bowled() }, /wide/],
      ['lbw off a wide', { ballType: 'wide' as const, dismissal: out.lbw() }, /wide/],
      ['stumped off a no-ball', { ballType: 'noBall' as const, dismissal: out.stumped('b2') }, /no-ball/],
      ['hit wicket off a no-ball', { ballType: 'noBall' as const, dismissal: out.hitWicket() }, /no-ball/],
      ['caught with runs', { runs: 1, dismissal: out.caught('b2') }, /No runs/],
      ['bowled with a boundary', { boundary: 'four' as const, dismissal: out.bowled() }, /No runs/],
      ['lbw with leg byes', { runsFrom: 'legByes' as const, runs: 1, dismissal: out.lbw() }, /No runs/],
      ['run out on a boundary', { boundary: 'four' as const, dismissal: out.runOut('a1', 'striker') }, /boundary/],
      ['run out of a player not batting', { dismissal: out.runOut('a5', 'striker') }, /at the crease/],
      ['caught by a batting-side player', { dismissal: out.caught('a3') }, /fielding team/],
      ['stumped by the bowler', { dismissal: out.stumped('b1') }, /wicket-keeper/],
    ])('%s', (_name, input, message) => {
      expect(m.rejection(input)).toMatch(message);
    });
  });
});
