// Getting files out of the app's private storage: into a folder the user picks (Android's
// folder picker, no storage permission needed) or through the share sheet.
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const isCancel = (e: unknown) => e instanceof Error && /cancel/i.test(e.message);

/**
 * Lets the user pick a folder (for example Downloads or Pictures) and writes the content there.
 * Returns the saved file name, or null if the user cancelled.
 */
export async function saveToFolder(content: string | Uint8Array, fileName: string, mimeType: string): Promise<string | null> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
  const file = folder.createFile(fileName, mimeType);
  file.write(content);
  return file.name;
}

/** Copies an app file (such as a generated PDF or PNG) into a folder the user picks. */
export async function saveFileToFolder(uri: string, fileName: string, mimeType: string): Promise<string | null> {
  return saveToFolder(await new File(uri).bytes(), fileName, mimeType);
}

/** Opens the share sheet (Drive, email, WhatsApp, ...) for an app file. */
export async function shareFile(uri: string, mimeType: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle });
}

/** Writes text to the app's temporary folder under `fileName` and returns its URI. */
export function writeCacheFile(fileName: string, content: string): string {
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(content);
  return file.uri;
}

/** Gives a generated temporary file a readable name (shown when sharing), returning the new URI. */
export async function renameCacheFile(uri: string, fileName: string): Promise<string> {
  const target = new File(Paths.cache, fileName);
  if (target.exists) target.delete();
  const file = new File(uri);
  await file.move(target);
  return target.uri;
}
