// The printable (PDF) scorecard as one self-contained HTML document. Pure TypeScript.
// - Every number comes from the scoring engine's state; nothing is recalculated here.
// - Everything is inline (styles, logos as data URIs), so printing never needs the internet.
// - Long scorecards flow over several A4 pages: table headers repeat on each page and rows
//   are never split across pages.
import type { ResolvedAwards } from '../domain/awards';
import {
  dismissalText,
  economy,
  extrasLine,
  formatOvers,
  ordinal,
  playerName,
  resultText,
  roleSuffix,
  scoreText,
  strikeRate,
  teamName,
} from '../domain/format';
import { formatLabel, formatMatchDate, formatMatchTime } from '../domain/schedule';
import type { InningsState, MatchState } from '../domain/scoring';
import type { MatchDetails } from '../data/matchRepository';

export interface ScorecardDocument {
  state: MatchState;
  details: MatchDetails;
  awards: ResolvedAwards;
  /** When the match started (ISO). */
  startedAt: string;
  /** teamId -> logo as a data: URI, or null for none. */
  logos: Record<string, string | null>;
  appName: string;
  /** When the PDF was made (ISO). */
  generatedAt: string;
}

/** Escapes text for HTML. Every name and free text goes through this. */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const STYLE = `
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { font-family: sans-serif; color: #14201B; font-size: 11px; margin: 0; }
.header { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #0B6E4F; padding-bottom: 10px; }
.logo { width: 54px; height: 54px; border-radius: 27px; object-fit: contain; background: #fff; border: 1px solid #C5D0CA; }
.initials { width: 54px; height: 54px; border-radius: 27px; background: #0B6E4F; color: #fff; font-weight: 800;
  font-size: 20px; display: flex; align-items: center; justify-content: center; }
.title { flex: 1; text-align: center; }
.title h1 { margin: 0; font-size: 20px; }
.result { margin: 4px 0 0; font-size: 14px; font-weight: 800; color: #0B6E4F; }
.meta { color: #4F5D56; margin: 2px 0 0; }
.awards { display: flex; gap: 8px; margin: 10px 0; }
.award { flex: 1; border: 1px solid #C5D0CA; border-radius: 6px; padding: 6px 8px; }
.award b { display: block; color: #0B6E4F; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
h2 { font-size: 14px; margin: 14px 0 4px; background: #084C37; color: #fff; padding: 6px 8px; border-radius: 4px;
  break-after: avoid; page-break-after: avoid; }
h3 { font-size: 11px; margin: 10px 0 2px; color: #0B6E4F; break-after: avoid; page-break-after: avoid; }
table { width: 100%; border-collapse: collapse; margin: 2px 0 6px; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th { background: #E3E9E5; font-size: 10px; }
th, td { padding: 3px 5px; border-bottom: 1px solid #DDE5E0; text-align: right; }
th:first-child, td:first-child, .left { text-align: left; }
.how { color: #4F5D56; }
.line { margin: 3px 0; }
.footer { margin-top: 16px; color: #4F5D56; font-size: 9px; border-top: 1px solid #C5D0CA; padding-top: 6px; }
`;

function logoHtml(name: string, dataUri: string | null): string {
  if (dataUri) return `<img class="logo" src="${esc(dataUri)}" alt="${esc(name)} logo" />`;
  const words = name.trim().split(/\s+/);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  return `<div class="initials">${esc(initials)}</div>`;
}

function table(head: string[], rows: string[][]): string {
  return `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

function inningsHtml(state: MatchState, inn: InningsState): string {
  const s = state.setup;
  const batted = new Set(inn.batters.map((b) => b.playerId));
  const didNotBat = inn.battingTeam.players.filter((p) => !batted.has(p.playerId));
  const atCrease = new Set([inn.strikerId, inn.nonStrikerId]);
  const batting = table(
    ['Batter', '', 'R', 'B', '4s', '6s', 'SR'],
    inn.batters.map((b) => [
      `${esc(b.name)}${esc(roleSuffix(inn.battingTeam, b.playerId))}`,
      `<span class="how">${esc(b.wicket ? dismissalText(s, b.wicket) : atCrease.has(b.playerId) && !inn.completed ? 'batting' : 'not out')}</span>`,
      `<b>${b.runs}</b>`,
      String(b.ballsFaced),
      String(b.fours),
      String(b.sixes),
      strikeRate(b.runs, b.ballsFaced),
    ]),
  );
  const bowling = table(
    ['Bowler', 'O', 'M', 'R', 'W', 'Econ', 'Wd', 'Nb'],
    inn.bowlers.map((b) => [
      `${esc(b.name)}${esc(roleSuffix(inn.bowlingTeam, b.playerId))}`,
      formatOvers(b.legalBalls),
      String(b.maidens),
      String(b.runsConceded),
      `<b>${b.wickets}</b>`,
      economy(b.runsConceded, b.legalBalls),
      String(b.wideBalls),
      String(b.noBallBalls),
    ]),
  );
  const parts = [
    `<h2>${esc(inn.battingTeam.name)} innings: ${scoreText(inn)} (${formatOvers(inn.legalBalls)} ov)${
      inn.target !== null ? ` · target ${inn.target}` : ''
    }</h2>`,
    batting,
    `<p class="line"><b>Extras:</b> ${esc(extrasLine(inn.extras))}</p>`,
    `<p class="line"><b>Total:</b> ${scoreText(inn)} (${formatOvers(inn.legalBalls)} overs)${
      inn.endReason === 'abandoned' ? ' · match abandoned' : ''
    }</p>`,
  ];
  if (didNotBat.length) {
    parts.push(
      `<p class="line"><b>${inn.completed ? 'Did not bat' : 'Yet to bat'}:</b> ${didNotBat
        .map((p) => esc(p.name + roleSuffix(inn.battingTeam, p.playerId)))
        .join(', ')}</p>`,
    );
  }
  if (inn.battingTeam.substitutes?.length) {
    parts.push(`<p class="line"><b>Substitutes:</b> ${inn.battingTeam.substitutes.map((p) => esc(p.name)).join(', ')}</p>`);
  }
  if (inn.fallOfWickets.length) {
    parts.push(
      `<p class="line"><b>Fall of wickets:</b> ${inn.fallOfWickets
        .map((f) => `${f.wicketNumber}-${f.teamRuns} (${esc(playerName(s, f.playerOutId))}, ${formatOvers(f.legalBalls)} ov)`)
        .join(', ')}</p>`,
    );
  }
  parts.push('<h3>Bowling</h3>', bowling);
  if (inn.partnerships.length) {
    parts.push(
      '<h3>Partnerships</h3>',
      table(
        ['Wicket', 'Batters', 'Runs', 'Balls'],
        inn.partnerships.map((p) => [
          `${ordinal(p.number)}${p.broken ? '' : ' (unbroken)'}`,
          `<span class="left">${esc(playerName(s, p.batterIds[0]))} ${p.batterRuns[0]}, ${esc(playerName(s, p.batterIds[1]))} ${p.batterRuns[1]}</span>`,
          `<b>${p.runs}</b>`,
          String(p.balls),
        ]),
      ),
    );
  }
  if (inn.overs.length) {
    parts.push(
      '<h3>Over by over</h3>',
      table(
        ['Over', 'Bowler', 'Runs', 'Wkts', 'Score'],
        inn.overs.map((o) => [
          `${o.over + 1}${o.complete ? '' : ` (${o.legalBalls} b)`}`,
          esc(playerName(s, o.bowlerId)),
          String(o.runs),
          String(o.wickets),
          `${o.totalRuns}/${o.totalWickets}`,
        ]),
      ),
    );
  }
  return `<section>${parts.join('\n')}</section>`;
}

export function scorecardHtml(doc: ScorecardDocument): string {
  const { state, details, awards } = doc;
  const s = state.setup;
  const [a, b] = s.teams;
  const result = state.result ? resultText(s, state.result) : 'Match in progress';
  const meta = [
    `${formatMatchDate(doc.startedAt)}, ${formatMatchTime(doc.startedAt)}`,
    details.venue || null,
    formatLabel(details.formatName, s.rules.oversPerInnings),
    `${s.rules.playersPerSide} a side`,
  ].filter(Boolean);
  const toss = `${teamName(s, s.toss.winnerTeamId)} won the toss and chose to ${s.toss.decision}.`;
  const award = (label: string, text: string | null) =>
    `<div class="award"><b>${label}</b>${text ? esc(text) : '—'}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(`${a.name} v ${b.name}`)}</title><style>${STYLE}</style></head><body>
<div class="header">
  ${logoHtml(a.name, doc.logos[a.teamId] ?? null)}
  <div class="title">
    <h1>${esc(a.name)} v ${esc(b.name)}</h1>
    <p class="result">${esc(result)}</p>
    <p class="meta">${meta.map((m) => esc(m!)).join(' · ')}</p>
    <p class="meta">${esc(toss)}</p>
  </div>
  ${logoHtml(b.name, doc.logos[b.teamId] ?? null)}
</div>
<div class="awards">
  ${award('Player of the Match', awards.playerOfMatch?.name ?? null)}
  ${award(
    'Best Batter',
    awards.bestBatter
      ? `${awards.bestBatter.performance.name} ${awards.bestBatter.performance.runs}${awards.bestBatter.performance.notOut ? '*' : ''} (${awards.bestBatter.performance.balls})`
      : null,
  )}
  ${award(
    'Best Bowler',
    awards.bestBowler
      ? `${awards.bestBowler.performance.name} ${awards.bestBowler.performance.wickets}/${awards.bestBowler.performance.runsConceded} (${formatOvers(awards.bestBowler.performance.legalBalls)} ov)`
      : null,
  )}
</div>
${state.innings.map((inn) => inningsHtml(state, inn)).join('\n')}
<div class="footer">Scored with ${esc(doc.appName)} · generated ${esc(formatMatchDate(doc.generatedAt))}, ${esc(
    formatMatchTime(doc.generatedAt),
  )} · Partnership balls exclude wides. Best Batter and Best Bowler use the app's own published rules.</div>
</body></html>`;
}
