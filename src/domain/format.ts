// Display helpers. Screens use these instead of formatting cricket values themselves.
import { BALLS_PER_OVER, type MatchEvent, type MatchSetup, type TeamLineup } from './match';
import {
  currentInnings,
  type DeliveryRecord,
  type InningsState,
  type MatchResult,
  type MatchState,
  type WicketRecord,
} from './scoring';

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
    case 'noResult':
      return 'No result (match abandoned)';
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

/** "45/2" */
export function scoreText(inn: InningsState): string {
  return `${inn.runs}/${inn.wickets}`;
}

/** Batting strike rate: runs per 100 balls faced. */
export function strikeRate(runs: number, ballsFaced: number): string {
  return ballsFaced === 0 ? '-' : ((runs * 100) / ballsFaced).toFixed(1);
}

/** Bowling economy: runs per 6 legal balls. */
export function economy(runsConceded: number, legalBalls: number): string {
  return formatRate(runRate(runsConceded, legalBalls));
}

/**
 * Average = runs per dismissal (batting: runs / times out; bowling: runs conceded / wickets).
 * "-" when there is no dismissal yet, because the average is undefined, not zero.
 */
export function formatAverage(runs: number, dismissals: number): string {
  return dismissals === 0 ? '-' : (runs / dismissals).toFixed(2);
}

/** " (c)" for the captain, " (vc)" for the vice-captain, "" otherwise. */
export function roleSuffix(team: TeamLineup, playerId: string): string {
  if (team.captainId === playerId) return ' (c)';
  if (team.viceCaptainId === playerId) return ' (vc)';
  return '';
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** One-line status for the match list. */
export function matchSummary(state: MatchState): string {
  if (state.result) return resultText(state.setup, state.result);
  const inn = currentInnings(state);
  if (!inn) return 'Not started';
  const head = `${inn.battingTeam.name} ${scoreText(inn)} (${formatOvers(inn.legalBalls)} ov)`;
  if (inn.completed) return `${head}, innings break`;
  const chase = chaseInfo(state, inn);
  return chase ? `${head}, need ${chase.runsNeeded} from ${chase.ballsRemaining} balls` : head;
}

/** Describes the most recent event, e.g. for the undo confirmation. */
export function describeLastEvent(state: MatchState, events: readonly MatchEvent[]): string | null {
  const event = events[events.length - 1];
  if (!event) return null;
  const name = (id: string) => playerName(state.setup, id);
  switch (event.type) {
    case 'inningsStart':
      return `Start of innings: ${name(event.strikerId)} and ${name(event.nonStrikerId)} opening, ${name(event.bowlerId)} bowling`;
    case 'newBatter':
      return `${name(event.playerId)} chosen as the new batter`;
    case 'newBowler':
      return `${name(event.playerId)} chosen to bowl the next over`;
    case 'swapBatters':
      return 'Batters swapped (scorer correction)';
    case 'abandon':
      return 'Match abandoned (no result)';
    case 'delivery': {
      const index = events.length - 1;
      const record = state.innings.flatMap((i) => i.deliveries).find((d) => d.eventIndex === index);
      if (!record) return 'Last delivery';
      const wicket = record.wicket ? `, ${name(record.wicket.playerOutId)} out` : '';
      return `Over ${record.over + 1}: ${deliveryLabel(record)} (${name(record.bowlerId)} to ${name(record.strikerId)}${wicket})`;
    }
  }
}

export const DISMISSAL_LABELS: Record<WicketRecord['kind'], string> = {
  bowled: 'Bowled',
  caught: 'Caught',
  lbw: 'LBW',
  stumped: 'Stumped',
  hitWicket: 'Hit wicket',
  runOut: 'Run out',
};
