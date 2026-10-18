// Backup and restore workflows. Screens call these; files on the device are handled separately
// in src/backup/backupFiles.ts.
import {
  backupFileName,
  buildBackup,
  checkBackupData,
  parseBackup,
  serializeBackup,
  type BackupSummary,
  type ValidBackup,
} from '../backup/backupFormat';
import type { BackupRepository, DataCounts } from '../data/backupRepository';
import { takeFault } from './faultInjection';

export interface PreparedBackup {
  json: string;
  fileName: string;
  summary: BackupSummary;
}

/** What the user confirms before a restore: the checked backup and what it will replace. */
export type RestorePreview = { ok: true; backup: ValidBackup; current: DataCounts } | { ok: false; errors: string[] };

export interface DataCheckReport {
  problems: string[];
  summary: BackupSummary | null;
}

export function createBackupService(backups: BackupRepository, meta: { appVersion: string; now: () => Date }) {
  return {
    /** Exports everything, then reads the result back exactly as a restore would. */
    async createBackup(): Promise<PreparedBackup> {
      const exportedAt = meta.now();
      const file = buildBackup(await backups.exportAll(), {
        appVersion: meta.appVersion,
        exportedAt: exportedAt.toISOString(),
      });
      const json = serializeBackup(file);
      const check = parseBackup(json);
      if (!check.ok) {
        throw new Error(
          `The backup was not created because stored data has a problem: ${check.errors[0]} Use "Check stored data" for details.`,
        );
      }
      return { json, fileName: backupFileName(exportedAt), summary: check.backup.summary };
    },

    /** Fully checks a backup file's text. Nothing is written. */
    async previewRestore(text: string): Promise<RestorePreview> {
      const check = parseBackup(text);
      if (!check.ok) return check;
      return { ok: true, backup: check.backup, current: await backups.counts() };
    },

    /** Replaces ALL app data with the backup, in one transaction. */
    restore(backup: ValidBackup): Promise<void> {
      return backups.replaceAll(backup.file.data, takeFault());
    },

    /** Reliability check of the live database: SQLite's checks, then every match is replayed. */
    async checkData(): Promise<DataCheckReport> {
      const problems = await backups.integrityProblems();
      const checked = checkBackupData(await backups.exportAll());
      if (!checked.ok) problems.push(...checked.errors);
      return { problems, summary: checked.ok ? checked.summary : null };
    },
  };
}

export type BackupService = ReturnType<typeof createBackupService>;
