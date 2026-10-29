import type { DeliveryEvent, DeliveryInput } from '../../src/domain/match';
import { currentInnings, tryEditDelivery } from '../../src/domain/scoring';
import { out, startedMatch } from '../helpers/matchBuilder';

const fair = (runs: number, extra: Partial<DeliveryInput> = {}): DeliveryInput => ({
  ballType: 'fair',
  runsFrom: 'bat',
  runs,
  boundary: 'none',
  dismissal: null,
  ...extra,
});

describe('editing an earlier delivery', () => {
  it('changes the runs and replays later balls, which follow the corrected strike', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    // events: 0 innings start, 1 a1 one run, 2 a2 dot, 3 a2 four
    m.ball({ runs: 1 }).ball({ runs: 0 }).ball({ boundary: 'four' });
    const r = tryEditDelivery(m.setup, m.events, 1, fair(2));
    if (!r.ok) throw new Error(r.error);
    const inn = currentInnings(r.state)!;
    expect(inn.runs).toBe(6);
    // With 2 runs a1 kept the strike, so the later balls were faced by a1.
    expect(inn.batters.find((b) => b.playerId === 'a1')).toMatchObject({ runs: 6, ballsFaced: 3 });
    expect(inn.batters.find((b) => b.playerId === 'a2')).toMatchObject({ runs: 0, ballsFaced: 0 });
    expect((r.events[3] as DeliveryEvent).strikerId).toBe('a1');
    expect(r.events).toHaveLength(m.events.length);
    expect(r.events[0]).toEqual(m.events[0]);
  });

  it('can add a wicket to the latest ball, after which a new batter is needed', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ runs: 0 }).ball({ runs: 0 });
    const r = tryEditDelivery(m.setup, m.events, 2, fair(0, { dismissal: out.caught('b2') }));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.next.type).toBe('selectBatter');
    expect(currentInnings(r.state)!.wickets).toBe(1);
  });

  it('refuses an edit that no longer fits what was recorded after it, and says where', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    // events: 0 start, 1 wicket, 2 new batter, 3 one run
    m.ball({ dismissal: out.bowled() }).batter('a3').ball({ runs: 1 });
    const r = tryEditDelivery(m.setup, m.events, 1, fair(0));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/does not fit what was recorded after it \(saved action 3: .*\) .*undo back to this ball/);
  });

  it('refuses an edit that is invalid in itself, with the usual message', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ runs: 1 });
    const r = tryEditDelivery(m.setup, m.events, 1, { ...fair(0), ballType: 'wide' });
    expect(!r.ok && r.error).toMatch(/All runs from a wide/);
  });

  it('refuses changing a wide into a fair ball inside a finished over (the over would end early)', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ ballType: 'wide' }).balls(0, 0, 0, 0, 0, 0).bowler('b2').ball({ runs: 0 });
    expect(tryEditDelivery(m.setup, m.events, 1, fair(0)).ok).toBe(false);
  });

  it('a change in the first innings changes the target of the second', () => {
    const m = startedMatch({ oversPerInnings: 1, playersPerSide: 2 });
    m.balls(1, 0, 0, 0, 0, 0).start('b1', 'b2', 'a1').ball({ runs: 0 });
    expect(m.state.innings[1].target).toBe(2);
    const r = tryEditDelivery(m.setup, m.events, 1, fair(3));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.innings[0].runs).toBe(3);
    expect(r.state.innings[1].target).toBe(4);
  });

  it('a change that decides the match early is refused when balls were recorded after it', () => {
    const m = startedMatch({ oversPerInnings: 1, playersPerSide: 2 });
    m.balls(1, 0, 0, 0, 0, 0).start('b1', 'b2', 'a1').ball({ runs: 0 }).ball({ runs: 0 });
    // 2 needed; making the first chase ball a boundary wins the match, so the next ball cannot follow.
    expect(tryEditDelivery(m.setup, m.events, 8, fair(0, { boundary: 'four' })).ok).toBe(false);
  });

  it('only a delivery can be edited', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ runs: 1 });
    const r = tryEditDelivery(m.setup, m.events, 0, fair(0));
    expect(!r.ok && r.error).toMatch(/Only a delivery/);
  });
});
