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
 * `blockedIds` bowled (part of) the over just finished, or are about to bowl the current one, so
 * they cannot bowl the first of the remaining overs. Usually one bowler; two or more when a
 * bowler was replaced during the over (Law 17.8).
 *
 * In any sequence of R overs with no two adjacent the same, one bowler can bowl at most
 * ceil(R/2) of them, or floor(R/2) if they may not bowl the first. With those caps the check is:
 * sum of min(oversLeft, cap) >= R, and someone who is not blocked can bowl the first over.
 * (With a single blocked bowler the second condition always follows from the first.)
 */
export function canBowlRemainingOvers(
  remainingOvers: number,
  oversLeft: ReadonlyMap<string, number>,
  blockedIds: string | null | readonly string[],
): boolean {
  if (remainingOvers <= 0) return true;
  const blocked = new Set(blockedIds === null ? [] : typeof blockedIds === 'string' ? [blockedIds] : blockedIds);
  let capacity = 0;
  let canOpen = false;
  for (const [id, left] of oversLeft) {
    const cap = blocked.has(id) ? Math.floor(remainingOvers / 2) : Math.ceil(remainingOvers / 2);
    capacity += Math.min(left, cap);
    if (!blocked.has(id) && left > 0) canOpen = true;
  }
  return canOpen && capacity >= remainingOvers;
}

/** Returns a list of human-readable problems; empty means the setup is valid. */
export function validateMatchSetup(setup: MatchSetup): string[] {
  const errors: string[] = [];
  const { rules, teams, toss } = setup;

  if (!isPositiveInt(rules.oversPerInnings) || rules.oversPerInnings > MAX_OVERS_PER_INNINGS) {
    errors.push(`Overs per innings must be a whole number from 1 to ${MAX_OVERS_PER_INNINGS}.`);
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
    // The two teams may have different numbers of players (for example 11 v 10).
    const size = team.players.length;
    if (size < MIN_PLAYERS_PER_SIDE || size > MAX_PLAYERS_PER_SIDE) {
      errors.push(
        `Players per side must be from ${MIN_PLAYERS_PER_SIDE} to ${MAX_PLAYERS_PER_SIDE}: ${team.name} has ${size} in the lineup.`,
      );
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
    // Each team bowls one innings, so each lineup must be able to bowl all the overs.
    for (const team of teams) {
      const size = team.players.length;
      const allowance = new Map<string, number>();
      for (let i = 0; i < size; i++) allowance.set(String(i), rules.maxOversPerBowler);
      if (!canBowlRemainingOvers(rules.oversPerInnings, allowance, null)) {
        errors.push(
          `With ${size} players (${team.name}) and at most ${rules.maxOversPerBowler} overs each, ${rules.oversPerInnings} overs cannot be bowled without someone bowling consecutive overs.`,
        );
        break;
      }
    }
  }
  return errors;
}

export function firstBattingTeamIndex(setup: MatchSetup): 0 | 1 {
  const winnerIndex = setup.teams[0].teamId === setup.toss.winnerTeamId ? 0 : 1;
  return setup.toss.decision === 'bat' ? winnerIndex : winnerIndex === 0 ? 1 : 0;
}
