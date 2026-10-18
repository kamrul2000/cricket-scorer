// In-memory stand-in for the phone's logo folder (src/files/logoFiles.ts).
import type { LogoFiles } from '../../src/services/backupService';

export function memoryLogoFiles(initial: Record<string, string> = {}): LogoFiles & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async list() {
      return [...files.keys()];
    },
    async readBase64(name) {
      return files.get(name) ?? null;
    },
    async writeBase64(name, base64) {
      files.set(name, base64);
    },
    async remove(name) {
      files.delete(name);
    },
  };
}
