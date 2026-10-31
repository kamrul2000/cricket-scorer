// Retirements, bowler replacement, Super Overs, unequal lineups and edits, against a real SQLite
// engine (node:sqlite): saved durably, replayed on reload, and carried by backups.
import { parseBackup } from '../src/backup/backupFormat';
import { eventToRow, rowToEvent } from '../src/data/matchEventRows';
import { migrate, MIGRATIONS } from '../src/data/migrations';
import { createRepositories } from '../src/data/repositories';
import { RepositoryError } from '../src/data/RepositoryError';
import type { DeliveryEvent, MatchEvent, MatchSetup } from '../src/domain/match';
import { ScoringError } from '../src/domain/scoring';
import { createBackupService } from '../src/services/backupService';
import { createMatchService, faultInjection, storableEvents, type LoadedMatch } from '../src/services/matchService';
import { createTestDatabase, testDeps } from './helpers/testDatabase';
import { memoryLogoFiles } from './helpers/memoryLogoFiles';
import { makeSetup, out, TestMatch } from './helpers/matchBuilder';

async function app() {
  const db = createTestDatabase();
  await migrate(db);
  const repos = createRepositories(db, testDeps());
  const matches = createMatchService(repos.matches);
  const backups = createBackupService(repos.backups, {
    appVersion: '1.0.0',
    now: () => new Date(Date.UTC(2026, 9, 29, 12, 0)),
    logos: memoryLogoFiles(),
  });
  // 4 v 3 players, so the lineups differ.
  const a = await Promise.all(['A1', 'A2', 'A3', 'A4'].map((n) => repos.players.create(n)));
  const b = await Promise.all(['B1', 'B2', 'B3'].map((n) => repos.players.create(n)));
  const tA = await repos.teams.create('Alpha', a.map((p) => p.id));
  const tB = await repos.teams.create('Bravo', b.map((p) => p.id));
  const setup: MatchSetup = {
    rules: { oversPerInnings: 1, freeHitAfterNoBall: true, maxOversPerBowler: null },
    teams: [
      { teamId: tA.id, name: 'Alpha', players: a.map((p) => ({ playerId: p.id, name: p.name })) },
      { teamId: tB.id, name: 'Bravo', players: b.map((p) => ({ playerId: p.id, name: p.name })) },
    ],
    toss: { winnerTeamId: tA.id, decision: 'bat' },
  };
  return { db, repos, matches, backups, a: a.map((p) => p.id), b: b.map((p) => p.id), setup };
}

function delivery(m: LoadedMatch, input: Parameters<TestMatch['deliveryEvent']>[0] = {}): DeliveryEvent {
  const tm = new TestMatch(m.setup);
  tm.events = [...m.events];
  return tm.deliveryEvent(input);
}

describe('event rows for the new actions', () => {
  it('round-trip through a row, including Super Over innings numbers', () => {
    const tm = new TestMatch(makeSetup({ oversPerInnings: 1, playersPerSide: 3 })).start('a1', 'a2', 'b1');
    tm.ball({ runs: 1 }).replaceBowler('b2').retire('a2', 'hurt').batter('a3').retire('a1', 'out');
    tm.batter('a2').balls(0, 0, 0, 0, 0); // a2 resumes; 6 legal balls in all
    tm.start('b1', 'b2', 'a1').ball({ runs: 1 }).balls(0, 0, 0, 0, 0); // tied 1-1
    tm.event({ type: 'superOver' }).start('b1', 'b2', 'a3').ball({ runs: 0 });
    const items = storableEvents(tm.state, tm.events);
    expect(items.map((i) => i.inningsIndex).slice(-3)).toEqual([1, 2, 2]); // superOver event, then innings 2
    items.forEach((item, seq) => {
      expect(rowToEvent(eventToRow(seq, item))).toEqual(tm.events[seq]);
    });
    expect(eventToRow(0, items[3])).toMatchObject({ type: 'retire', player_id: 'a2', retirement: 'hurt' });
  });
});

describe('saving and replaying the new actions', () => {
  it('a 4 v 3 match with a retirement, a bowler change and a Super Over survives reloading', async () => {
    const { matches, a, b, setup } = await app();
    const id = await matches.startMatch(setup, { strikerId: a[0], nonStrikerId: a[1], bowlerId: b[0] });
    let m = (await matches.loadMatch(id))!;
    m = await matches.recordEvent(m, delivery(m, { runs: 1 }));
    m = await matches.recordEvent(m, { type: 'replaceBowler', playerId: b[1] });
    m = await matches.recordEvent(m, { type: 'retire', playerId: a[1], retirement: 'hurt' });
    m = await matches.recordEvent(m, { type: 'newBatter', playerId: a[2] });
    for (let i = 0; i < 5; i++) m = await matches.recordEvent(m, delivery(m));
    m = await matches.recordEvent(m, { type: 'inningsStart', strikerId: b[0], nonStrikerId: b[1], bowlerId: a[0] });
    m = await matches.recordEvent(m, delivery(m, { runs: 1 }));
    for (let i = 0; i < 5; i++) m = await matches.recordEvent(m, delivery(m));
    expect(m.state.result).toEqual({ type: 'tie' });
    m = await matches.recordEvent(m, { type: 'superOver' });

    const reloaded = (await matches.loadMatch(id))!;
    expect(reloaded.events).toEqual(m.events);
    expect(reloaded.setup).toEqual(setup); // lineups of different sizes kept
    expect(reloaded.state.innings[0]).toMatchObject({ wicketsLimit: 3, retirements: [expect.objectContaining({ retirement: 'hurt' })] });
    expect(reloaded.state.innings[0].overs[0].bowlerIds).toEqual([b[0], b[1]]);
    expect(reloaded.state.innings[1].wicketsLimit).toBe(2);
    expect(reloaded.state.next).toEqual({ type: 'selectOpeners', inningsIndex: 2 });
  });
});

describe('editing an earlier delivery', () => {
  async function scored() {
    const t = await app();
    const id = await t.matches.startMatch(t.setup, { strikerId: t.a[0], nonStrikerId: t.a[1], bowlerId: t.b[0] });
    let m = (await t.matches.loadMatch(id))!;
    m = await t.matches.recordEvent(m, delivery(m, { runs: 1 }));
    m = await t.matches.recordEvent(m, delivery(m));
    m = await t.matches.recordEvent(m, delivery(m, { boundary: 'four' }));
    return { ...t, id, m };
  }

  it('saves the edited history in one go; later balls are kept and reattributed', async () => {
    const { db, matches, repos, id, m, a } = await scored();
    const timesBefore = await db.all<{ seq: number; created_at: string }>('SELECT seq, created_at FROM match_events ORDER BY seq');
    const edited = await matches.editDelivery(m, 1, { ...(m.events[1] as DeliveryEvent), runs: 2 });
    expect(edited.state.innings[0].runs).toBe(6);

    const reloaded = (await matches.loadMatch(id))!;
    expect(reloaded.events).toEqual(edited.events);
    expect((reloaded.events[3] as DeliveryEvent).strikerId).toBe(a[0]);
    expect(reloaded.state.innings[0].batters[0]).toMatchObject({ playerId: a[0], runs: 6 });
    expect(await db.all('SELECT seq, created_at FROM match_events ORDER BY seq')).toEqual(timesBefore);
    expect((await repos.matches.list())[0].summary).toBe('Alpha 6/0 (0.3 ov)');
    const row = await db.first<{ total_runs: number }>('SELECT total_runs FROM match_events WHERE seq = 1');
    expect(row?.total_runs).toBe(2);
  });

  it('a rejected edit writes nothing', async () => {
    const { matches, id, m } = await scored();
    await expect(matches.editDelivery(m, 1, { ...(m.events[1] as DeliveryEvent), ballType: 'wide' })).rejects.toThrow(ScoringError);
    expect((await matches.loadMatch(id))!.events).toEqual(m.events);
  });

  it('a failed save rolls back, and an edit made on an out-of-date history is refused', async () => {
    const { matches, id, m } = await scored();
    faultInjection.failNextSave = true;
    await expect(matches.editDelivery(m, 1, { ...(m.events[1] as DeliveryEvent), runs: 2 })).rejects.toThrow(/Simulated/);
    expect((await matches.loadMatch(id))!.events).toEqual(m.events);

    const later = await matches.recordEvent(m, delivery(m));
    await expect(matches.editDelivery(m, 1, { ...(m.events[1] as DeliveryEvent), runs: 2 })).rejects.toThrow(RepositoryError);
    expect((await matches.loadMatch(id))!.events).toEqual(later.events);
  });
});

describe('backups with the new actions', () => {
  it('export, check and restore a match with retirements and a Super Over', async () => {
    const { matches, backups, a, b, setup } = await app();
    const id = await matches.startMatch(setup, { strikerId: a[0], nonStrikerId: a[1], bowlerId: b[0] });
    let m = (await matches.loadMatch(id))!;
    m = await matches.recordEvent(m, { type: 'retire', playerId: a[0], retirement: 'out' });
    m = await matches.recordEvent(m, { type: 'newBatter', playerId: a[2] });
    const prepared = await backups.createBackup();
    const check = parseBackup(prepared.json);
    if (!check.ok) throw new Error(check.errors.join('\n'));
    const row = check.backup.file.data.matchEvents.find((e) => e.type === 'retire');
    expect(row).toMatchObject({ player_id: a[0], retirement: 'out' });
    await backups.restore(check.backup);
    expect((await matches.loadMatch(id))!.events).toEqual(m.events);
  });

  it('a backup from schema 6 (before these actions) is upgraded', async () => {
    const { matches, backups, a, b, setup } = await app();
    const id = await matches.startMatch(setup, { strikerId: a[0], nonStrikerId: a[1], bowlerId: b[0] });
    const m = (await matches.loadMatch(id))!;
    await matches.recordEvent(m, delivery(m, { runs: 2 }));
    const file = JSON.parse((await backups.createBackup()).json);
    file.schemaVersion = 6;
    for (const e of file.data.matchEvents) for (const c of ['retirement', 'team_id', 'player_name', 'revised_overs', 'revised_target', 'revised_bowler_limit']) delete e[c];
    for (const row of file.data.matches) for (const c of ['team_a_size', 'team_b_size', 'abandoned', 'paused_at', 'pause_reason']) delete row[c];
    const check = parseBackup(JSON.stringify(file));
    if (!check.ok) throw new Error(check.errors.join('\n'));
    expect(check.backup.file.data.matchEvents.every((e) => e.retirement === null && e.team_id === null)).toBe(true);
    expect(check.backup.file.data.matches[0]).toMatchObject({ team_a_size: 4, team_b_size: 3 });
  });
});

describe('migration 7', () => {
  it('keeps existing match events and allows the new ones', async () => {
    const db = createTestDatabase();
    await migrate(db, MIGRATIONS.slice(0, 6));
    await db.run("INSERT INTO players (id, name, created_at, updated_at) VALUES ('p', 'P', 't', 't')");
    await db.run("INSERT INTO teams (id, name, created_at, updated_at) VALUES ('t1', 'T1', 't', 't'), ('t2', 'T2', 't', 't')");
    await db.run(
      `INSERT INTO matches (id, status, team_a_id, team_a_name, team_b_id, team_b_name, overs_per_innings, players_per_side,
         free_hit_after_no_ball, toss_winner_team_id, toss_decision, summary, event_count, created_at, updated_at)
       VALUES ('m', 'inProgress', 't1', 'T1', 't2', 'T2', 1, 2, 1, 't1', 'bat', '', 1, 't', 't')`,
    );
    await db.run(
      "INSERT INTO match_events (match_id, seq, type, innings_index, striker_id, created_at) VALUES ('m', 0, 'inningsStart', 0, 'p', 'when')",
    );
    await migrate(db);
    expect(await db.all('SELECT match_id, seq, type, striker_id, retirement, created_at FROM match_events')).toEqual([
      { match_id: 'm', seq: 0, type: 'inningsStart', striker_id: 'p', retirement: null, created_at: 'when' },
    ]);
    const newEvent: MatchEvent = { type: 'retire', playerId: 'p', retirement: 'hurt' };
    const row = eventToRow(1, { event: newEvent, inningsIndex: 3, record: null });
    await db.run('INSERT INTO match_events (match_id, seq, type, innings_index, player_id, retirement, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      'm',
      row.seq,
      row.type,
      row.innings_index,
      row.player_id,
      row.retirement,
      'when',
    ]);
    await expect(
      db.run("INSERT INTO match_events (match_id, seq, type, innings_index, retirement, created_at) VALUES ('m', 2, 'retire', 0, 'sad', 'when')"),
    ).rejects.toThrow();
  });
});
