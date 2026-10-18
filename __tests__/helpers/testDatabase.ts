// Runs the real repositories against a real in-memory SQLite engine (Node's built-in
// `node:sqlite`, Node 22.5+). It implements the same `Database` interface the app uses
// with expo-sqlite, so SQL, constraints and transactions are genuinely exercised.
import { DatabaseSync } from 'node:sqlite';

import type { Database, SqlExecutor, SqlValue } from '../../src/data/database';
import type { RepositoryDeps } from '../../src/data/deps';

export function createTestDatabase(): Database & { close(): void; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');

  const executor: SqlExecutor = {
    async run(sql, params: SqlValue[] = []) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async first<T>(sql: string, params: SqlValue[] = []) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async exec(sql) {
      raw.exec(sql);
    },
  };

  return {
    ...executor,
    raw,
    close: () => raw.close(),
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      raw.exec('BEGIN');
      try {
        const result = await fn(executor);
        raw.exec('COMMIT');
        return result;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

export function testDeps(): RepositoryDeps {
  let n = 0;
  return {
    newId: () => `id-${++n}`,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
  };
}
