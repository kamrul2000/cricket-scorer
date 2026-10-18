// Upcoming matches: validation, ordering, storage, starting exactly once, and backups.
import { parseBackup } from '../src/backup/backupFormat';
import { migrate } from '../src/data/migrations';
import { createRepositories } from '../src/data/repositories';
import type { MatchSetup } from '../src/domain/match';
import {
  formatLabel,
  formatMatchDate,
  formatMatchTime,
  upcomingOrder,
  validateSchedule,
  type ScheduledMatch,
  type ScheduleInput,
} from '../src/domain/schedule';
import { createBackupService } from '../src/services/backupService';
import { createMatchService } from '../src/services/matchService';
import { memoryLogoFiles } from './helpers/memoryLogoFiles';
import { createTestDatabase, testDeps } from './helpers/testDatabase';

const WHEN = new Date(2026, 9, 25, 15, 5).toISOString(); // Sun 25 Oct 2026, 3:05 PM local

async function app() {
  const db = createTestDatabase();
  await migrate(db);
  const repos = createRepositories(db, testDeps());
  const matches = createMatchService(repos.matches);
  const backups = createBackupService(repos.backups, { appVersion: '1.0.0', now: () => new Date(WHEN), logos: memoryLogoFiles() });
  const ps = await Promise.all(['A1', 'A2', 'B1', 'B2'].map((n) => repos.players.create(n)));
  const tA = await repos.teams.create('Tigers', [ps[0].id, ps[1].id]);
  const tB = await repos.teams.create('Lions', [ps[2].id, ps[3].id]);
  const input: ScheduleInput = {
    teamAId: tA.id,
    teamBId: tB.id,
    scheduledAt: WHEN,
    venue: ' Eastfield Park ',
    formatName: 'T10',
    oversPerInnings: 10,
    playersPerSide: 2,
  };
  const setup: MatchSetup = {
    rules: { oversPerInnings: 10, playersPerSide: 2, freeHitAfterNoBall: true, maxOversPerBowler: null },
    teams: [
      { teamId: tA.id, name: 'Tigers', players: [ps[0], ps[1]].map((p) => ({ playerId: p.id, name: p.name })) },
      { teamId: tB.id, name: 'Lions', players: [ps[2], ps[3]].map((p) => ({ playerId: p.id, name: p.name })) },
    ],
    toss: { winnerTeamId: tA.id, decision: 'bat' },
  };
  const openers = { strikerId: ps[0].id, nonStrikerId: ps[1].id, bowlerId: ps[2].id };
  return { db, repos, matches, backups, ps, tA, tB, input, setup, openers };
}

describe('schedule rules and display', () => {
  const ok: ScheduleInput = { teamAId: 'a', teamBId: 'b', scheduledAt: WHEN, venue: '', formatName: 'T20', oversPerInnings: 20, playersPerSide: 11 };

  it('validates teams, date, overs, players, venue and format', () => {
    expect(validateSchedule(ok).errors).toEqual([]);
    expect(validateSchedule({ ...ok, teamBId: 'a' }).errors).toEqual(['Choose two different teams.']);
    expect(validateSchedule({ ...ok, scheduledAt: 'soon' }).errors).toEqual(['Choose the date and time.']);
    expect(validateSchedule({ ...ok, oversPerInnings: 0 }).errors[0]).toMatch(/Overs per innings/);
    expect(validateSchedule({ ...ok, oversPerInnings: NaN }).errors[0]).toMatch(/Overs per innings/);
    expect(validateSchedule({ ...ok, playersPerSide: 12 }).errors[0]).toMatch(/Players per side/);
    expect(validateSchedule({ ...ok, venue: 'x'.repeat(81) }).errors[0]).toMatch(/venue/);
    expect(validateSchedule({ ...ok, formatName: '  ' }).errors[0]).toMatch(/format/);
    expect(validateSchedule({ ...ok, venue: '  Park ' }).cleaned.venue).toBe('Park');
  });

  it('formats dates and times the same way on every phone', () => {
    expect(formatMatchDate(WHEN)).toBe('Sun 25 Oct 2026');
    expect(formatMatchTime(WHEN)).toBe('3:05 PM');
    expect(formatMatchTime(new Date(2026, 0, 1, 0, 0).toISOString())).toBe('12:00 AM');
    expect(formatMatchTime(new Date(2026, 0, 1, 12, 30).toISOString())).toBe('12:30 PM');
    expect(formatLabel('T20', 20)).toBe('T20 · 20 overs');
    expect(formatLabel('', 1)).toBe('1 over');
  });

  it('lists upcoming matches soonest first, cancelled after, and hides started ones', () => {
    const s = (id: string, scheduledAt: string, status: ScheduledMatch['status']) =>
      ({ id, scheduledAt, status }) as ScheduledMatch;
    const list = [s('late', '2026-11-02', 'scheduled'), s('gone', '2026-10-01', 'cancelled'), s('soon', '2026-10-20', 'scheduled'), s('live', '2026-10-19', 'started')];
    expect(upcomingOrder(list).map((x) => x.id)).toEqual(['soon', 'late', 'gone']);
  });
});

describe('scheduled match storage', () => {
  it('creates, edits, cancels and restores', async () => {
    const { repos, input } = await app();
    const s = await repos.schedules.create(input);
    expect(s).toMatchObject({ status: 'scheduled', venue: 'Eastfield Park', matchId: null });
    const edited = await repos.schedules.update(s.id, { ...input, venue: 'Riverside', oversPerInnings: 8, formatName: 'Custom' });
    expect(edited).toMatchObject({ venue: 'Riverside', oversPerInnings: 8 });
    await repos.schedules.setCancelled(s.id, true);
    await expect(repos.schedules.update(s.id, input)).rejects.toThrow(/Restore this match/);
    expect((await repos.schedules.setCancelled(s.id, false)).status).toBe('scheduled');
  });

  it('refuses archived teams and the same team twice', async () => {
    const { repos, input, tB } = await app();
    await expect(repos.schedules.create({ ...input, teamBId: input.teamAId })).rejects.toThrow(/two different teams/);
    await repos.teams.setArchived(tB.id, true);
    await expect(repos.schedules.create(input)).rejects.toThrow(/Archived teams/);
  });
});

describe('starting a scheduled match', () => {
  it('starts once, links the match, and saves venue and format on the match', async () => {
    const { repos, matches, input, setup, openers } = await app();
    const s = await repos.schedules.create(input);
    const matchId = await matches.startMatch(setup, openers, { details: { venue: 'Eastfield Park', formatName: 'T10' }, scheduleId: s.id });
    expect(await repos.schedules.get(s.id)).toMatchObject({ status: 'started', matchId });
    expect((await matches.loadMatch(matchId))!.details).toEqual({ venue: 'Eastfield Park', formatName: 'T10' });

    // A second start (double tap, or a second phone screen) is refused and creates nothing.
    await expect(matches.startMatch(setup, openers, { scheduleId: s.id })).rejects.toThrow(/already been started/);
    expect(await repos.matches.list()).toHaveLength(1);
    // A started schedule can no longer be edited or cancelled.
    await expect(repos.schedules.update(s.id, input)).rejects.toThrow(/already started/);
    await expect(repos.schedules.setCancelled(s.id, true)).rejects.toThrow(/already started/);
  });

  it('a cancelled schedule cannot be started', async () => {
    const { repos, matches, input, setup, openers } = await app();
    const s = await repos.schedules.create(input);
    await repos.schedules.setCancelled(s.id, true);
    await expect(matches.startMatch(setup, openers, { scheduleId: s.id })).rejects.toThrow(/cancelled/);
    expect(await repos.matches.list()).toEqual([]);
  });

  it('deleting the match keeps the schedule as started, without a link', async () => {
    const { repos, matches, input, setup, openers } = await app();
    const s = await repos.schedules.create(input);
    const matchId = await matches.startMatch(setup, openers, { scheduleId: s.id });
    await matches.deleteMatch(matchId);
    expect(await repos.schedules.get(s.id)).toMatchObject({ status: 'started', matchId: null });
  });
});

describe('scheduled matches in backups', () => {
  it('are backed up and restored, including the link to a started match', async () => {
    const source = await app();
    await source.repos.schedules.create(source.input);
    const started = await source.repos.schedules.create({ ...source.input, venue: 'Second ground' });
    await source.matches.startMatch(source.setup, source.openers, { scheduleId: started.id });
    const { json } = await source.backups.createBackup();

    const target = await app();
    const preview = await target.backups.previewRestore(json);
    if (!preview.ok) throw new Error(preview.errors.join('\n'));
    await target.backups.restore(preview.backup);
    expect(await target.repos.schedules.list()).toEqual(await source.repos.schedules.list());
  });

  it('rejects a schedule for a missing team, or a link to a match it did not start', async () => {
    const source = await app();
    await source.repos.schedules.create(source.input);
    const file = JSON.parse((await source.backups.createBackup()).json);

    const missingTeam = structuredClone(file);
    missingTeam.data.scheduledMatches[0].team_a_id = 'ghost';
    expect(parseBackup(JSON.stringify(missingTeam))).toMatchObject({ ok: false, errors: [expect.stringMatching(/missing team \(ghost\)/)] });

    const badLink = structuredClone(file);
    badLink.data.scheduledMatches[0].match_id = 'ghost';
    const check = parseBackup(JSON.stringify(badLink));
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.errors.join('\n')).toMatch(/not marked as started[\s\S]*missing match/);
  });
});
