// Match storage and workflows against a real SQLite engine (node:sqlite).
import { eventToRow, rowToEvent } from '../src/data/matchEventRows';
import { migrate } from '../src/data/migrations';
import { createRepositories } from '../src/data/repositories';
import { RepositoryError } from '../src/data/RepositoryError';
import type { MatchEvent, MatchSetup } from '../src/domain/match';
import { computeMatchState, ScoringError } from '../src/domain/scoring';
import { createMatchService, faultInjection, type LoadedMatch } from '../src/services/matchService';
import { createTestDatabase, testDeps } from './helpers/testDatabase';
import { out, TestMatch } from './helpers/matchBuilder';

/** Creates real players/teams in the database and a 1-over, 3-a-side setup using them. */
async function setup() {
  const db = createTestDatabase();
  await migrate(db);
  const repos = createRepositories(db, testDeps());
  const service = createMatchService(repos.matches);
  const a = await Promise.all(['A1', 'A2', 'A3'].map((n) => repos.players.create(n)));
  const b = await Promise.all(['B1', 'B2', 'B3'].map((n) => repos.players.create(n)));
  const teamA = await repos.teams.create('Alpha', a.map((p) => p.id));
  const teamB = await repos.teams.create('Bravo', b.map((p) => p.id));
  const matchSetup: MatchSetup = {
    rules: { oversPerInnings: 1, playersPerSide: 3, freeHitAfterNoBall: true, maxOversPerBowler: null },
    teams: [
      { teamId: teamA.id, name: 'Alpha', players: a.map((p) => ({ playerId: p.id, name: p.name })) },
      { teamId: teamB.id, name: 'Bravo', players: b.map((p) => ({ playerId: p.id, name: p.name })) },
    ],
    toss: { winnerTeamId: teamA.id, decision: 'bat' },
  };
  return { db, repos, service, a, b, teamA, teamB, matchSetup };
}

/** Builds the next delivery event from the loaded match's current state. */
function delivery(m: LoadedMatch, input: Parameters<TestMatch['deliveryEvent']>[0] = {}): MatchEvent {
  const tm = new TestMatch(m.setup);
  tm.events = [...m.events];
  return tm.deliveryEvent(input);
}

async function started() {
  const ctx = await setup();
  const id = await ctx.service.startMatch(ctx.matchSetup, {
    strikerId: ctx.a[0].id,
    nonStrikerId: ctx.a[1].id,
    bowlerId: ctx.b[0].id,
  });
  const match = (await ctx.service.loadMatch(id))!;
  return { ...ctx, id, match };
}

afterEach(() => {
  faultInjection.failNextSave = false;
});

describe('event row mapping', () => {
  it('round-trips every kind of event through a row', () => {
    const tm = new TestMatch(
      (() => {
        const s = {
          rules: { oversPerInnings: 2, playersPerSide: 4, freeHitAfterNoBall: true, maxOversPerBowler: null },
          teams: [
            { teamId: 'ta', name: 'A', players: ['a1', 'a2', 'a3', 'a4'].map((id) => ({ playerId: id, name: id })) },
            { teamId: 'tb', name: 'B', players: ['b1', 'b2', 'b3', 'b4'].map((id) => ({ playerId: id, name: id })) },
          ],
          toss: { winnerTeamId: 'ta', decision: 'bat' as const },
        };
        return s as MatchSetup;
      })(),
    );
    tm.start('a1', 'a2', 'b1')
      .ball({ ballType: 'noBall', runsFrom: 'legByes', runs: 1 })
      .ball({ runs: 1, dismissal: out.runOut('a1', 'nonStriker', null) })
      .batter('a3')
      .ball({ dismissal: out.caught('b2') })
      .batter('a4')
      .ball({ ballType: 'wide', boundary: 'four' });
    const state = tm.state;
    tm.events.forEach((event, seq) => {
      const record = state.innings[0].deliveries.find((d) => d.eventIndex === seq) ?? null;
      const row = eventToRow(seq, { event, inningsIndex: 0, record });
      expect(rowToEvent(row)).toEqual(event);
    });
  });
});

describe('match storage', () => {
  it('saves a new match with its lineup snapshot and first event', async () => {
    const { repos, id, match, matchSetup } = await started();
    expect(match.setup).toEqual(matchSetup);
    expect(match.events).toHaveLength(1);
    const list = await repos.matches.list();
    expect(list).toEqual([expect.objectContaining({ id, status: 'inProgress', summary: 'Alpha 0/0 (0 ov)' })]);
  });

  it('records events and reloads to exactly the same state (resume)', async () => {
    const { service, id } = await started();
    let m = (await service.loadMatch(id))!;
    m = await service.recordEvent(m, delivery(m, { boundary: 'four' }));
    m = await service.recordEvent(m, delivery(m, { ballType: 'wide', runs: 1 }));
    m = await service.recordEvent(m, delivery(m, { dismissal: out.bowled() }));
    m = await service.recordEvent(m, { type: 'newBatter', playerId: m.setup.teams[0].players[2].playerId });
    const reloaded = (await service.loadMatch(id))!;
    expect(reloaded.events).toEqual(m.events);
    expect(reloaded.state).toEqual(m.state);
    expect(reloaded.state.innings[0].runs).toBe(6);
  });

  it('stores derived delivery facts alongside the inputs', async () => {
    const { db, service, id } = await started();
    const m = (await service.loadMatch(id))!;
    await service.recordEvent(m, delivery(m, { ballType: 'noBall', runsFrom: 'byes', runs: 2 }));
    const row = await db.first<Record<string, unknown>>('SELECT * FROM match_events WHERE match_id = ? AND seq = 1', [id]);
    expect(row).toMatchObject({
      ball_type: 'noBall',
      runs_from: 'byes',
      runs_completed: 2,
      batter_runs: 0,
      extras_no_balls: 1,
      extras_byes: 2,
      total_runs: 3,
      bowler_runs: 1,
      is_legal_ball: 0,
      is_ball_faced: 1,
      is_free_hit: 0,
    });
  });

  it('rejects an invalid event without writing anything', async () => {
    const { service, id } = await started();
    const m = (await service.loadMatch(id))!;
    await expect(service.recordEvent(m, delivery(m, { ballType: 'wide', dismissal: out.bowled() }))).rejects.toBeInstanceOf(
      ScoringError,
    );
    expect((await service.loadMatch(id))!.events).toHaveLength(1);
  });

  it('a duplicate submission of the same action is refused (no double save)', async () => {
    const { service, id } = await started();
    const m = (await service.loadMatch(id))!;
    const ev = delivery(m, { runs: 1 });
    await service.recordEvent(m, ev);
    await expect(service.recordEvent(m, ev)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await service.loadMatch(id))!.events).toHaveLength(2);
  });

  it('a failed save rolls back completely and can be retried', async () => {
    const { service, id } = await started();
    const m = (await service.loadMatch(id))!;
    const ev = delivery(m, { runs: 2 });
    faultInjection.failNextSave = true;
    await expect(service.recordEvent(m, ev)).rejects.toThrow(/Simulated save failure/);
    const after = (await service.loadMatch(id))!;
    expect(after.events).toHaveLength(1);
    expect(after.state.innings[0].runs).toBe(0);
    const retried = await service.recordEvent(after, ev);
    expect(retried.state.innings[0].runs).toBe(2);
  });

  it('undo is durable and survives reloading', async () => {
    const { service, id } = await started();
    let m = (await service.loadMatch(id))!;
    m = await service.recordEvent(m, delivery(m, { runs: 1 }));
    m = await service.recordEvent(m, delivery(m, { dismissal: out.lbw() }));
    m = await service.undo(m);
    const reloaded = (await service.loadMatch(id))!;
    expect(reloaded.events).toHaveLength(2);
    expect(reloaded.state.innings[0].wickets).toBe(0);
    expect(reloaded.state).toEqual(computeMatchState(m.setup, m.events));
  });

  it('a failed undo changes nothing', async () => {
    const { service, id } = await started();
    let m = (await service.loadMatch(id))!;
    m = await service.recordEvent(m, delivery(m, { runs: 1 }));
    faultInjection.failNextSave = true;
    await expect(service.undo(m)).rejects.toThrow(/Simulated/);
    expect((await service.loadMatch(id))!.events).toHaveLength(2);
  });

  it('cannot undo the opening event', async () => {
    const { service, match } = await started();
    await expect(service.undo(match)).rejects.toThrow(/cannot be undone/);
  });

  it('a completed match is marked completed with its result, and undo reopens it', async () => {
    const { service, repos, id } = await started();
    let m = (await service.loadMatch(id))!;
    for (let i = 0; i < 6; i++) m = await service.recordEvent(m, delivery(m, { runs: i === 0 ? 1 : 0 }));
    const [, , b3] = m.setup.teams[1].players;
    m = await service.recordEvent(m, {
      type: 'inningsStart',
      strikerId: m.setup.teams[1].players[0].playerId,
      nonStrikerId: m.setup.teams[1].players[1].playerId,
      bowlerId: m.setup.teams[0].players[0].playerId,
    });
    m = await service.recordEvent(m, delivery(m, { runs: 2 }));
    expect(m.state.result?.type).toBe('winByWickets');
    let list = await repos.matches.list();
    expect(list[0]).toMatchObject({ status: 'completed', summary: 'Bravo won by 2 wickets (5 balls left)' });

    m = await service.undo(m);
    list = await repos.matches.list();
    expect(list[0].status).toBe('inProgress');
    expect(b3).toBeDefined();
  });

  it('later roster or name changes do not alter a saved match', async () => {
    const { repos, service, id, a, teamA } = await started();
    await repos.players.rename(a[0].id, 'Renamed Player');
    await repos.teams.update(teamA.id, 'Alpha Renamed', [a[1].id]);
    const m = (await service.loadMatch(id))!;
    expect(m.setup.teams[0].name).toBe('Alpha');
    expect(m.setup.teams[0].players.map((p) => p.name)).toEqual(['A1', 'A2', 'A3']);
  });

  it('players and teams used in a match cannot be hard-deleted', async () => {
    const { db, a, teamA } = await started();
    await expect(db.run('DELETE FROM players WHERE id = ?', [a[2].id])).rejects.toThrow();
    await db.run('DELETE FROM team_players WHERE team_id = ?', [teamA.id]);
    await expect(db.run('DELETE FROM teams WHERE id = ?', [teamA.id])).rejects.toThrow();
  });

  it('deleting a match removes its lineup and events', async () => {
    const { db, service, id } = await started();
    await service.deleteMatch(id);
    expect(await service.loadMatch(id)).toBeNull();
    expect(await db.first('SELECT * FROM match_events WHERE match_id = ?', [id])).toBeNull();
    expect(await db.first('SELECT * FROM match_players WHERE match_id = ?', [id])).toBeNull();
  });

  it('reports a damaged history instead of showing a wrong score', async () => {
    const { db, service, id } = await started();
    let m = (await service.loadMatch(id))!;
    m = await service.recordEvent(m, delivery(m, { runs: 1 }));
    m = await service.recordEvent(m, delivery(m, { runs: 1 }));
    await db.run("UPDATE match_events SET striker_id = 'nobody' WHERE match_id = ? AND seq = 2", [id]);
    await expect(service.loadMatch(id)).rejects.toMatchObject({ code: 'DAMAGED' });

    await db.run('DELETE FROM match_events WHERE match_id = ? AND seq = 1', [id]);
    await expect(service.loadMatch(id)).rejects.toBeInstanceOf(RepositoryError);
  });

  it('the database rejects a match whose toss winner is not playing', async () => {
    const { repos, matchSetup } = await setup();
    const bad = { ...matchSetup, toss: { winnerTeamId: 'someone-else', decision: 'bat' as const } };
    await expect(
      repos.matches.create(bad, { event: { type: 'inningsStart', strikerId: 'x', nonStrikerId: 'y', bowlerId: 'z' }, inningsIndex: 0, record: null }, { status: 'inProgress', summary: '' }),
    ).rejects.toThrow();
    expect(await repos.matches.list()).toEqual([]);
  });
});
