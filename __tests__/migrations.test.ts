import { LATEST_SCHEMA_VERSION, MIGRATIONS, migrate } from '../src/data/migrations';
import { createTestDatabase } from './helpers/testDatabase';

describe('migrations', () => {
  it('have consecutive version numbers starting at 1', () => {
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
  });

  it('create the schema on a fresh database and record the version', async () => {
    const db = createTestDatabase();
    expect(await migrate(db)).toBe(LATEST_SCHEMA_VERSION);
    const v = await db.first<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(LATEST_SCHEMA_VERSION);
    const tables = (
      await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
    ).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(['players', 'teams', 'team_players']));
  });

  it('is safe to run twice', async () => {
    const db = createTestDatabase();
    await migrate(db);
    await expect(migrate(db)).resolves.toBe(LATEST_SCHEMA_VERSION);
  });

  it('rolls back a failing migration completely and keeps the old version', async () => {
    const db = createTestDatabase();
    await migrate(db);
    const bad = [
      ...MIGRATIONS,
      {
        version: LATEST_SCHEMA_VERSION + 1,
        description: 'broken',
        sql: 'CREATE TABLE half_done (id TEXT); THIS IS NOT SQL;',
      },
    ];
    await expect(migrate(db, bad)).rejects.toThrow();
    const v = await db.first<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(LATEST_SCHEMA_VERSION);
    const t = await db.first("SELECT name FROM sqlite_master WHERE name = 'half_done'");
    expect(t).toBeNull();
  });

  it('refuses a database written by a newer app version', async () => {
    const db = createTestDatabase();
    await migrate(db);
    await db.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 5}`);
    await expect(migrate(db)).rejects.toThrow(/newer than this app supports/);
  });
});
