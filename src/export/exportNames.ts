// Safe, readable file names for exported files.

/** "Tigers XI" -> "tigers-xi"; anything other than a-z and 0-9 becomes a single "-". */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'team'
  );
}

/** e.g. scorecard-tigers-v-lions-2026-10-25.pdf (local date). */
export function exportFileName(kind: 'scorecard' | 'poster', teamA: string, teamB: string, isoDate: string, ext: 'pdf' | 'png'): string {
  const d = new Date(isoDate);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${kind}-${slug(teamA)}-v-${slug(teamB)}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${ext}`;
}
