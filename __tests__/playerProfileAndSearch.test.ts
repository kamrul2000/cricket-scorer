// Players' batting hand and role (stored, shown, carried by backups), and the list searches.
import { parseBackup } from '../src/backup/backupFormat';
import { migrate, MIGRATIONS } from '../src/data/migrations';
import { createRepositories } from '../src/data/repositories';
import { profileText } from '../src/domain/people';
import { createBackupService } from '../src/services/backupService';
import { matchesSearch } from '../src/utils/search';
import { memoryLogoFiles } from './helpers/memoryLogoFiles';
import { createTestDatabase, testDeps } from './helpers/testDatabase';

async function app() {
  const db = createTestDatabase();
  await migrate(db);
  const repos = createRepositories(db, testDeps());
  const backups = createBackupService(repos.backups, { appVersion: '1.1.0', now: () => new Date(Date.UTC(2026, 10, 1)), logos: memoryLogoFiles() });
  return { db, repos, backups };
}

describe('profile text', () => {
  it('names the role, then the batting hand; empty when neither is set', () => {
    expect(profileText({ battingHand: 'left', role: 'allRounder' })).toBe('All-rounder · Left-hand bat');
    expect(profileText({ battingHand: null, role: 'wicketKeeper' })).toBe('Wicket-keeper');
    expect(profileText({ battingHand: 'right', role: null })).toBe('Right-hand bat');
    expect(profileText({ battingHand: null, role: null })).toBe('');
  });
});

describe('search', () => {
  it('needs every word somewhere in the text, ignoring case and extra spaces', () => {
    const rahim = `Rahim Uddin ${profileText({ battingHand: 'left', role: 'bowler' })}`;
    expect(matchesSearch(rahim, 'rahim')).toBe(true);
    expect(matchesSearch(rahim, '  LEFT   bowler ')).toBe(true);
    expect(matchesSearch(rahim, 'left batter')).toBe(false);
    expect(matchesSearch(rahim, 'right')).toBe(false);
    expect(matchesSearch(rahim, '')).toBe(true);
  });

  it('the team list carries the roster names, so a team can be found by a player', async () => {
    const { repos } = await app();
    const [ann, bob] = await Promise.all(['Ann Rahman', 'Bob'].map((n) => repos.players.create(n)));
    await repos.teams.create('Tigers', [ann.id, bob.id]);
    await repos.teams.create('Empty', []);
    const list = await repos.teams.list();
    expect(list.map((t) => [t.name, [...t.playerNames].sort()])).toEqual([
      ['Empty', []],
      ['Tigers', ['Ann Rahman', 'Bob']],
    ]);
    expect(list.filter((t) => matchesSearch([t.name, ...t.playerNames].join('\n'), 'rahman')).map((t) => t.name)).toEqual(['Tigers']);
  });
});

describe('backups and the database upgrade', () => {
  it('a backup carries the batting hand and role', async () => {
    const { repos, backups } = await app();
    const p = await repos.players.create('Keeper', { battingHand: 'right', role: 'wicketKeeper' });
    const check = parseBackup((await backups.createBackup()).json);
    if (!check.ok) throw new Error(check.errors.join('\n'));
    expect(check.backup.file.data.players).toEqual([expect.objectContaining({ id: p.id, batting_hand: 'right', role: 'wicketKeeper' })]);
  });

  it('a schema 9 backup is upgraded with neither set', async () => {
    const { repos, backups } = await app();
    await repos.players.create('Old');
    const file = JSON.parse((await backups.createBackup()).json);
    file.schemaVersion = 9;
    for (const p of file.data.players) for (const c of ['batting_hand', 'role']) delete p[c];
    const check = parseBackup(JSON.stringify(file));
    if (!check.ok) throw new Error(check.errors.join('\n'));
    expect(check.backup.file.data.players[0]).toMatchObject({ name: 'Old', batting_hand: null, role: null });
  });

  it('migration 10 keeps existing players, with neither set', async () => {
    const db = createTestDatabase();
    await migrate(db, MIGRATIONS.slice(0, 9));
    await db.run("INSERT INTO players (id, name, created_at, updated_at) VALUES ('p1', 'Before', 't', 't')");
    await migrate(db);
    expect(await db.all('SELECT id, name, batting_hand, role FROM players')).toEqual([{ id: 'p1', name: 'Before', batting_hand: null, role: null }]);
    const repos = createRepositories(db, testDeps());
    expect(await repos.players.get('p1')).toMatchObject({ battingHand: null, role: null });
  });
});
