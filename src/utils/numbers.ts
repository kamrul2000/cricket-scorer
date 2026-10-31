/** "12" -> 12; anything that is not a plain whole number (blank, "1.5", "-3", "x") -> null. */
export function parseWhole(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}
