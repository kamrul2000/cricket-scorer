// The backup file format, and the checks a backup must pass before anything is restored.
// Pure TypeScript (no React, no SQLite, no files), so it is fully covered by automated tests.
//
// A backup is one JSON object:
//   { format, formatVersion, schemaVersion, appVersion, exportedAt, data: { players: [...], ... } }
// `data` holds the database rows exactly as stored (see src/data/backupTables.ts).
//
// Checks, in order; the first stage that finds problems stops the import:
//   1. It is JSON, it is our format, and its versions are supported.
//   2. Every table is present and every row has exactly the expected columns and types.
//   3. Names are valid, IDs are unique, and every reference points at an existing row.
//   4. Every match's setup is valid and its event history replays through the scoring engine.
// The engine's derived columns (runs per delivery, match status and summary, ...) are then
// recomputed from the events, so the restored data always agrees with the events.
import {
  BACKUP_TABLES,
  INSERT_ORDER,
  type BackupData,
  type ColumnKind,
  type MatchEventBackupRow,
} from '../data/backupTables';
import { eventToRow } from '../data/matchEventRows';
import { storedMatchFromRows, type MatchRow } from '../data/matchRepository';
import { LATEST_SCHEMA_VERSION } from '../data/migrations';
import { RepositoryError } from '../data/RepositoryError';
import { validateName } from '../domain/people';
import { validateMatchSetup } from '../domain/setupValidation';
import { rowUpdate, toLoaded } from '../services/matchService';

export const BACKUP_FORMAT = 'local-cricket-scorer-backup';
export const BACKUP_FORMAT_VERSION = 1;
/** Far larger than any real backup; protects the phone from trying to read a huge wrong file. */
export const MAX_BACKUP_CHARS = 30_000_000;
/** How many problems are reported for a rejected backup. */
const MAX_REPORTED = 10;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  /** Database schema version the rows were exported from. */
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  data: BackupData;
}

export interface BackupSummary {
  players: number;
  teams: number;
  matches: number;
  inProgress: number;
  completed: number;
}

/** A backup that passed every check, with derived values recomputed, ready to restore. */
export interface ValidBackup {
  file: BackupFile;
  summary: BackupSummary;
}

export type BackupCheck = { ok: true; backup: ValidBackup } | { ok: false; errors: string[] };

export function buildBackup(data: BackupData, meta: { appVersion: string; exportedAt: string }): BackupFile {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: LATEST_SCHEMA_VERSION,
    appVersion: meta.appVersion,
    exportedAt: meta.exportedAt,
    data,
  };
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 1);
}

/** e.g. cricket-scorer-backup-2026-10-18-1530.json (local time). */
export function backupFileName(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `cricket-scorer-backup-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(errors: string[]): BackupCheck {
  if (errors.length <= MAX_REPORTED) return { ok: false, errors };
  const shown = errors.slice(0, MAX_REPORTED - 1);
  return { ok: false, errors: [...shown, `…and ${errors.length - shown.length} more problems.`] };
}

/** Parses and fully checks the text of a backup file. Never throws for bad input. */
export function parseBackup(text: string): BackupCheck {
  if (text.length > MAX_BACKUP_CHARS) return fail(['This file is far too large to be a backup from this app.']);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(['This file is not a backup: it is not valid JSON. It may be damaged or incomplete.']);
  }
  if (!isObject(json) || json.format !== BACKUP_FORMAT) {
    return fail(['This file is not a Local Cricket Scorer backup.']);
  }
  const { formatVersion, schemaVersion, appVersion, exportedAt } = json;
  if (!Number.isInteger(formatVersion) || !Number.isInteger(schemaVersion)) {
    return fail(['The backup has no valid version number. It may be damaged.']);
  }
  if ((formatVersion as number) > BACKUP_FORMAT_VERSION || (schemaVersion as number) > LATEST_SCHEMA_VERSION) {
    return fail(['This backup was made by a newer version of the app. Update the app, then restore it.']);
  }
  // When the schema changes (version 3 and later), convert older backups to the new shape here.
  if (formatVersion !== BACKUP_FORMAT_VERSION || schemaVersion !== LATEST_SCHEMA_VERSION) {
    return fail([`Backups from schema version ${schemaVersion} are not supported by this version of the app.`]);
  }
  if (typeof appVersion !== 'string' || typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
    return fail(['The backup is missing its export details. It may be damaged.']);
  }
  const checked = checkBackupData(json.data);
  if (!checked.ok) return fail(checked.errors);
  return {
    ok: true,
    backup: {
      file: {
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        schemaVersion: LATEST_SCHEMA_VERSION,
        appVersion,
        exportedAt,
        data: checked.data,
      },
      summary: checked.summary,
    },
  };
}

/**
 * Checks the data part of a backup (also used by "Check stored data" on the live database).
 * Returns the data with derived values recomputed from the events.
 */
export function checkBackupData(
  data: unknown,
): { ok: true; data: BackupData; summary: BackupSummary } | { ok: false; errors: string[] } {
  const structure = checkStructure(data);
  if (structure.length) return { ok: false, errors: structure };
  const d = data as BackupData;
  const references = checkReferences(d);
  if (references.length) return { ok: false, errors: references };
  return replayMatches(d);
}

// ---- 2. Structure -----------------------------------------------------------------------

function kindOk(kind: ColumnKind, v: unknown): boolean {
  switch (kind) {
    case 'text':
      return typeof v === 'string' && v.length > 0;
    case 'text?':
      return v === null || typeof v === 'string';
    case 'int':
      return Number.isInteger(v);
    case 'int?':
      return v === null || Number.isInteger(v);
  }
}

function checkStructure(data: unknown): string[] {
  if (!isObject(data)) return ['The backup has no data section.'];
  const errors: string[] = [];
  for (const key of INSERT_ORDER) {
    const rows = data[key];
    const { table, columns } = BACKUP_TABLES[key];
    if (!Array.isArray(rows)) {
      errors.push(`The backup is missing the ${table} table.`);
      continue;
    }
    rows.forEach((row, i) => {
      const where = `${table} row ${i + 1}`;
      if (!isObject(row)) {
        errors.push(`${where} is not a record.`);
        return;
      }
      for (const [col, kind] of Object.entries(columns)) {
        if (!(col in row)) errors.push(`${where} is missing "${col}".`);
        else if (!kindOk(kind, row[col])) errors.push(`${where} has an invalid "${col}".`);
      }
      for (const col of Object.keys(row)) {
        if (!(col in columns)) errors.push(`${where} has an unknown field "${col}".`);
      }
    });
  }
  const extra = Object.keys(data).filter((k) => !(INSERT_ORDER as string[]).includes(k));
  if (extra.length) errors.push(`The backup has unknown sections: ${extra.join(', ')}.`);
  return errors;
}

// ---- 3. Names, IDs and references -------------------------------------------------------

/** SQLite's NOCASE comparison folds only A-Z, so do the same. */
const nocase = (s: string) => s.replace(/[a-z]/g, (c) => c.toUpperCase());

function checkReferences(d: BackupData): string[] {
  const errors: string[] = [];
  const uniqueIds = (rows: { id: string }[], what: string) => {
    const ids = new Set<string>();
    for (const r of rows) {
      if (ids.has(r.id)) errors.push(`Two ${what} share the ID ${r.id}.`);
      ids.add(r.id);
    }
    return ids;
  };
  const playerIds = uniqueIds(d.players, 'players');
  const teamIds = uniqueIds(d.teams, 'teams');
  const matchIds = uniqueIds(d.matches, 'matches');

  for (const [rows, label] of [
    [d.players, 'Player'],
    [d.teams, 'Team'],
  ] as const) {
    for (const r of rows) {
      const check = validateName(r.name, label);
      if (!check.ok || check.value !== r.name) errors.push(`${label} ${r.id} has an invalid name.`);
    }
  }
  const activeTeamNames = new Set<string>();
  for (const t of d.teams.filter((t) => t.archived_at === null)) {
    if (activeTeamNames.has(nocase(t.name))) errors.push(`Two active teams are both named "${t.name}".`);
    activeTeamNames.add(nocase(t.name));
  }

  const pairs = new Set<string>();
  for (const tp of d.teamPlayers) {
    if (!teamIds.has(tp.team_id)) errors.push(`A team roster refers to a missing team (${tp.team_id}).`);
    if (!playerIds.has(tp.player_id)) errors.push(`A team roster refers to a missing player (${tp.player_id}).`);
    const pair = `${tp.team_id}\n${tp.player_id}`;
    if (pairs.has(pair)) errors.push(`A player is listed twice on the roster of team ${tp.team_id}.`);
    pairs.add(pair);
  }

  for (const m of d.matches) {
    for (const t of [m.team_a_id, m.team_b_id]) {
      if (!teamIds.has(t)) errors.push(`${matchLabel(m)} refers to a missing team (${t}).`);
    }
    if (m.free_hit_after_no_ball !== 0 && m.free_hit_after_no_ball !== 1) {
      errors.push(`${matchLabel(m)} has an invalid free-hit setting.`);
    }
  }
  const lineupKeys = new Set<string>();
  for (const mp of d.matchPlayers) {
    if (!matchIds.has(mp.match_id)) errors.push(`A match lineup refers to a missing match (${mp.match_id}).`);
    if (!playerIds.has(mp.player_id)) errors.push(`A match lineup refers to a missing player (${mp.player_id}).`);
    const key = `${mp.match_id}\n${mp.player_id}`;
    if (lineupKeys.has(key)) errors.push(`A player appears twice in the lineups of match ${mp.match_id}.`);
    lineupKeys.add(key);
  }
  for (const e of d.matchEvents) {
    if (!matchIds.has(e.match_id)) {
      errors.push(`A ball-by-ball record refers to a missing match (${e.match_id}).`);
      break; // one message is enough
    }
  }
  return errors;
}

// ---- 4. Replay every match --------------------------------------------------------------

function matchLabel(m: MatchRow): string {
  return `Match "${m.team_a_name} v ${m.team_b_name}" (${m.created_at.slice(0, 10)})`;
}

function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

function replayMatches(d: BackupData): { ok: true; data: BackupData; summary: BackupSummary } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const lineups = groupBy(d.matchPlayers, (r) => r.match_id);
  const eventsByMatch = groupBy(d.matchEvents, (r) => r.match_id);
  const matches: MatchRow[] = [];
  const events: MatchEventBackupRow[] = [];

  for (const m of d.matches) {
    const label = matchLabel(m);
    const players = [...(lineups.get(m.id) ?? [])].sort((a, b) => a.lineup_order - b.lineup_order);
    const strangers = players.filter((p) => p.team_id !== m.team_a_id && p.team_id !== m.team_b_id);
    if (strangers.length) {
      errors.push(`${label} has lineup players for a team that is not playing.`);
      continue;
    }
    for (const teamId of [m.team_a_id, m.team_b_id]) {
      const orders = players.filter((p) => p.team_id === teamId).map((p) => p.lineup_order);
      if (orders.some((o, i) => o !== i)) errors.push(`${label} has a lineup with its batting order out of sequence.`);
    }
    const rows = [...(eventsByMatch.get(m.id) ?? [])].sort((a, b) => a.seq - b.seq);
    try {
      const stored = storedMatchFromRows(m, players, rows);
      const setupProblems = validateMatchSetup(stored.setup);
      if (setupProblems.length) {
        errors.push(`${label}: ${setupProblems[0]}`);
        continue;
      }
      const loaded = toLoaded(stored); // replays every event through the scoring engine
      const update = rowUpdate(loaded.state);
      matches.push({ ...m, status: update.status, summary: update.summary });

      const records = new Map(loaded.state.innings.flatMap((inn) => inn.deliveries).map((r) => [r.eventIndex, r]));
      let inningsIndex = -1;
      loaded.events.forEach((event, seq) => {
        if (event.type === 'inningsStart') inningsIndex += 1;
        const derived = eventToRow(seq, {
          event,
          inningsIndex: inningsIndex as 0 | 1,
          record: records.get(seq) ?? null,
        });
        events.push({ ...derived, match_id: m.id, created_at: rows[seq].created_at });
      });
    } catch (e) {
      if (e instanceof RepositoryError) errors.push(`${label}: ${e.message}`);
      else throw e;
    }
  }
  if (errors.length) return { ok: false, errors };

  const summary: BackupSummary = {
    players: d.players.length,
    teams: d.teams.length,
    matches: matches.length,
    inProgress: matches.filter((m) => m.status === 'inProgress').length,
    completed: matches.filter((m) => m.status === 'completed').length,
  };
  return { ok: true, data: { ...d, matches, matchEvents: events }, summary };
}
