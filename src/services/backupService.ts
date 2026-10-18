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
  /** Teams whose logo file was missing on the phone; they are backed up without a logo. */
  missingLogos: number;
}

/** The app's private logo folder (see src/files/logoFiles.ts; tests use an in-memory version). */
export interface LogoFiles {
  list(): Promise<string[]>;
  /** null when the file does not exist. */
  readBase64(name: string): Promise<string | null>;
  writeBase64(name: string, base64: string): Promise<void>;
  remove(name: string): Promise<void>;
}

/** Deletes logo files that no team uses (left over from replaced logos or a restore). */
export async function removeUnusedLogos(files: LogoFiles, inUse: readonly string[]): Promise<void> {
  const keep = new Set(inUse);
  for (const name of await files.list()) if (!keep.has(name)) await files.remove(name);
}

/** What the user confirms before a restore: the checked backup and what it will replace. */
export type RestorePreview = { ok: true; backup: ValidBackup; current: DataCounts } | { ok: false; errors: string[] };

export interface DataCheckReport {
  problems: string[];
  summary: BackupSummary | null;
}

export function createBackupService(
  backups: BackupRepository,
  deps: { appVersion: string; now: () => Date; logos: LogoFiles },
) {
  return {
    /** Exports everything (with logos), then reads the result back exactly as a restore would. */
    async createBackup(): Promise<PreparedBackup> {
      const exportedAt = deps.now();
      const data = await backups.exportAll();
      const logos: Record<string, string> = {};
      let missingLogos = 0;
      for (const team of data.teams) {
        if (!team.logo_file) continue;
        const content = await deps.logos.readBase64(team.logo_file);
        if (content === null) {
          team.logo_file = null; // the image is already gone; back the team up without it
          missingLogos += 1;
        } else {
          logos[team.logo_file] = content;
        }
      }
      const file = buildBackup(data, { appVersion: deps.appVersion, exportedAt: exportedAt.toISOString() }, { logos });
      const json = serializeBackup(file);
      const check = parseBackup(json);
      if (!check.ok) {
        throw new Error(
          `The backup was not created because stored data has a problem: ${check.errors[0]} Use "Check stored data" for details.`,
        );
      }
      return { json, fileName: backupFileName(exportedAt), summary: check.backup.summary, missingLogos };
    },

    /** Fully checks a backup file's text. Nothing is written. */
    async previewRestore(text: string): Promise<RestorePreview> {
      const check = parseBackup(text);
      if (!check.ok) return check;
      return { ok: true, backup: check.backup, current: await backups.counts() };
    },

    /**
     * Replaces ALL app data with the backup. The logo files are written first; a file that
     * already exists is left alone (logo names are unique per image, so it is the same image).
     * Then the database is replaced in one transaction. If that fails, nothing in the database
     * changes and any new logo files are simply unused. After success, logos that no team uses
     * any more are deleted.
     */
    async restore(backup: ValidBackup): Promise<void> {
      const existing = new Set(await deps.logos.list());
      for (const [name, content] of Object.entries(backup.file.files.logos)) {
        if (!existing.has(name)) await deps.logos.writeBase64(name, content);
      }
      await backups.replaceAll(backup.file.data, takeFault());
      const inUse = backup.file.data.teams.flatMap((t) => (t.logo_file ? [t.logo_file] : []));
      await removeUnusedLogos(deps.logos, inUse).catch(() => undefined); // tidying only
    },

    /** Reliability check: SQLite's checks, every match replayed, and every team logo present. */
    async checkData(): Promise<DataCheckReport> {
      const problems = await backups.integrityProblems();
      const data = await backups.exportAll();
      const checked = checkBackupData(data);
      if (!checked.ok) problems.push(...checked.errors);
      const files = new Set(await deps.logos.list());
      for (const t of data.teams) {
        if (t.logo_file && !files.has(t.logo_file)) problems.push(`The logo image of team "${t.name}" is missing.`);
      }
      return { problems, summary: checked.ok ? checked.summary : null };
    },
  };
}

export type BackupService = ReturnType<typeof createBackupService>;
