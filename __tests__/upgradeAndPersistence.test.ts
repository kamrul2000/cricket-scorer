// Existing data survives every migration, and new event types are saved durably.
import { parseBackup } from '../src/backup/backupFormat';
import { eventToRow } from '../src/data/matchEventRows';
import { MIGRATIONS, migrate } from '../src/data/migrations';
import { createRepositories } from '../src/data/repositories';
import type { MatchEvent } from '../src/domain/match';
import { createBackupService } from '../src/services/backupService';
import { createMatchService, type LoadedMatch } from '../src/services/matchService';
import { createTestDatabase, testDeps } from './helpers/testDatabase';
import { TestMatch } from './helpers/matchBuilder';
import { memoryLogoFiles } from './helpers/memoryLogoFiles';

const T = '2026-01-01T00:00:00.000Z';

/** A database created by the Stage 4 app (schema 2) with one match in progress. */
async function schema2Database() {
  const db = createTestDatabase();
  await migrate(db, MIGRATIONS.slice(0, 2));
  for (const [id, name] of [['p1', 'Asha'], ['p2', 'Bilal'], ['p3', 'Chen'], ['p4', 'Dev']]) {
    await db.run('INSERT INTO players (id, name, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, NULL)', [id, name, T, T]);
  }
  for (const [id, name] of [['t1', 'Tigers'], ['t2', 'Lions']]) {
    await db.run('INSERT INTO teams (id, name, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, NULL)', [id, name, T, T]);
  }
  for (const [t, p] of [['t1', 'p1'], ['t1', 'p2'], ['t2', 'p3'], ['t2', 'p4']]) {
    await db.run('INSERT INTO team_players (team_id, player_id, added_at) VALUES (?, ?, ?)', [t, p, T]);
  }
  await db.run(
    `INSERT INTO matches (id, status, team_a_id, team_a_name, team_b_id, team_b_name, overs_per_innings, players_per_side,
       free_hit_after_no_ball, max_overs_per_bowler, toss_winner_team_id, toss_decision, summary, event_count, created_at, updated_at)
     VALUES ('m1', 'inProgress', 't1', 'Tigers', 't2', 'Lions', 2, 2, 1, NULL, 't1', 'bat', 'Tigers 4/0 (0.1 ov)', 2, ?, ?)`,
    [T, T],
  );
  const lineup = [['t1', 'p1', 0, 'Asha'], ['t1', 'p2', 1, 'Bilal'], ['t2', 'p3', 0, 'Chen'], ['t2', 'p4', 1, 'Dev']] as const;
  for (const [t, p, order, name] of lineup) {
    await db.run('INSERT INTO match_players (match_id, team_id, player_id, lineup_order, player_name) VALUES (?, ?, ?, ?, ?)', ['m1', t, p, order, name]);
  }
  const events: MatchEvent[] = [
    { type: 'inningsStart', strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'p3' },
    { type: 'delivery', ballType: 'fair', runsFrom: 'bat', runs: 0, boundary: 'four', dismissal: null, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'p3' },
  ];
  for (let seq = 0; seq < events.length; seq++) {
    const row = eventToRow(seq, { event: events[seq], inningsIndex: 0, record: null });
    const cols = Object.keys(row);
    await db.run(
      `INSERT INTO match_events (match_id, created_at, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
      ['m1', T, ...cols.map((c) => row[c as keyof typeof row])],
    );
  }
  return db;
}

function delivery(m: LoadedMatch, input: Parameters<TestMatch['deliveryEvent']>[0] = {}): MatchEvent {
  const tm = new TestMatch(m.setup);
  tm.events = [...m.events];
  return tm.deliveryEvent(input);
}

describe('upgrading a Stage 4 database', () => {
  it('keeps every player, team, roster and match, and the match resumes exactly where it was', async () => {
    const db = await schema2Database();
    await migrate(db);
    const repos = createRepositories(db, testDeps());
    const service = createMatchService(repos.matches);

    expect((await repos.players.list()).map((p) => p.name)).toEqual(['Asha', 'Bilal', 'Chen', 'Dev']);
    expect(await repos.teams.get('t1')).toMatchObject({
      name: 'Tigers',
      playerIds: ['p1', 'p2'],
      description: '',
      logoFile: null,
      captainId: null,
      viceCaptainId: null,
    });
    const m = (await service.loadMatch('m1'))!;
    expect(m.state.innings[0]).toMatchObject({ runs: 4, legalBalls: 1, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'p3' });

    // New features work on the upgraded data.
    const swapped = await service.recordEvent(m, { type: 'swapBatters' });
    expect(swapped.state.innings[0].strikerId).toBe('p2');
  });
});

describe('new events are saved and replayed', () => {
  it('a batter swap and an abandon survive reloading, and undo removes them durably', async () => {
    const db = await schema2Database();
    await migrate(db);
    const repos = createRepositories(db, testDeps());
    const service = createMatchService(repos.matches);

    let m = (await service.loadMatch('m1'))!;
    m = await service.recordEvent(m, { type: 'swapBatters' });
    m = await service.recordEvent(m, delivery(m, { runs: 1 }));
    let reloaded = (await service.loadMatch('m1'))!;
    expect(reloaded.events).toEqual(m.events);
    expect(reloaded.state).toEqual(m.state);
    expect(reloaded.state.innings[0].batters.find((b) => b.playerId === 'p2')!.runs).toBe(1);

    m = await service.recordEvent(m, { type: 'abandon' });
    expect((await repos.matches.list())[0]).toMatchObject({ status: 'completed', summary: 'No result (match abandoned)' });
    m = await service.undo(m);
    reloaded = (await service.loadMatch('m1'))!;
    expect(reloaded.state.result).toBeNull();
    expect((await repos.matches.list())[0].status).toBe('inProgress');
  });
});

describe('older backups', () => {
  it('a backup made with schema 2 is upgraded and restores', async () => {
    const db = await schema2Database();
    await migrate(db);
    const repos = createRepositories(db, testDeps());
    const backups = createBackupService(repos.backups, { appVersion: '1.0.0', now: () => new Date(T), logos: memoryLogoFiles() });
    const file = JSON.parse((await backups.createBackup()).json);
    // Rewrite it exactly as the Stage 4 app wrote it: format 1, schema 2, no newer columns, no files.
    file.formatVersion = 1;
    file.schemaVersion = 2;
    delete file.files;
    for (const t of file.data.teams) for (const c of ['description', 'logo_file', 'captain_id', 'vice_captain_id']) delete t[c];
    for (const p of file.data.matchPlayers) for (const c of ['is_substitute', 'role']) delete p[c];
    const check = parseBackup(JSON.stringify(file));
    if (!check.ok) throw new Error(check.errors.join('\n'));
    expect(check.backup.file.data.teams[0]).toMatchObject({ description: '', logo_file: null, captain_id: null });
    expect(check.backup.file.data.matchPlayers[0]).toMatchObject({ is_substitute: 0, role: null });
  });
});
