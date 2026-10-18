// Backup export, validation and restore against a real SQLite engine (node:sqlite).
import {
  BACKUP_FORMAT,
  backupFileName,
  MAX_BACKUP_CHARS,
  parseBackup,
} from '../src/backup/backupFormat';
import { migrate } from '../src/data/migrations';
import { createRepositories } from '../src/data/repositories';
import type { MatchEvent } from '../src/domain/match';
import { createBackupService } from '../src/services/backupService';
import { createMatchService, faultInjection, type LoadedMatch } from '../src/services/matchService';
import { createTestDatabase, testDeps } from './helpers/testDatabase';
import { TestMatch } from './helpers/matchBuilder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addReleaseSigning } = require('../plugins/withReleaseSigning');

async function emptyApp() {
  const db = createTestDatabase();
  await migrate(db);
  const repos = createRepositories(db, testDeps());
  const matches = createMatchService(repos.matches);
  const backups = createBackupService(repos.backups, {
    appVersion: '1.0.0',
    now: () => new Date(Date.UTC(2026, 9, 18, 15, 30)),
  });
  return { db, repos, matches, backups };
}

function delivery(m: LoadedMatch, input: Parameters<TestMatch['deliveryEvent']>[0] = {}): MatchEvent {
  const tm = new TestMatch(m.setup);
  tm.events = [...m.events];
  return tm.deliveryEvent(input);
}

/** An app with a roster, an archived player, one completed match and one in progress. */
async function populatedApp() {
  const app = await emptyApp();
  const { repos, matches } = app;
  const a = await Promise.all(['A1', 'A2', 'A3'].map((n) => repos.players.create(n)));
  const b = await Promise.all(['B1', 'B2', 'B3'].map((n) => repos.players.create(n)));
  const spare = await repos.players.create('Spare');
  await repos.players.setArchived(spare.id, true);
  const teamA = await repos.teams.create('Alpha', a.map((p) => p.id));
  const teamB = await repos.teams.create('Bravo', b.map((p) => p.id));
  const setup = {
    rules: { oversPerInnings: 1, playersPerSide: 3, freeHitAfterNoBall: true, maxOversPerBowler: null },
    teams: [
      { teamId: teamA.id, name: 'Alpha', players: a.map((p) => ({ playerId: p.id, name: p.name })) },
      { teamId: teamB.id, name: 'Bravo', players: b.map((p) => ({ playerId: p.id, name: p.name })) },
    ] as const,
    toss: { winnerTeamId: teamA.id, decision: 'bat' as const },
  };
  const openers = { strikerId: a[0].id, nonStrikerId: a[1].id, bowlerId: b[0].id };

  // Completed: Alpha 1/0 in one over, Bravo chase it down.
  const doneId = await matches.startMatch({ ...setup, teams: [...setup.teams] }, openers);
  let m = (await matches.loadMatch(doneId))!;
  m = await matches.recordEvent(m, delivery(m, { ballType: 'wide', runs: 0 }));
  for (let i = 0; i < 6; i++) m = await matches.recordEvent(m, delivery(m, { runs: 0 }));
  m = await matches.recordEvent(m, {
    type: 'inningsStart',
    strikerId: b[0].id,
    nonStrikerId: b[1].id,
    bowlerId: a[0].id,
  });
  m = await matches.recordEvent(m, delivery(m, { boundary: 'four' }));
  expect(m.state.result).not.toBeNull();

  // In progress: two balls bowled.
  const liveId = await matches.startMatch({ ...setup, teams: [...setup.teams] }, openers);
  let live = (await matches.loadMatch(liveId))!;
  live = await matches.recordEvent(live, delivery(live, { runs: 1 }));
  await matches.recordEvent(live, delivery(live, { runs: 2 }));

  return { ...app, doneId, liveId };
}

/** The exported backup as a plain object, for tampering with in tests. */
async function exportedObject(app: Awaited<ReturnType<typeof emptyApp>>) {
  return JSON.parse((await app.backups.createBackup()).json);
}

afterEach(() => {
  faultInjection.failNextSave = false;
});

describe('backup export', () => {
  it('writes a versioned file that passes its own checks', async () => {
    const app = await populatedApp();
    const backup = await app.backups.createBackup();
    const file = JSON.parse(backup.json);
    expect(file).toMatchObject({
      format: BACKUP_FORMAT,
      formatVersion: 1,
      schemaVersion: 2,
      appVersion: '1.0.0',
      exportedAt: '2026-10-18T15:30:00.000Z',
    });
    expect(backup.summary).toEqual({ players: 7, teams: 2, matches: 2, inProgress: 1, completed: 1 });
    expect(backup.fileName).toMatch(/^cricket-scorer-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    expect(parseBackup(backup.json).ok).toBe(true);
  });

  it('names files by local date and time', () => {
    expect(backupFileName(new Date(2026, 0, 5, 9, 7))).toBe('cricket-scorer-backup-2026-01-05-0907.json');
  });

  it('refuses to create a backup of damaged data, instead of saving one that cannot be restored', async () => {
    const app = await populatedApp();
    await app.db.run('DELETE FROM match_events WHERE match_id = ? AND seq = 2', [app.doneId]);
    await expect(app.backups.createBackup()).rejects.toThrow(/not created/);
  });
});

describe('restore', () => {
  it('restores into an empty app with identical data and identical match states', async () => {
    const source = await populatedApp();
    const { json } = await source.backups.createBackup();
    const target = await emptyApp();

    const preview = await target.backups.previewRestore(json);
    if (!preview.ok) throw new Error(preview.errors.join('\n'));
    expect(preview.current).toEqual({ players: 0, teams: 0, matches: 0 });
    await target.backups.restore(preview.backup);

    expect(await target.repos.backups.exportAll()).toEqual(await source.repos.backups.exportAll());
    for (const id of [source.doneId, source.liveId]) {
      const restored = (await target.matches.loadMatch(id))!;
      expect(restored.state).toEqual((await source.matches.loadMatch(id))!.state);
    }
    expect(await target.repos.matches.list()).toEqual(await source.repos.matches.list());
  });

  it('replaces existing data completely (no merge) and resumes the in-progress match', async () => {
    const source = await populatedApp();
    const { json } = await source.backups.createBackup();
    const target = await emptyApp();
    await target.repos.players.create('Only here');
    const preview = await target.backups.previewRestore(json);
    if (!preview.ok) throw new Error('expected a valid backup');
    expect(preview.current).toEqual({ players: 1, teams: 0, matches: 0 });
    await target.backups.restore(preview.backup);

    const names = (await target.repos.players.list({ includeArchived: true })).map((p) => p.name);
    expect(names).not.toContain('Only here');
    expect(names).toHaveLength(7);
    // Scoring continues on the restored match.
    const live = (await target.matches.loadMatch(source.liveId))!;
    const next = await target.matches.recordEvent(live, delivery(live, { runs: 4 }));
    expect(next.state.innings[0].runs).toBe(7);
  });

  it('recomputes derived values from the events instead of trusting the file', async () => {
    const source = await populatedApp();
    const file = await exportedObject(source);
    for (const e of file.data.matchEvents) if (e.type === 'delivery') e.total_runs = 99;
    for (const m of file.data.matches) {
      m.summary = 'tampered';
      m.status = 'inProgress';
    }
    const target = await emptyApp();
    const preview = await target.backups.previewRestore(JSON.stringify(file));
    if (!preview.ok) throw new Error(preview.errors.join('\n'));
    await target.backups.restore(preview.backup);
    expect(await target.repos.backups.exportAll()).toEqual(await source.repos.backups.exportAll());
  });

  it('a restore that fails while writing changes nothing', async () => {
    const source = await populatedApp();
    const { json } = await source.backups.createBackup();
    const target = await emptyApp();
    await target.repos.players.create('Keep me');
    const before = await target.repos.backups.exportAll();
    const preview = await target.backups.previewRestore(json);
    if (!preview.ok) throw new Error('expected a valid backup');

    faultInjection.failNextSave = true;
    await expect(target.backups.restore(preview.backup)).rejects.toThrow(/Simulated/);
    expect(await target.repos.backups.exportAll()).toEqual(before);
  });

  it('the database rejects bad rows during replaceAll and rolls back everything', async () => {
    const source = await populatedApp();
    const data = await source.repos.backups.exportAll();
    const target = await emptyApp();
    await target.repos.players.create('Keep me');
    const before = await target.repos.backups.exportAll();
    // Bypasses validation on purpose: a duplicate primary key fails inside the transaction.
    const bad = { ...data, players: [...data.players, data.players[0]] };
    await expect(target.repos.backups.replaceAll(bad)).rejects.toThrow();
    expect(await target.repos.backups.exportAll()).toEqual(before);
  });
});

describe('invalid backups are rejected before anything is written', () => {
  type Tamper = (file: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  const cases: [string, Tamper, RegExp][] = [
    ['an unknown format marker', (f) => (f.format = 'something-else'), /not a Local Cricket Scorer backup/],
    ['a newer backup format', (f) => (f.formatVersion = 2), /newer version of the app/],
    ['a newer database schema', (f) => (f.schemaVersion = 3), /newer version of the app/],
    ['an older database schema', (f) => (f.schemaVersion = 1), /not supported/],
    ['a missing export date', (f) => delete f.exportedAt, /export details/],
    ['a missing table', (f) => delete f.data.teams, /missing the teams table/],
    ['a wrong value type', (f) => (f.data.players[0].name = 5), /players row 1 has an invalid "name"/],
    ['a missing column', (f) => delete f.data.matches[0].toss_decision, /matches row 1 is missing "toss_decision"/],
    ['an unknown column', (f) => (f.data.players[0].nickname = 'x'), /unknown field "nickname"/],
    ['a fractional number', (f) => (f.data.matches[0].overs_per_innings = 1.5), /invalid "overs_per_innings"/],
    ['an invalid name', (f) => (f.data.players[0].name = '   '), /invalid name/],
    ['a duplicate ID', (f) => f.data.players.push({ ...f.data.players[0] }), /share the ID/],
    ['duplicate active team names', (f) => (f.data.teams[1].name = f.data.teams[0].name.toUpperCase()), /both named/],
    ['a roster entry for a missing player', (f) => (f.data.teamPlayers[0].player_id = 'ghost'), /missing player \(ghost\)/],
    ['a match against a missing team', (f) => (f.data.matches[0].team_b_id = 'ghost'), /missing team \(ghost\)/],
    ['events for a missing match', (f) => (f.data.matchEvents[0].match_id = 'ghost'), /missing match \(ghost\)/],
    ['a gap in the ball-by-ball history', (f) => f.data.matchEvents.splice(1, 1), /incomplete/],
    ['a lineup of the wrong size', (f) => f.data.matchPlayers.pop(), /must have exactly 3 players/],
    ['an invalid stored event', (f) => (f.data.matchEvents[1].ball_type = 'bouncer'), /invalid ball type/],
    [
      'an event the scoring engine rejects',
      (f) => {
        const d = f.data.matchEvents.find((e: { type: string }) => e.type === 'delivery');
        d.striker_id = d.bowler_id; // a bowler cannot bat
      },
      /cannot be replayed/,
    ],
  ];

  it.each(cases)('rejects %s', async (_name, tamper, expected) => {
    const source = await populatedApp();
    const file = await exportedObject(source);
    tamper(file);
    const target = await emptyApp();
    await target.repos.players.create('Keep me');
    const before = await target.repos.backups.exportAll();

    const preview = await target.backups.previewRestore(JSON.stringify(file));
    expect(preview.ok).toBe(false);
    if (preview.ok) return;
    expect(preview.errors.join('\n')).toMatch(expected);
    expect(await target.repos.backups.exportAll()).toEqual(before);
  });

  it('rejects text that is not JSON, or JSON that is not a backup', () => {
    expect(parseBackup('{"format": "local-cricket-')).toEqual({ ok: false, errors: [expect.stringMatching(/not valid JSON/)] });
    expect(parseBackup('[1, 2, 3]')).toEqual({ ok: false, errors: [expect.stringMatching(/not a Local Cricket Scorer backup/)] });
    expect(parseBackup('')).toMatchObject({ ok: false });
  });

  it('rejects an oversized file without parsing it', () => {
    expect(parseBackup(' '.repeat(MAX_BACKUP_CHARS + 1))).toEqual({ ok: false, errors: [expect.stringMatching(/too large/)] });
  });

  it('reports a limited number of problems', async () => {
    const source = await populatedApp();
    const file = await exportedObject(source);
    for (const p of file.data.players) p.name = 7;
    for (const t of file.data.teams) t.name = 7;
    for (const tp of file.data.teamPlayers) tp.added_at = 7; // 7 + 2 + 6 = 15 problems
    const check = parseBackup(JSON.stringify(file));
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.errors).toHaveLength(10);
      expect(check.errors[9]).toMatch(/and \d+ more problems/);
    }
  });
});

describe('check stored data', () => {
  it('finds no problems in good data', async () => {
    const app = await populatedApp();
    expect(await app.backups.checkData()).toEqual({
      problems: [],
      summary: { players: 7, teams: 2, matches: 2, inProgress: 1, completed: 1 },
    });
  });

  it('reports a match whose history was damaged', async () => {
    const app = await populatedApp();
    await app.db.run("UPDATE match_events SET runs_completed = 9 WHERE match_id = ? AND seq = 1", [app.liveId]);
    const report = await app.backups.checkData();
    expect(report.summary).toBeNull();
    expect(report.problems.join('\n')).toMatch(/Match "Alpha v Bravo"/);
  });
});

describe('release signing config plugin', () => {
  // The relevant part of the build.gradle that `npx expo prebuild` generates for SDK 57.
  const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
        }
    }
}
`;

  it('signs release builds with the upload key and keeps debug builds on the debug key', () => {
    const out: string = addReleaseSigning(TEMPLATE);
    expect(out).toMatch(/release \{\s*\/\/ Added by plugins\/withReleaseSigning\.js\s*if \(project\.hasProperty\('CRICKET_UPLOAD_STORE_FILE'\)\)/);
    expect(out).toMatch(/release \{[^}]*signingConfig signingConfigs\.release/);
    expect(out).toMatch(/buildTypes \{\s*debug \{\s*signingConfig signingConfigs\.debug/);
    expect(out).not.toMatch(/release \{[^}]*signingConfig signingConfigs\.debug/);
    expect(out).toContain('throw new GradleException("Release signing is not set up.');
  });

  it('is safe to apply twice and fails loudly on an unknown template', () => {
    const once: string = addReleaseSigning(TEMPLATE);
    expect(addReleaseSigning(once)).toBe(once);
    expect(() => addReleaseSigning('android { }')).toThrow(/could not find/);
  });
});
