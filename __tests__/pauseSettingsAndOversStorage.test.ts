// Pausing, settings changed before the first ball, closing an innings and reduced overs, against
// a real SQLite engine (node:sqlite): saved durably, shown in the match list, carried by backups.
import { parseBackup } from '../src/backup/backupFormat';
import { eventToRow, rowToEvent } from '../src/data/matchEventRows';
import { migrate, MIGRATIONS } from '../src/data/migrations';
import { createRepositories } from '../src/data/repositories';
import type { MatchEvent } from '../src/domain/match';
import { ScoringError } from '../src/domain/scoring';
import { createBackupService } from '../src/services/backupService';
import { createMatchService, type LoadedMatch } from '../src/services/matchService';
import { createTestDatabase, testDeps } from './helpers/testDatabase';
import { memoryLogoFiles } from './helpers/memoryLogoFiles';
import { makeSetup, TestMatch } from './helpers/matchBuilder';

async function app() {
  const db = createTestDatabase();
  await migrate(db);
  const repos = createRepositories(db, testDeps());
  const matches = createMatchService(repos.matches);
  const backups = createBackupService(repos.backups, {
    appVersion: '1.1.0',
    now: () => new Date(Date.UTC(2026, 9, 31, 12, 0)),
    logos: memoryLogoFiles(),
  });
  // Players and teams as the setup helper names them (a1..a4, b1..b4; 4 a side, 2 overs).
  const setup = makeSetup({ playersPerSide: 4, oversPerInnings: 2 });
  for (const team of setup.teams) {
    for (const p of team.players) await db.run('INSERT INTO players (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [p.playerId, p.name, 't', 't']);
    await db.run('INSERT INTO teams (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [team.teamId, team.name, 't', 't']);
  }
  const id = await matches.startMatch(setup, { strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b1' });
  return { db, repos, matches, backups, id, m: (await matches.loadMatch(id))! };
}

function delivery(m: LoadedMatch, runs = 0): MatchEvent {
  const tm = new TestMatch(m.setup);
  tm.events = [...m.events];
  return tm.deliveryEvent({ runs });
}

describe('pausing a match', () => {
  it('is saved with its reason, shown in the list, and cleared by resuming', async () => {
    const { repos, matches, id, m } = await app();
    const paused = await matches.setPause(m, { reason: ' Rain ' });
    expect(paused.pause).toMatchObject({ reason: 'Rain' });
    expect((await matches.loadMatch(id))!.pause).toEqual(paused.pause);
    expect((await repos.matches.list())[0]).toMatchObject({ status: 'inProgress', pause: { reason: 'Rain' }, abandoned: false });

    const resumed = await matches.setPause(paused, null);
    expect(resumed.pause).toBeNull();
    expect((await repos.matches.list())[0].pause).toBeNull();

    // No reason is fine too; a long one is refused.
    expect((await matches.setPause(resumed, { reason: null })).pause).toMatchObject({ reason: null });
    await expect(matches.setPause(resumed, { reason: 'x'.repeat(41) })).rejects.toBeInstanceOf(ScoringError);
  });

  it('a completed match cannot be paused, and is never listed as paused', async () => {
    const { repos, matches, id, m } = await app();
    await matches.setPause(m, { reason: 'Bad light' });
    const abandoned = await matches.recordEvent(m, { type: 'abandon' });
    await expect(matches.setPause(abandoned, { reason: 'Rain' })).rejects.toThrow('The match is already complete.');
    expect((await repos.matches.list())[0]).toMatchObject({ status: 'completed', abandoned: true, pause: null });
    expect((await matches.loadMatch(id))!.pause).toBeNull();
    // Undo reopens the match: it was paused when abandoned, so it is paused again.
    await matches.undo(abandoned);
    expect((await repos.matches.list())[0]).toMatchObject({ status: 'inProgress', abandoned: false, pause: { reason: 'Bad light' } });
  });
});

describe('match settings before the first ball', () => {
  it('change the overs, team sizes, bowling limit and free hit', async () => {
    const { matches, id, m } = await app();
    const changed = await matches.updateSettings(m, { oversPerInnings: 5, maxOversPerBowler: 2, freeHitAfterNoBall: false, sizes: [6, 4] });
    expect(changed.state.innings[0]).toMatchObject({ oversLimit: 5, wicketsLimit: 5 });
    const reloaded = (await matches.loadMatch(id))!;
    expect(reloaded.setup.rules).toEqual({ oversPerInnings: 5, maxOversPerBowler: 2, freeHitAfterNoBall: false });
    expect(reloaded.setup.teams.map((t) => t.size)).toEqual([6, undefined]);
    expect(reloaded.state.innings[0].oversLimit).toBe(5);
  });

  it('are refused when they do not fit, and once a ball has been bowled', async () => {
    const { matches, id, m } = await app();
    await expect(matches.updateSettings(m, { oversPerInnings: 2, maxOversPerBowler: null, freeHitAfterNoBall: true, sizes: [3, 4] })).rejects.toThrow(
      'Alpha has 4 players in the lineup, more than its 3 players per side.',
    );
    await expect(matches.updateSettings(m, { oversPerInnings: 9, maxOversPerBowler: 1, freeHitAfterNoBall: true, sizes: [4, 4] })).rejects.toThrow(
      /cannot be bowled/,
    );
    const afterBall = await matches.recordEvent(m, delivery(m));
    await expect(matches.updateSettings(afterBall, { oversPerInnings: 5, maxOversPerBowler: null, freeHitAfterNoBall: true, sizes: [4, 4] })).rejects.toThrow(
      /first ball has been bowled/,
    );
    expect((await matches.loadMatch(id))!.setup.rules.oversPerInnings).toBe(2);
  });
});

describe('closing an innings and changing the overs', () => {
  it('are saved and replayed on reload', async () => {
    const { matches, id, m: start } = await app();
    let m = await matches.recordEvent(start, delivery(start, 4));
    m = await matches.recordEvent(m, { type: 'reviseOvers', overs: 1, target: null, maxOversPerBowler: null });
    m = await matches.recordEvent(m, { type: 'closeInnings' });
    m = await matches.recordEvent(m, { type: 'reviseOvers', overs: 1, target: 3, maxOversPerBowler: 1 });
    const reloaded = (await matches.loadMatch(id))!;
    expect(reloaded.events).toEqual(m.events);
    expect(reloaded.state.innings[0]).toMatchObject({ endReason: 'closed', oversLimit: 1, runs: 4 });
    expect(reloaded.state.revisedTarget).toBe(3);
  });

  it('round-trip through event rows', () => {
    for (const event of [
      { type: 'closeInnings' },
      { type: 'reviseOvers', overs: 12, target: 98, maxOversPerBowler: 3 },
      { type: 'reviseOvers', overs: 7, target: null, maxOversPerBowler: null },
    ] as MatchEvent[]) {
      const row = eventToRow(3, { event, inningsIndex: 1, record: null });
      expect(rowToEvent(row)).toEqual(event);
    }
  });

  it('are carried by a backup, with the pause', async () => {
    const { matches, backups, id, m: start } = await app();
    let m = await matches.recordEvent(start, delivery(start, 2));
    m = await matches.recordEvent(m, { type: 'reviseOvers', overs: 1, target: null, maxOversPerBowler: null });
    m = await matches.setPause(m, { reason: 'Rain' });
    const check = parseBackup((await backups.createBackup()).json);
    if (!check.ok) throw new Error(check.errors.join('\n'));
    expect(check.backup.file.data.matches[0]).toMatchObject({ abandoned: 0, pause_reason: 'Rain' });
    await backups.restore(check.backup);
    const restored = (await matches.loadMatch(id))!;
    expect(restored.events).toEqual(m.events);
    expect(restored.pause).toMatchObject({ reason: 'Rain' });
  });

  it('a schema 8 backup is upgraded: not paused, abandoned worked out from the events', async () => {
    const { matches, backups, m } = await app();
    await matches.recordEvent(m, { type: 'abandon' });
    const file = JSON.parse((await backups.createBackup()).json);
    file.schemaVersion = 8;
    for (const e of file.data.matchEvents) for (const c of ['revised_overs', 'revised_target', 'revised_bowler_limit']) delete e[c];
    for (const row of file.data.matches) for (const c of ['abandoned', 'paused_at', 'pause_reason']) delete row[c];
    const check = parseBackup(JSON.stringify(file));
    if (!check.ok) throw new Error(check.errors.join('\n'));
    expect(check.backup.file.data.matches[0]).toMatchObject({ abandoned: 1, paused_at: null, pause_reason: null });
  });
});

describe('migration 9', () => {
  it('flags abandoned matches, and allows the new events and the pause', async () => {
    const db = createTestDatabase();
    await migrate(db, MIGRATIONS.slice(0, 8));
    await db.run("INSERT INTO teams (id, name, created_at, updated_at) VALUES ('t1', 'T1', 't', 't'), ('t2', 'T2', 't', 't')");
    for (const [id, status, summary] of [
      ['m1', 'completed', 'No result (match abandoned)'],
      ['m2', 'completed', 'T1 won by 3 runs'],
      ['m3', 'inProgress', 'T1 4/0 (0.1 ov)'],
    ]) {
      await db.run(
        `INSERT INTO matches (id, status, team_a_id, team_a_name, team_b_id, team_b_name, overs_per_innings, players_per_side,
           free_hit_after_no_ball, toss_winner_team_id, toss_decision, summary, event_count, created_at, updated_at)
         VALUES (?, ?, 't1', 'T1', 't2', 'T2', 1, 2, 1, 't1', 'bat', ?, 1, 't', 't')`,
        [id, status, summary],
      );
    }
    await db.run("INSERT INTO match_events (match_id, seq, type, innings_index, striker_id, created_at) VALUES ('m3', 0, 'inningsStart', 0, 'p1', 'when')");
    await migrate(db);
    expect(await db.all('SELECT id, abandoned, paused_at, pause_reason FROM matches ORDER BY id')).toEqual([
      { id: 'm1', abandoned: 1, paused_at: null, pause_reason: null },
      { id: 'm2', abandoned: 0, paused_at: null, pause_reason: null },
      { id: 'm3', abandoned: 0, paused_at: null, pause_reason: null },
    ]);
    expect(await db.all('SELECT seq, type, striker_id, revised_overs FROM match_events')).toEqual([
      { seq: 0, type: 'inningsStart', striker_id: 'p1', revised_overs: null },
    ]);
    await db.run("INSERT INTO match_events (match_id, seq, type, innings_index, revised_overs, revised_target, created_at) VALUES ('m3', 1, 'reviseOvers', 0, 5, 40, 'when')");
    await db.run("INSERT INTO match_events (match_id, seq, type, innings_index, created_at) VALUES ('m3', 2, 'closeInnings', 0, 'when')");
    await expect(
      db.run("INSERT INTO match_events (match_id, seq, type, innings_index, revised_overs, created_at) VALUES ('m3', 3, 'reviseOvers', 0, 0, 'when')"),
    ).rejects.toThrow();
    await expect(db.run("UPDATE matches SET pause_reason = '' WHERE id = 'm3'")).rejects.toThrow();
  });
});
