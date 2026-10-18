// Moves backup files between the app and the rest of the phone.
// The app's own storage is private and is deleted on uninstall, so a backup must leave it:
// either into a folder the user picks (Android's folder picker) or through the share sheet
// (Google Drive, email, a messaging app, ...).
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { MAX_BACKUP_CHARS } from './backupFormat';

const JSON_MIME = 'application/json';

const isCancel = (e: unknown) => e instanceof Error && /cancel/i.test(e.message);

/**
 * Lets the user pick a folder (for example Downloads) and writes the backup there.
 * Returns the saved file name, or null if the user cancelled.
 */
export async function saveBackupToFolder(json: string, fileName: string): Promise<string | null> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
  const file = folder.createFile(fileName, JSON_MIME);
  file.write(json);
  return file.name;
}

/** Writes the backup to the app's temporary folder and opens the share sheet for it. */
export async function shareBackup(json: string, fileName: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: JSON_MIME, dialogTitle: 'Save or send the backup' });
}

/** Lets the user pick a backup file and reads it. Returns null if the user cancelled. */
export async function pickBackupFile(): Promise<{ name: string; text: string } | null> {
  // Any type: phones and cloud apps label .json files inconsistently. The contents are checked.
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return null;
  const file = picked.result;
  if (file.size !== null && file.size > MAX_BACKUP_CHARS) {
    throw new Error('This file is far too large to be a backup from this app.');
  }
  return { name: file.name, text: await file.text() };
}
