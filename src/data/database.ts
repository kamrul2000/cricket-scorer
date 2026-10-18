// A tiny database interface. Repositories depend on this, not on expo-sqlite directly.
// That keeps SQL out of screens and lets automated tests run the same repositories
// against a different SQLite engine (see __tests__/helpers/testDatabase.ts).
import type { SQLiteDatabase } from 'expo-sqlite';

export type SqlValue = string | number | null;

export interface SqlExecutor {
  /** INSERT / UPDATE / DELETE. Always pass values via `params`, never string-concatenate. */
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  /** Run one or more statements with no parameters (schema changes, PRAGMAs). */
  exec(sql: string): Promise<void>;
}

export interface Database extends SqlExecutor {
  /** All-or-nothing: commits if `fn` resolves, rolls back if it throws. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

function executorFor(target: SQLiteDatabase): SqlExecutor {
  return {
    async run(sql, params = []) {
      const result = await target.runAsync(sql, params);
      return { changes: result.changes };
    },
    all: <T>(sql: string, params: SqlValue[] = []) => target.getAllAsync<T>(sql, params),
    first: <T>(sql: string, params: SqlValue[] = []) => target.getFirstAsync<T>(sql, params),
    exec: (sql) => target.execAsync(sql),
  };
}

export function wrapExpoDatabase(sqlite: SQLiteDatabase): Database {
  return {
    ...executorFor(sqlite),
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      let result: T;
      // Exclusive transaction: only queries made through `txn` take part in it.
      await sqlite.withExclusiveTransactionAsync(async (txn) => {
        result = await fn(executorFor(txn));
      });
      return result!;
    },
  };
}
