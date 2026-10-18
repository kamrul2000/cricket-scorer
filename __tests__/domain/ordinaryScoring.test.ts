import { formatOvers } from '../../src/domain/format';
import { startedMatch } from '../helpers/matchBuilder';

describe('ordinary scoring and overs', () => {
  it('adds bat runs to the striker, the bowler and the team', () => {
    const m = startedMatch().balls(0, 2, 4);
    const inn = m.innings;
    expect(inn.runs).toBe(6);
    expect(inn.batters[0]).toMatchObject({ playerId: 'a1', runs: 6, ballsFaced: 3 });
    expect(inn.bowlers[0]).toMatchObject({ playerId: 'b1', runsConceded: 6, legalBalls: 3 });
  });

  it('completes an over after 6 legal balls and asks for a new bowler', () => {
    const m = startedMatch().balls(0, 0, 0, 0, 0);
    expect(m.state.next.type).toBe('delivery');
    m.ball();
    expect(m.innings.legalBalls).toBe(6);
    expect(m.state.next.type).toBe('selectBowler');
    expect(m.innings.bowlerId).toBeNull();
  });

  it('records the over number and ball within the over', () => {
    const m = startedMatch().balls(0, 0, 0, 0, 0, 0).bowler('b2').ball();
    const last = m.innings.deliveries[6];
    expect(last.over).toBe(1);
    expect(last.legalBallInOver).toBe(1);
  });

  it('formats overs from an integer count of legal balls (not decimals)', () => {
    expect(formatOvers(0)).toBe('0');
    expect(formatOvers(5)).toBe('0.5');
    expect(formatOvers(6)).toBe('1');
    expect(formatOvers(17)).toBe('2.5');
    expect(formatOvers(120)).toBe('20');
  });

  it('counts a maiden only for an over with no runs debited to the bowler', () => {
    const m = startedMatch().balls(0, 0, 0, 0, 0, 0);
    expect(m.innings.bowlers[0].maidens).toBe(1);
  });

  it('a leg-bye over is still a maiden; a wide spoils it', () => {
    const m = startedMatch().ball({ runsFrom: 'legByes', runs: 1 }).balls(0, 0, 0, 0, 0);
    expect(m.innings.bowlers[0].maidens).toBe(1);

    const m2 = startedMatch().ball({ ballType: 'wide' }).balls(0, 0, 0, 0, 0, 0);
    expect(m2.innings.bowlers[0].maidens).toBe(0);
  });

  it('rejects a delivery whose batters or bowler do not match the state', () => {
    const m = startedMatch();
    const ev = { ...m.deliveryEvent({ runs: 1 }), strikerId: 'a2', nonStrikerId: 'a1' };
    expect(m.rejectionOf(ev)).toMatch(/do not match/);
  });

  it('rejects impossible run counts', () => {
    const m = startedMatch();
    expect(m.rejection({ runs: -1 })).toMatch(/whole number/);
    expect(m.rejection({ runs: 1.5 })).toMatch(/whole number/);
    expect(m.rejection({ runs: 8 })).toMatch(/whole number/);
  });
});
