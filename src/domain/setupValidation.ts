import {
  MAX_OVERS_PER_INNINGS,
  MAX_PLAYERS_PER_SIDE,
  MIN_PLAYERS_PER_SIDE,
  type MatchSetup,
} from './match';

const isPositiveInt = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n > 0;

/**
 * Can `remainingOvers` more overs be bowled, given how many overs each bowler may still bowl
 * (`oversLeft`), without anyone bowling two consecutive overs (Law 17.6)?
 * `lastBowlerId` bowled the over just finished (or is about to bowl the current one), so they
 * cannot bowl the first of the remaining overs.
 *
 * In any sequence of R overs with no two adjacent the same, one bowler can bowl at most
 * ceil(R/2) of them, or floor(R/2) if they may not bowl the first. Those caps are also
 * sufficient, so the check is: sum of min(oversLeft, cap) >= R.
 */
export function canBowlRemainingOvers(
  remainingOvers: number,
  oversLeft: ReadonlyMap<string, number>,
  lastBowlerId: string | null,
): boolean {
  if (remainingOvers <= 0) return true;
  let capacity = 0;
  for (const [id, left] of oversLeft) {
    const cap = id === lastBowlerId ? Math.floor(remainingOvers / 2) : Math.ceil(remainingOvers / 2);
    capacity += Math.min(left, cap);
  }
  return capacity >= remainingOvers;
}

/** Returns a list of human-readable problems; empty means the setup is valid. */
export function validateMatchSetup(setup: MatchSetup): string[] {
  const errors: string[] = [];
  const { rules, teams, toss } = setup;

  if (!isPositiveInt(rules.oversPerInnings) || rules.oversPerInnings > MAX_OVERS_PER_INNINGS) {
    errors.push(`Overs per innings must be a whole number from 1 to ${MAX_OVERS_PER_INNINGS}.`);
  }
  const size = rules.playersPerSide;
  if (!Number.isInteger(size) || size < MIN_PLAYERS_PER_SIDE || size > MAX_PLAYERS_PER_SIDE) {
    errors.push(
      `Players per side must be from ${MIN_PLAYERS_PER_SIDE} to ${MAX_PLAYERS_PER_SIDE}.`,
    );
  }
  if (rules.maxOversPerBowler !== null && !isPositiveInt(rules.maxOversPerBowler)) {
    errors.push('Maximum overs per bowler must be a positive whole number, or no limit.');
  }

  if (teams.length !== 2) {
    errors.push('A match needs exactly two teams.');
    return errors;
  }
  const [a, b] = teams;
  if (a.teamId === b.teamId) errors.push('Choose two different teams.');

  const seen = new Set<string>();
  for (const team of teams) {
    if (team.players.length !== size) {
      errors.push(`${team.name} must have exactly ${size} players in the lineup (has ${team.players.length}).`);
    }
    for (const p of [...team.players, ...(team.substitutes ?? [])]) {
      if (seen.has(p.playerId)) {
        errors.push(`${p.name} is selected more than once. A player can only be in one lineup, once, per match.`);
      }
      seen.add(p.playerId);
    }
    const inLineup = (id: string | null | undefined) => !id || team.players.some((p) => p.playerId === id);
    if (!inLineup(team.captainId) || !inLineup(team.viceCaptainId)) {
      errors.push(`The ${team.name} captain and vice-captain must be in the playing lineup.`);
    } else if (team.captainId && team.captainId === team.viceCaptainId) {
      errors.push(`The ${team.name} captain and vice-captain must be different players.`);
    }
  }

  if (toss.winnerTeamId !== a.teamId && toss.winnerTeamId !== b.teamId) {
    errors.push('The toss winner must be one of the two teams.');
  }
  if (toss.decision !== 'bat' && toss.decision !== 'bowl') {
    errors.push('Choose whether the toss winner bats or bowls first.');
  }

  if (errors.length === 0 && rules.maxOversPerBowler !== null) {
    const allowance = new Map<string, number>();
    for (let i = 0; i < size; i++) allowance.set(String(i), rules.maxOversPerBowler);
    if (!canBowlRemainingOvers(rules.oversPerInnings, allowance, null)) {
      errors.push(
        `With ${size} players and at most ${rules.maxOversPerBowler} overs each, ${rules.oversPerInnings} overs cannot be bowled without someone bowling consecutive overs.`,
      );
    }
  }
  return errors;
}

export function firstBattingTeamIndex(setup: MatchSetup): 0 | 1 {
  const winnerIndex = setup.teams[0].teamId === setup.toss.winnerTeamId ? 0 : 1;
  return setup.toss.decision === 'bat' ? winnerIndex : winnerIndex === 0 ? 1 : 0;
}
