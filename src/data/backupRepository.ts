// Reads all app data for a backup, and replaces all app data during a restore.
// This layer does not check backups; the backup service validates a backup completely before
// calling `replaceAll`. The database constraints and the transaction are the last line of defence.
import { BACKUP_TABLES, INSERT_ORDER, type BackupData, type BackupTableKey } from './backupTables';
import type { Database, SqlExecutor, SqlValue } from './database';
import type { WriteOptions } from './matchRepository';

export interface DataCounts {
  players: number;
  teams: number;
  matches: number;
}

async function readTable(ex: SqlExecutor, key: BackupTableKey): Promise<unknown[]> {
  const spec = BACKUP_TABLES[key];
  return ex.all(`SELECT ${Object.keys(spec.columns).join(', ')} FROM ${spec.table} ORDER BY ${spec.orderBy}`);
}

export function createBackupRepository(db: Database) {
  return {
    /** Every row of every table, read inside one transaction so the copy is consistent. */
    async exportAll(): Promise<BackupData> {
      return db.transaction(async (tx) => {
        const data: Record<string, unknown[]> = {};
        for (const key of INSERT_ORDER) data[key] = await readTable(tx, key);
        return data as unknown as BackupData;
      });
    },

    async counts(): Promise<DataCounts> {
      const count = async (table: string) => (await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0;
      return { players: await count('players'), teams: await count('teams'), matches: await count('matches') };
    },

    /**
     * Deletes ALL current data and inserts `data`, in one transaction: either everything is
     * replaced, or (on any error) nothing changes.
     */
    async replaceAll(data: BackupData, options?: WriteOptions): Promise<void> {
      await db.transaction(async (tx) => {
        for (const key of [...INSERT_ORDER].reverse()) {
          await tx.run(`DELETE FROM ${BACKUP_TABLES[key].table}`);
        }
        for (const key of INSERT_ORDER) {
          const { table, columns } = BACKUP_TABLES[key];
          const names = Object.keys(columns);
          const sql = `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`;
          for (const row of data[key] as unknown as Record<string, SqlValue>[]) {
            await tx.run(sql, names.map((n) => row[n]));
          }
        }
        if (options?.failBeforeCommit) throw new Error('Simulated save failure (developer setting). Nothing was changed.');
      });
    },

    /** SQLite's own checks: file corruption, and rows pointing at rows that do not exist. */
    async integrityProblems(): Promise<string[]> {
      const problems: string[] = [];
      const integrity = await db.all<{ integrity_check: string }>('PRAGMA integrity_check');
      for (const r of integrity) if (r.integrity_check !== 'ok') problems.push(`Database file: ${r.integrity_check}`);
      const fk = await db.all<{ table: string; parent: string }>('PRAGMA foreign_key_check');
      for (const r of fk) problems.push(`A row in ${r.table} refers to a missing row in ${r.parent}.`);
      return problems;
    },
  };
}

export type BackupRepository = ReturnType<typeof createBackupRepository>;
