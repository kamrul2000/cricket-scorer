import { migrate } from '../src/data/migrations';
import { createRepositories } from '../src/data/repositories';
import { RepositoryError } from '../src/data/RepositoryError';
import { createTestDatabase, testDeps } from './helpers/testDatabase';

async function setup() {
  const db = createTestDatabase();
  await migrate(db);
  return { db, repos: createRepositories(db, testDeps()) };
}

describe('players', () => {
  it('creates, lists (sorted, case-insensitive) and renames by ID', async () => {
    const { repos } = await setup();
    const b = await repos.players.create('bravo');
    await repos.players.create('Alpha');
    expect((await repos.players.list()).map((p) => p.name)).toEqual(['Alpha', 'bravo']);
    await repos.players.rename(b.id, 'Zulu');
    expect((await repos.players.get(b.id))?.name).toBe('Zulu');
  });

  it('allows two different players with the same name (identity is the ID)', async () => {
    const { repos } = await setup();
    const a = await repos.players.create('Sam Khan');
    const b = await repos.players.create('Sam Khan');
    expect(a.id).not.toBe(b.id);
    expect(await repos.players.list()).toHaveLength(2);
  });

  it('rejects an invalid name', async () => {
    const { repos } = await setup();
    await expect(repos.players.create('  ')).rejects.toMatchObject({ code: 'INVALID_NAME' });
  });

  it('archives and restores, hiding archived players unless asked', async () => {
    const { repos } = await setup();
    const p = await repos.players.create('Old Timer');
    await repos.players.setArchived(p.id, true);
    expect(await repos.players.list()).toHaveLength(0);
    expect(await repos.players.list({ includeArchived: true })).toHaveLength(1);
    await repos.players.setArchived(p.id, false);
    expect(await repos.players.list()).toHaveLength(1);
  });

  it('reports NOT_FOUND for unknown IDs', async () => {
    const { repos } = await setup();
    await expect(repos.players.rename('nope', 'X')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('teams and rosters', () => {
  it('creates a team with a roster and reads it back', async () => {
    const { repos } = await setup();
    const a = await repos.players.create('Ann');
    const b = await repos.players.create('Bob');
    const team = await repos.teams.create('Tigers', [a.id, b.id, a.id]); // duplicate id ignored
    expect([...team.playerIds].sort()).toEqual([a.id, b.id].sort());
    expect((await repos.teams.list())[0]).toMatchObject({ name: 'Tigers', playerCount: 2 });
  });

  it('lets the same player belong to several teams', async () => {
    const { repos } = await setup();
    const p = await repos.players.create('Shared');
    const t1 = await repos.teams.create('One', [p.id]);
    const t2 = await repos.teams.create('Two', [p.id]);
    expect((await repos.teams.get(t1.id))?.playerIds).toEqual([p.id]);
    expect((await repos.teams.get(t2.id))?.playerIds).toEqual([p.id]);
    expect(await repos.players.activeTeamNames(p.id)).toEqual(['One', 'Two']);
  });

  it('rejects duplicate active team names ignoring case', async () => {
    const { repos } = await setup();
    await repos.teams.create('Lions', []);
    await expect(repos.teams.create('lions', [])).rejects.toMatchObject({ code: 'DUPLICATE_NAME' });
  });

  it('a failed create leaves no half-saved team behind', async () => {
    const { repos } = await setup();
    await expect(repos.teams.create('Ghosts', ['missing-id'])).rejects.toMatchObject({
      code: 'INVALID_ROSTER',
    });
    expect(await repos.teams.list({ includeArchived: true })).toHaveLength(0);
  });

  it('update replaces the roster atomically; a failing update changes nothing', async () => {
    const { repos } = await setup();
    const a = await repos.players.create('Ann');
    const b = await repos.players.create('Bob');
    const team = await repos.teams.create('Hawks', [a.id]);
    await expect(
      repos.teams.update(team.id, 'Hawks 2', [a.id, 'missing-id']),
    ).rejects.toMatchObject({ code: 'INVALID_ROSTER' });
    const after = await repos.teams.get(team.id);
    expect(after?.name).toBe('Hawks'); // rename rolled back too
    expect(after?.playerIds).toEqual([a.id]);

    await repos.teams.update(team.id, 'Hawks 2', [b.id]);
    expect(await repos.teams.get(team.id)).toMatchObject({ name: 'Hawks 2', playerIds: [b.id] });
  });

  it('refuses to add an archived player but keeps one already on the roster', async () => {
    const { repos } = await setup();
    const a = await repos.players.create('Ann');
    const b = await repos.players.create('Bob');
    const team = await repos.teams.create('Owls', [a.id]);
    await repos.players.setArchived(a.id, true);
    await repos.players.setArchived(b.id, true);
    await expect(repos.teams.update(team.id, 'Owls', [a.id, b.id])).rejects.toMatchObject({
      code: 'ARCHIVED',
    });
    await repos.teams.update(team.id, 'Owls', [a.id]); // existing archived member may stay
    expect((await repos.teams.get(team.id))?.playerIds).toEqual([a.id]);
  });

  it('archive keeps the roster; archived teams cannot be edited; restore checks the name', async () => {
    const { repos } = await setup();
    const p = await repos.players.create('Ann');
    const t = await repos.teams.create('Sharks', [p.id]);
    await repos.teams.setArchived(t.id, true);
    expect(await repos.teams.list()).toHaveLength(0);
    expect((await repos.teams.get(t.id))?.playerIds).toEqual([p.id]);
    await expect(repos.teams.update(t.id, 'Sharks', [])).rejects.toMatchObject({ code: 'ARCHIVED' });

    await repos.teams.create('Sharks', []); // name reused while archived
    await expect(repos.teams.setArchived(t.id, false)).rejects.toMatchObject({
      code: 'DUPLICATE_NAME',
    });
  });

  it('database refuses to hard-delete a player or team that is referenced', async () => {
    const { db, repos } = await setup();
    const p = await repos.players.create('Ann');
    const t = await repos.teams.create('Wolves', [p.id]);
    await expect(db.run('DELETE FROM players WHERE id = ?', [p.id])).rejects.toThrow();
    await expect(db.run('DELETE FROM teams WHERE id = ?', [t.id])).rejects.toThrow();
  });

  it('uses RepositoryError for user-facing failures', async () => {
    const { repos } = await setup();
    await expect(repos.teams.create('', [])).rejects.toBeInstanceOf(RepositoryError);
  });
});
