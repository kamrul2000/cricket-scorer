// Team logos on the phone. Logos are copied into the app's private storage (so they stay
// available offline, even if the original photo is deleted) and shrunk to at most 512 px.
// The database stores only the file name; backups carry the image itself.
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { LogoFiles } from '../services/backupService';

const MAX_SIDE = 512;

function folder(): Directory {
  const dir = new Directory(Paths.document, 'logos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** URI for showing a stored logo in an <Image>. */
export function logoUri(fileName: string): string {
  return new File(folder(), fileName).uri;
}

export const deviceLogoFiles: LogoFiles = {
  async list() {
    return folder()
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((f) => f.name);
  },
  async readBase64(name) {
    const file = new File(folder(), name);
    return file.exists ? file.base64() : null;
  },
  async writeBase64(name, base64) {
    const file = new File(folder(), name);
    file.create({ overwrite: true });
    file.write(base64, { encoding: 'base64' });
  },
  async remove(name) {
    const file = new File(folder(), name);
    if (file.exists) file.delete();
  },
};

/**
 * Lets the user pick an image from the phone, shrinks it, and stores it as a PNG in the logo
 * folder. Returns the new file name, or null if the user cancelled.
 */
export async function pickAndStoreLogo(): Promise<string | null> {
  const picked = await File.pickFileAsync({ mimeTypes: 'image/*' });
  if (picked.canceled) return null;
  // Work on a private copy: the picked file may belong to another app (a content:// URI).
  const source = new File(Paths.cache, `logo-source-${Date.now()}`);
  await picked.result.copy(source);
  try {
    let image = await ImageManipulator.manipulate(source.uri).renderAsync();
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    if (scale < 1) {
      image = await ImageManipulator.manipulate(image)
        .resize({ width: Math.round(image.width * scale), height: Math.round(image.height * scale) })
        .renderAsync();
    }
    const saved = await image.saveAsync({ format: SaveFormat.PNG });
    const name = `logo-${randomUUID()}.png`;
    await new File(saved.uri).move(new File(folder(), name));
    return name;
  } catch (e) {
    throw new Error(`That image could not be used as a logo. ${e instanceof Error ? e.message : ''}`.trim());
  } finally {
    if (source.exists) source.delete();
  }
}
