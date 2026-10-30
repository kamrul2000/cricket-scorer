// Team sizes and players who join during a match, against a real SQLite engine (node:sqlite):
// saved durably, replayed on reload, found for career statistics, and carried by backups.
import { parseBackup } from '../src/backup/backupFormat';
import { eventToRow, rowToEvent } from '../src/data/matchEventRows';
import { migrate, MIGRATIONS } from '../src/data/migrations';
import { createRepositories } from '../src/data/repositories';
import type { MatchEvent, MatchSetup } from '../src/domain/match';
import { createBackupService } from '../src/services/backupService';
import { createMatchService, type LoadedMatch } from '../src/services/matchService';
import { createTestDatabase, testDeps } from './helpers/testDatabase';
import { memoryLogoFiles } from './helpers/memoryLogoFiles';
import { out, TestMatch } from './helpers/matchBuilder';

async function app() {
  const db = createTestDatabase();
  await migrate(db);
  const repos = createRepositories(db, testDeps());
  const matches = createMatchService(repos.matches);
  const backups = createBackupService(repos.backups, {
    appVersion: '1.1.0',
    now: () => new Date(Date.UTC(2026, 9, 30, 12, 0)),
    logos: memoryLogoFiles(),
  });
  const [a1, a2, b1] = await Promise.all(['A1', 'A2', 'B1'].map((n) => repos.players.create(n)));
  const tA = await repos.teams.create('Alpha', [a1.id, a2.id]);
  const tB = await repos.teams.create('Bravo', []); // created on the spot, no players yet
  // 7 a side, but only the openers and the opening bowler are named.
  const setup: MatchSetup = {
    rules: { oversPerInnings: 2, freeHitAfterNoBall: true, maxOversPerBowler: null },
    teams: [
      { teamId: tA.id, name: 'Alpha', size: 7, players: [a1, a2].map((p) => ({ playerId: p.id, name: p.name })) },
      { teamId: tB.id, name: 'Bravo', size: 7, players: [{ playerId: b1.id, name: b1.name }] },
    ],
    toss: { winnerTeamId: tA.id, decision: 'bat' },
  };
  return { db, repos, matches, backups, setup, ids: { a1: a1.id, a2: a2.id, b1: b1.id, tA: tA.id, tB: tB.id } };
}

function delivery(m: LoadedMatch, input: Parameters<TestMatch['deliveryEvent']>[0] = {}): MatchEvent {
  const tm = new TestMatch(m.setup);
  tm.events = [...m.events];
  return tm.deliveryEvent(input);
}

describe('players joining during a match', () => {
  it('are saved, replayed on reload, and kept with the team size', async () => {
    const { repos, matches, setup, ids } = await app();
    const id = await matches.startMatch(setup, { strikerId: ids.a1, nonStrikerId: ids.a2, bowlerId: ids.b1 });
    let m = (await matches.loadMatch(id))!;
    m = await matches.recordEvent(m, delivery(m, { dismissal: out.bowled() }));

    // A new batter is created on the team's roster, joins the lineup and comes in.
    const newcomer = await repos.players.create('Newcomer');
    await repos.teams.addToRoster(ids.tA, newcomer.id);
    m = await matches.recordEvent(m, { type: 'addPlayer', teamId: ids.tA, playerId: newcomer.id, name: newcomer.name });
    m = await matches.recordEvent(m, { type: 'newBatter', playerId: newcomer.id });

    const reloaded = (await matches.loadMatch(id))!;
    expect(reloaded.events).toEqual(m.events);
    expect(reloaded.setup.teams.map((t) => t.size)).toEqual([7, 7]);
    expect(reloaded.setup.teams[0].players).toHaveLength(2); // the stored lineup as it started
    expect(reloaded.state.setup.teams[0].players.map((p) => p.name)).toEqual(['A1', 'A2', 'Newcomer']);
    expect(reloaded.state.innings[0]).toMatchObject({ wicketsLimit: 6, strikerId: newcomer.id });
    expect((await repos.teams.get(ids.tA))!.playerIds).toContain(newcomer.id);
    // Career statistics find the match for a player who joined during play.
    expect(await repos.matches.idsForPlayer(newcomer.id)).toEqual([id]);

    // Undo removes the event durably; the player stays on the team's roster.
    let undone = await matches.undo(reloaded);
    undone = await matches.undo(undone);
    expect((await matches.loadMatch(id))!.state.setup.teams[0].players).toHaveLength(2);
    expect(await repos.matches.idsForPlayer(newcomer.id)).toEqual([]);
    expect((await repos.teams.get(ids.tA))!.playerIds).toContain(newcomer.id);
  });

  it('round-trip through an event row', () => {
    const event: MatchEvent = { type: 'addPlayer', teamId: 't', playerId: 'p', name: 'Pat' };
    const row = eventToRow(4, { event, inningsIndex: 1, record: null });
    expect(row).toMatchObject({ type: 'addPlayer', team_id: 't', player_id: 'p', player_name: 'Pat' });
    expect(rowToEvent(row)).toEqual(event);
  });

  it('are carried by a backup and restored', async () => {
    const { repos, matches, backups, setup, ids } = await app();
    const id = await matches.startMatch(setup, { strikerId: ids.a1, nonStrikerId: ids.a2, bowlerId: ids.b1 });
    const b2 = await repos.players.create('B2');
    await repos.teams.addToRoster(ids.tB, b2.id);
    let m = (await matches.loadMatch(id))!;
    m = await matches.recordEvent(m, { type: 'addPlayer', teamId: ids.tB, playerId: b2.id, name: 'B2' });
    const check = parseBackup((await backups.createBackup()).json);
    if (!check.ok) throw new Error(check.errors.join('\n'));
    expect(check.backup.file.data.matches[0]).toMatchObject({ team_a_size: 7, team_b_size: 7 });
    await backups.restore(check.backup);
    expect((await matches.loadMatch(id))!.events).toEqual(m.events);
  });
});

describe('migration 8', () => {
  it('gives existing matches the size of their lineups, and allows the new event', async () => {
    const db = createTestDatabase();
    await migrate(db, MIGRATIONS.slice(0, 7));
    await db.run("INSERT INTO players (id, name, created_at, updated_at) VALUES ('p1', 'P1', 't', 't'), ('p2', 'P2', 't', 't'), ('p3', 'P3', 't', 't')");
    await db.run("INSERT INTO teams (id, name, created_at, updated_at) VALUES ('t1', 'T1', 't', 't'), ('t2', 'T2', 't', 't')");
    await db.run(
      `INSERT INTO matches (id, status, team_a_id, team_a_name, team_b_id, team_b_name, overs_per_innings, players_per_side,
         free_hit_after_no_ball, toss_winner_team_id, toss_decision, summary, event_count, created_at, updated_at)
       VALUES ('m', 'inProgress', 't1', 'T1', 't2', 'T2', 1, 2, 1, 't1', 'bat', '', 1, 't', 't')`,
    );
    await db.run(
      `INSERT INTO match_players (match_id, team_id, player_id, lineup_order, player_name, is_substitute)
       VALUES ('m', 't1', 'p1', 0, 'P1', 0), ('m', 't1', 'p2', 1, 'P2', 0), ('m', 't2', 'p3', 0, 'P3', 0)`,
    );
    await db.run(
      "INSERT INTO match_events (match_id, seq, type, innings_index, striker_id, retirement, created_at) VALUES ('m', 0, 'inningsStart', 0, 'p1', NULL, 'when')",
    );
    await migrate(db);
    // Team 2 named a single player, which is below the minimum: kept at 2.
    expect(await db.first('SELECT team_a_size, team_b_size FROM matches')).toEqual({ team_a_size: 2, team_b_size: 2 });
    expect(await db.all('SELECT seq, type, striker_id, team_id, player_name FROM match_events')).toEqual([
      { seq: 0, type: 'inningsStart', striker_id: 'p1', team_id: null, player_name: null },
    ]);
    await db.run(
      "INSERT INTO match_events (match_id, seq, type, innings_index, team_id, player_id, player_name, created_at) VALUES ('m', 1, 'addPlayer', 0, 't2', 'p2', 'P2', 'when')",
    );
    await expect(
      db.run("INSERT INTO match_events (match_id, seq, type, innings_index, player_name, created_at) VALUES ('m', 2, 'addPlayer', 0, '', 'when')"),
    ).rejects.toThrow();
  });
});
