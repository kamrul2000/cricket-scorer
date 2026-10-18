// Plain types and rules for players and teams. No React, no SQLite.

export interface Player {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp, or null while the player is active. */
  archivedAt: string | null;
}

export interface Team {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface TeamSummary extends Team {
  playerCount: number;
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
