// Upcoming (scheduled) matches: formats, validation and date formatting. Pure TypeScript.
import { MAX_OVERS_PER_INNINGS, MAX_PLAYERS_PER_SIDE, MIN_PLAYERS_PER_SIDE } from './match';

/** Preset formats. "Custom" lets the scorer type any number of overs. */
export const MATCH_FORMATS = [
  { name: 'T20', overs: 20 },
  { name: 'T10', overs: 10 },
  { name: 'Six-over', overs: 6 },
  { name: 'Custom', overs: null },
] as const;

export const VENUE_MAX_LENGTH = 80;
export const FORMAT_MAX_LENGTH = 40;

export type ScheduleStatus = 'scheduled' | 'started' | 'cancelled';

export interface ScheduleInput {
  teamAId: string;
  teamBId: string;
  /** ISO timestamp of the planned start. */
  scheduledAt: string;
  venue: string;
  formatName: string;
  oversPerInnings: number;
  playersPerSide: number;
}

export interface ScheduledMatch extends ScheduleInput {
  id: string;
  status: ScheduleStatus;
  /** The match started from this schedule (null until started, or if that match was deleted). */
  matchId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Problems with a schedule, as messages; empty = valid. Trims text fields in `cleaned`. */
export function validateSchedule(input: ScheduleInput): { errors: string[]; cleaned: ScheduleInput } {
  const errors: string[] = [];
  const cleaned = { ...input, venue: input.venue.trim(), formatName: input.formatName.trim() };
  if (!input.teamAId || !input.teamBId) errors.push('Choose both teams.');
  else if (input.teamAId === input.teamBId) errors.push('Choose two different teams.');
  if (Number.isNaN(Date.parse(input.scheduledAt))) errors.push('Choose the date and time.');
  if (cleaned.venue.length > VENUE_MAX_LENGTH) errors.push(`The venue must be ${VENUE_MAX_LENGTH} characters or fewer.`);
  if (cleaned.formatName.length === 0 || cleaned.formatName.length > FORMAT_MAX_LENGTH) errors.push('Choose a match format.');
  const overs = input.oversPerInnings;
  if (!Number.isInteger(overs) || overs < 1 || overs > MAX_OVERS_PER_INNINGS) {
    errors.push(`Overs per innings must be a whole number from 1 to ${MAX_OVERS_PER_INNINGS}.`);
  }
  const size = input.playersPerSide;
  if (!Number.isInteger(size) || size < MIN_PLAYERS_PER_SIDE || size > MAX_PLAYERS_PER_SIDE) {
    errors.push(`Players per side must be from ${MIN_PLAYERS_PER_SIDE} to ${MAX_PLAYERS_PER_SIDE}.`);
  }
  return { errors, cleaned };
}

/** "T20 · 20 overs", "Custom · 8 overs", "6 overs" (no format name). */
export function formatLabel(formatName: string, overs: number): string {
  const o = `${overs} ${overs === 1 ? 'over' : 'overs'}`;
  return formatName && formatName !== `${overs} overs` ? `${formatName} · ${o}` : o;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sat 25 Oct 2026" in the phone's local time. Same output on every phone (no locale data needed). */
export function formatMatchDate(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "3:05 PM" in the phone's local time. */
export function formatMatchTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Upcoming first (soonest at the top); cancelled ones after. Started ones are not listed. */
export function upcomingOrder(list: readonly ScheduledMatch[]): ScheduledMatch[] {
  return list
    .filter((s) => s.status !== 'started')
    .sort(
      (a, b) =>
        Number(a.status === 'cancelled') - Number(b.status === 'cancelled') ||
        a.scheduledAt.localeCompare(b.scheduledAt) ||
        a.id.localeCompare(b.id),
    );
}
