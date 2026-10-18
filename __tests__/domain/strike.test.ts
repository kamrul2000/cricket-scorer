import { startedMatch } from '../helpers/matchBuilder';

describe('strike changes', () => {
  const ends = (m: ReturnType<typeof startedMatch>) => [m.innings.strikerId, m.innings.nonStrikerId];

  it('odd runs change strike, even runs do not', () => {
    const m = startedMatch().ball({ runs: 2 });
    expect(ends(m)).toEqual(['a1', 'a2']);
    m.ball({ runs: 1 });
    expect(ends(m)).toEqual(['a2', 'a1']);
    m.ball({ runs: 3 });
    expect(ends(m)).toEqual(['a1', 'a2']);
  });

  it('uses runs actually run, not team runs: an ordinary four does not change strike', () => {
    const m = startedMatch().ball({ boundary: 'four' });
    expect(ends(m)).toEqual(['a1', 'a2']);
    m.ball({ ballType: 'noBall', runsFrom: 'bat', boundary: 'six' }); // 7 team runs, no crossing
    expect(ends(m)).toEqual(['a1', 'a2']);
  });

  it('a wide alone (1 run) does not change strike; a wide with 1 run run does', () => {
    const m = startedMatch().ball({ ballType: 'wide' });
    expect(ends(m)).toEqual(['a1', 'a2']);
    m.ball({ ballType: 'wide', runs: 1 }); // 2 wides, batters crossed once
    expect(ends(m)).toEqual(['a2', 'a1']);
  });

  it('byes, leg byes and overthrows change strike by runs completed', () => {
    const m = startedMatch().ball({ runsFrom: 'byes', runs: 3 });
    expect(ends(m)).toEqual(['a2', 'a1']);
    m.ball({ runsFrom: 'legByes', runs: 1 });
    expect(ends(m)).toEqual(['a1', 'a2']);
    m.ball({ runs: 1, boundary: 'overthrowFour' }); // 5 runs, crossed once
    expect(ends(m)).toEqual(['a2', 'a1']);
  });

  it('ends swap at the end of the over', () => {
    const m = startedMatch().balls(0, 0, 0, 0, 0, 0);
    expect(ends(m)).toEqual(['a2', 'a1']);
  });

  it('a single off the last ball keeps the same batter on strike for the next over', () => {
    const m = startedMatch().balls(0, 0, 0, 0, 0, 1);
    expect(ends(m)).toEqual(['a1', 'a2']);
  });

  it('wides and no-balls do not complete an over', () => {
    const m = startedMatch().balls(0, 0, 0, 0, 0).ball({ ballType: 'wide' }).ball({ ballType: 'noBall' });
    expect(m.innings.legalBalls).toBe(5);
    expect(m.state.next.type).toBe('delivery');
    expect(ends(m)).toEqual(['a1', 'a2']);
  });
});
