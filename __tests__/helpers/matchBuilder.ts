// Test helper: drives the real scoring engine like a scorer would.
// Team A players are "a1".."aN", team B "b1".."bN". Team A wins the toss and bats by default.
import type {
  DeliveryEvent,
  DeliveryInput,
  Dismissal,
  MatchEvent,
  MatchRules,
  MatchSetup,
} from '../../src/domain/match';
import { computeMatchState, currentInnings, tryAddEvent, type MatchState } from '../../src/domain/scoring';

export function makeSetup(opts: Partial<MatchRules> & { tossDecision?: 'bat' | 'bowl' } = {}): MatchSetup {
  const rules: MatchRules = {
    oversPerInnings: opts.oversPerInnings ?? 2,
    playersPerSide: opts.playersPerSide ?? 11,
    freeHitAfterNoBall: opts.freeHitAfterNoBall ?? true,
    maxOversPerBowler: opts.maxOversPerBowler ?? null,
  };
  const team = (key: 'a' | 'b') => ({
    teamId: `team-${key}`,
    name: key === 'a' ? 'Alpha' : 'Bravo',
    players: Array.from({ length: rules.playersPerSide }, (_, i) => ({
      playerId: `${key}${i + 1}`,
      name: `${key.toUpperCase()}${i + 1}`,
    })),
  });
  return {
    rules,
    teams: [team('a'), team('b')],
    toss: { winnerTeamId: 'team-a', decision: opts.tossDecision ?? 'bat' },
  };
}

export class TestMatch {
  readonly setup: MatchSetup;
  events: MatchEvent[] = [];

  constructor(setup: MatchSetup) {
    this.setup = setup;
  }

  get state(): MatchState {
    return computeMatchState(this.setup, this.events);
  }

  get innings() {
    return currentInnings(this.state)!;
  }

  private push(event: MatchEvent): this {
    const r = tryAddEvent(this.setup, this.events, event);
    if (!r.ok) throw new Error(`Rejected ${JSON.stringify(event)}: ${r.error}`);
    this.events.push(event);
    return this;
  }

  /** Start the current innings with openers and opening bowler. */
  start(strikerId: string, nonStrikerId: string, bowlerId: string): this {
    return this.push({ type: 'inningsStart', strikerId, nonStrikerId, bowlerId });
  }

  batter(playerId: string): this {
    return this.push({ type: 'newBatter', playerId });
  }

  bowler(playerId: string): this {
    return this.push({ type: 'newBowler', playerId });
  }

  /** Builds a delivery event from a partial input plus the current striker/non-striker/bowler. */
  deliveryEvent(input: Partial<DeliveryInput> = {}): DeliveryEvent {
    const inn = currentInnings(this.state);
    const ballType = input.ballType ?? 'fair';
    return {
      type: 'delivery',
      ballType,
      runsFrom: input.runsFrom !== undefined ? input.runsFrom : ballType === 'wide' ? null : 'bat',
      runs: input.runs ?? 0,
      boundary: input.boundary ?? 'none',
      dismissal: input.dismissal ?? null,
      strikerId: inn?.strikerId ?? '',
      nonStrikerId: inn?.nonStrikerId ?? '',
      bowlerId: inn?.bowlerId ?? '',
    };
  }

  ball(input: Partial<DeliveryInput> = {}): this {
    return this.push(this.deliveryEvent(input));
  }

  /** Several fair deliveries, each scoring the given bat runs. */
  balls(...runs: number[]): this {
    runs.forEach((r) => this.ball({ runs: r }));
    return this;
  }

  /** Returns the rejection message for a delivery (and does not record it). */
  rejection(input: Partial<DeliveryInput>): string {
    const r = tryAddEvent(this.setup, this.events, this.deliveryEvent(input));
    if (r.ok) throw new Error('Expected the delivery to be rejected, but it was accepted.');
    return r.error;
  }

  rejectionOf(event: MatchEvent): string {
    const r = tryAddEvent(this.setup, this.events, event);
    if (r.ok) throw new Error('Expected the event to be rejected, but it was accepted.');
    return r.error;
  }
}

export const out = {
  bowled: (): Dismissal => ({ kind: 'bowled' }),
  lbw: (): Dismissal => ({ kind: 'lbw' }),
  hitWicket: (): Dismissal => ({ kind: 'hitWicket' }),
  caught: (fielderId: string): Dismissal => ({ kind: 'caught', fielderId }),
  stumped: (fielderId: string): Dismissal => ({ kind: 'stumped', fielderId }),
  runOut: (playerOutId: string, end: 'striker' | 'nonStriker', fielderId: string | null = null): Dismissal => ({
    kind: 'runOut',
    playerOutId,
    end,
    fielderId,
  }),
};

/** A started match: a1 on strike, a2 at the other end, b1 bowling. */
export function startedMatch(opts: Parameters<typeof makeSetup>[0] = {}): TestMatch {
  return new TestMatch(makeSetup(opts)).start('a1', 'a2', 'b1');
}
