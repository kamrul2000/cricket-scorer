// Creating export files on the phone: PDF scorecards (expo-print) and PNG images of views
// (react-native-view-shot). Both work offline: nothing is fetched from the internet.
import * as Print from 'expo-print';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { deviceLogoFiles } from '../files/logoFiles';
import { renameCacheFile } from '../files/shareAndSave';

/** A4 in PostScript points (the page size expo-print uses). */
const A4 = { width: 595, height: 842 };

/** Prints the HTML to a PDF in the app's temporary folder; returns its URI. */
export async function createPdf(html: string, fileName: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html, ...A4 });
  return renameCacheFile(uri, fileName);
}

/**
 * Captures a view as a PNG in the app's temporary folder; returns its URI. `size` is the
 * output size in physical pixels (on Android, react-native-view-shot scales the bitmap to it).
 */
export async function captureViewPng(ref: RefObject<View | null>, fileName: string, size?: { width: number; height: number }): Promise<string> {
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile', ...size });
  return renameCacheFile(uri.startsWith('file://') ? uri : `file://${uri}`, fileName);
}

/** Team logos as data: URIs for the PDF (local files cannot be loaded by the print engine everywhere). */
export async function logoDataUris(teams: { teamId: string; logoFile: string | null }[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const t of teams) {
    const base64 = t.logoFile ? await deviceLogoFiles.readBase64(t.logoFile) : null;
    out[t.teamId] = base64 ? `data:image/png;base64,${base64}` : null;
  }
  return out;
}
