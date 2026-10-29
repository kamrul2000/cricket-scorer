import { overBowlersText } from '../../src/domain/format';
import { bowlerOptions, canReplaceBowler, replacementBowlerOptions } from '../../src/domain/scoring';
import { canBowlRemainingOvers } from '../../src/domain/setupValidation';
import { out, startedMatch } from '../helpers/matchBuilder';

const reasonFor = (options: { playerId: string; reason: string | null }[], id: string) =>
  options.find((o) => o.playerId === id)!.reason;

describe('a bowler replaced during an over (Law 17.8)', () => {
  it('each bowler keeps their own balls, neither may bowl the next over, and it is no one’s maiden', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.balls(0, 0).replaceBowler('b2').balls(0, 0, 0, 0);
    const inn = m.innings;
    expect(inn.bowlers.find((b) => b.playerId === 'b1')).toMatchObject({ legalBalls: 2, maidens: 0 });
    expect(inn.bowlers.find((b) => b.playerId === 'b2')).toMatchObject({ legalBalls: 4, maidens: 0 });
    expect(inn.overs[0]).toMatchObject({ bowlerIds: ['b1', 'b2'], complete: true });
    expect(overBowlersText(m.setup, inn.overs[0])).toBe('B1 & B2');
    expect(inn.previousOverBowlerIds).toEqual(['b1', 'b2']);

    const options = bowlerOptions(m.state);
    expect(reasonFor(options, 'b1')).toMatch(/part of the previous over/);
    expect(reasonFor(options, 'b2')).toMatch(/part of the previous over/);
    expect(reasonFor(options, 'b3')).toBeNull();
  });

  it('later balls of the over are the replacement’s', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.ball({ runs: 1 }).replaceBowler('b2').ball({ boundary: 'four' }).ball({ dismissal: out.bowled() });
    const inn = m.innings;
    expect(inn.bowlers.find((b) => b.playerId === 'b1')).toMatchObject({ runsConceded: 1, wickets: 0, legalBalls: 1 });
    expect(inn.bowlers.find((b) => b.playerId === 'b2')).toMatchObject({ runsConceded: 4, wickets: 1, legalBalls: 2 });
    expect(inn.deliveries.map((d) => d.bowlerId)).toEqual(['b1', 'b2', 'b2']);
    expect(inn.batters[1].wicket).toMatchObject({ bowlerId: 'b2', creditedToBowler: true });
  });

  it('rejects the current bowler, a bowler of the previous over, and anyone who already bowled in this over', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.balls(0, 0, 0, 0, 0, 0).bowler('b2').ball({ runs: 0 });
    expect(m.rejectionOf({ type: 'replaceBowler', playerId: 'b2' })).toMatch(/already bowling/);
    expect(m.rejectionOf({ type: 'replaceBowler', playerId: 'b1' })).toMatch(/previous over/);
    expect(m.rejectionOf({ type: 'replaceBowler', playerId: 'a1' })).toMatch(/lineup/);
    m.replaceBowler('b3');
    expect(m.rejectionOf({ type: 'replaceBowler', playerId: 'b2' })).toMatch(/already bowled part of this over/);
    expect(reasonFor(replacementBowlerOptions(m.state), 'b4')).toBeNull();
  });

  it('respects the maximum overs per bowler', () => {
    const m = startedMatch({ oversPerInnings: 4, playersPerSide: 4, maxOversPerBowler: 1 });
    m.balls(0, 0, 0, 0, 0, 0).bowler('b2').balls(0, 0, 0, 0, 0, 0).bowler('b3').balls(0, 0, 0);
    expect(m.rejectionOf({ type: 'replaceBowler', playerId: 'b1' })).toMatch(/maximum of 1 overs/);
  });

  it('before the first ball of an over it only corrects the choice of bowler', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.replaceBowler('b2');
    expect(m.innings.bowlers.map((b) => b.playerId)).toEqual(['b2']); // b1 never bowled
    expect(m.innings.currentOverBowlerIds).toEqual(['b2']);
    m.balls(0, 0, 0, 0, 0, 0);
    expect(m.innings.previousOverBowlerIds).toEqual(['b2']);
    expect(m.innings.bowlers[0].maidens).toBe(1);
    expect(reasonFor(bowlerOptions(m.state), 'b1')).toBeNull();
  });

  it('is not possible between overs: the next bowler is chosen instead', () => {
    const m = startedMatch({ oversPerInnings: 5 });
    m.balls(0, 0, 0, 0, 0, 0);
    expect(canReplaceBowler(m.state)).toBe(false);
    expect(m.rejectionOf({ type: 'replaceBowler', playerId: 'b2' })).toMatch(/next over/);
  });
});

describe('canBowlRemainingOvers with several blocked bowlers', () => {
  const caps = (entries: [string, number][]) => new Map(entries);
  it('needs a bowler who is not blocked for the first over', () => {
    expect(canBowlRemainingOvers(2, caps([['x', 1], ['y', 1]]), ['x', 'y'])).toBe(false);
    expect(canBowlRemainingOvers(2, caps([['x', 1], ['y', 1], ['z', 1]]), ['x', 'y'])).toBe(true);
    expect(canBowlRemainingOvers(3, caps([['x', 2], ['y', 2], ['z', 1]]), ['x', 'y'])).toBe(true);
    expect(canBowlRemainingOvers(3, caps([['x', 2], ['y', 2], ['z', 0]]), ['x', 'y'])).toBe(false);
  });
});
