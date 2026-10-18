// Display helpers. Screens use these instead of formatting cricket values themselves.
import { BALLS_PER_OVER, type MatchSetup } from './match';
import type { DeliveryRecord, InningsState, MatchResult, MatchState, WicketRecord } from './scoring';

/**
 * Overs are stored as an integer count of legal balls. "12.3" means 12 overs and 3 balls; it
 * is NOT the decimal 12.3, so never do arithmetic on the formatted value.
 */
export function formatOvers(legalBalls: number): string {
  const overs = Math.floor(legalBalls / BALLS_PER_OVER);
  const balls = legalBalls % BALLS_PER_OVER;
  return balls === 0 ? String(overs) : `${overs}.${balls}`;
}

/** Runs per 6 legal balls, or null before the first legal ball. */
export function runRate(runs: number, legalBalls: number): number | null {
  return legalBalls === 0 ? null : (runs * BALLS_PER_OVER) / legalBalls;
}

export function formatRate(rate: number | null): string {
  return rate === null ? '-' : rate.toFixed(2);
}

export function playerName(setup: MatchSetup, playerId: string | null): string {
  if (!playerId) return '';
  for (const team of setup.teams) {
    const p = team.players.find((x) => x.playerId === playerId);
    if (p) return p.name;
  }
  return 'Unknown player';
}

export function teamName(setup: MatchSetup, teamId: string): string {
  return setup.teams.find((t) => t.teamId === teamId)?.name ?? 'Unknown team';
}

export interface ChaseInfo {
  target: number;
  runsNeeded: number;
  ballsRemaining: number;
  requiredRate: number | null;
}

export function chaseInfo(state: MatchState, inn: InningsState): ChaseInfo | null {
  if (inn.target === null) return null;
  const runsNeeded = Math.max(0, inn.target - inn.runs);
  const ballsRemaining = state.setup.rules.oversPerInnings * BALLS_PER_OVER - inn.legalBalls;
  return {
    target: inn.target,
    runsNeeded,
    ballsRemaining,
    requiredRate: ballsRemaining > 0 ? (runsNeeded * BALLS_PER_OVER) / ballsRemaining : null,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function resultText(setup: MatchSetup, result: MatchResult): string {
  switch (result.type) {
    case 'tie':
      return 'Match tied';
    case 'winByRuns':
      return `${teamName(setup, result.winnerTeamId)} won by ${plural(result.runs, 'run')}`;
    case 'winByWickets':
      return `${teamName(setup, result.winnerTeamId)} won by ${plural(result.wickets, 'wicket')} (${plural(result.ballsRemaining, 'ball')} left)`;
  }
}

/** Scorecard text such as "c Smith b Jones" or "run out (Khan)". */
export function dismissalText(setup: MatchSetup, w: WicketRecord): string {
  const bowler = playerName(setup, w.bowlerId);
  const fielder = playerName(setup, w.fielderId);
  switch (w.kind) {
    case 'bowled':
      return `b ${bowler}`;
    case 'lbw':
      return `lbw b ${bowler}`;
    case 'hitWicket':
      return `hit wicket b ${bowler}`;
    case 'caught':
      return w.fielderId === w.bowlerId ? `c & b ${bowler}` : `c ${fielder} b ${bowler}`;
    case 'stumped':
      return `st ${fielder} b ${bowler}`;
    case 'runOut':
      return w.fielderId ? `run out (${fielder})` : 'run out';
  }
}

/** Short label for the recent-deliveries strip, e.g. "4", "1wd", "nb+2lb", "W". */
export function deliveryLabel(d: DeliveryRecord): string {
  const e = d.event;
  const nonPenalty = d.totalRuns - (e.ballType === 'fair' ? 0 : 1);
  const suffix = e.runsFrom === 'byes' ? 'b' : e.runsFrom === 'legByes' ? 'lb' : '';
  let label: string;
  if (e.ballType === 'wide') label = `${d.extras.wides}wd`;
  else if (e.ballType === 'noBall') label = nonPenalty > 0 ? `nb+${nonPenalty}${suffix}` : 'nb';
  else label = `${nonPenalty}${suffix}`;
  if (d.wicket) label = label === '0' ? 'W' : `${label}+W`;
  return label;
}
