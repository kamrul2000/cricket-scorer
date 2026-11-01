// Plain types and rules for players and teams. No React, no SQLite.

export const BATTING_HANDS = ['right', 'left'] as const;
export type BattingHand = (typeof BATTING_HANDS)[number];

export const PLAYER_ROLES = ['batter', 'bowler', 'allRounder', 'wicketKeeper'] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

export const BATTING_HAND_LABELS: Record<BattingHand, string> = { right: 'Right-hand bat', left: 'Left-hand bat' };
export const PLAYER_ROLE_LABELS: Record<PlayerRole, string> = {
  batter: 'Batter',
  bowler: 'Bowler',
  allRounder: 'All-rounder',
  wicketKeeper: 'Wicket-keeper',
};

export const isBattingHand = (v: unknown): v is BattingHand => (BATTING_HANDS as readonly unknown[]).includes(v);
export const isPlayerRole = (v: unknown): v is PlayerRole => (PLAYER_ROLES as readonly unknown[]).includes(v);

/** How a player plays. Both are optional (null = not set), e.g. for players added during a match. */
export interface PlayerProfile {
  battingHand: BattingHand | null;
  role: PlayerRole | null;
}

export const NO_PROFILE: PlayerProfile = { battingHand: null, role: null };

/** e.g. "All-rounder · Left-hand bat"; empty when neither is set. */
export function profileText(profile: PlayerProfile): string {
  return [profile.role && PLAYER_ROLE_LABELS[profile.role], profile.battingHand && BATTING_HAND_LABELS[profile.battingHand]]
    .filter(Boolean)
    .join(' · ');
}

export interface Player extends PlayerProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp, or null while the player is active. */
  archivedAt: string | null;
}

export interface TeamDetails {
  description: string;
  /** File name of the logo in the app's private logo folder, or null. */
  logoFile: string | null;
  captainId: string | null;
  viceCaptainId: string | null;
}

export interface Team extends TeamDetails {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export const DESCRIPTION_MAX_LENGTH = 300;

/** Trims the description and checks its length. Empty is allowed. */
export function validateDescription(raw: string): NameResult {
  const value = raw.trim();
  if (value.length > DESCRIPTION_MAX_LENGTH) {
    return { ok: false, error: `The description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true, value };
}

/** Captain and vice-captain must be on the roster and must be different people. */
export function leadershipError(playerIds: readonly string[], captainId: string | null, viceCaptainId: string | null): string | null {
  if (captainId && !playerIds.includes(captainId)) return 'The captain must be on the team roster.';
  if (viceCaptainId && !playerIds.includes(viceCaptainId)) return 'The vice-captain must be on the team roster.';
  if (captainId && captainId === viceCaptainId) return 'The captain and vice-captain must be different players.';
  return null;
}

export interface TeamSummary extends Team {
  playerCount: number;
  /** Names of the players on the roster, in no particular order (for searching). */
  playerNames: string[];
}

export interface TeamWithRoster extends Team {
  /** Roster player IDs. */
  playerIds: string[];
}

export const NAME_MAX_LENGTH = 60;

export type NameResult = { ok: true; value: string } | { ok: false; error: string };

/** Trims, collapses repeated spaces, and checks length. Used for player and team names. */
export function validateName(raw: string, label: string): NameResult {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length === 0) return { ok: false, error: `${label} name is required.` };
  if (value.length > NAME_MAX_LENGTH) {
    return { ok: false, error: `${label} name must be ${NAME_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true, value };
}
