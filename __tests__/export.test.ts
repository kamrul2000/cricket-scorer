// PDF scorecard HTML and export file names. (Printing the PDF, capturing images and the share
// sheet run on the phone only; see docs/MANUAL_CHECKS.md.)
import { NO_AWARDS, resolveAwards } from '../src/domain/awards';
import type { MatchState } from '../src/domain/scoring';
import { exportFileName, slug } from '../src/export/exportNames';
import { esc, scorecardHtml, type ScorecardDocument } from '../src/export/scorecardHtml';
import { makeSetup, out, startedMatch, TestMatch } from './helpers/matchBuilder';

function doc(state: MatchState, patch: Partial<ScorecardDocument> = {}): ScorecardDocument {
  return {
    state,
    details: { venue: 'Eastfield Park', formatName: 'T10' },
    awards: resolveAwards(state, NO_AWARDS),
    startedAt: new Date(2026, 9, 25, 15, 5).toISOString(),
    logos: {},
    appName: 'Local Cricket Scorer',
    generatedAt: new Date(2026, 9, 25, 18, 0).toISOString(),
    ...patch,
  };
}

/** A complete 2-over, 3-a-side match won by Bravo. */
function finishedMatch() {
  const m = startedMatch({ oversPerInnings: 2, playersPerSide: 3 });
  m.ball({ runs: 1 }).ball({ boundary: 'four' }).ball({ ballType: 'wide' }).balls(0, 2, 0, 1);
  m.bowler('b2').ball({ dismissal: out.caught('b3') }).batter('a3').balls(1, 0, 0, 0, 0);
  m.start('b1', 'b2', 'a1').ball({ boundary: 'six' }).ball({ boundary: 'six' });
  return m;
}

describe('PDF scorecard HTML', () => {
  it('contains the match details, result, both innings, extras, partnerships, overs and awards', () => {
    const state = finishedMatch().state;
    expect(state.result?.type).toBe('winByWickets');
    const html = scorecardHtml(doc(state));
    for (const text of [
      'Alpha v Bravo',
      'Bravo won by 2 wickets',
      'Sun 25 Oct 2026, 3:05 PM',
      'Eastfield Park',
      'T10 · 2 overs',
      '3 a side',
      'Alpha won the toss and chose to bat.',
      'Alpha innings: 10/1 (2 ov)',
      'Bravo innings: 12/0 (0.2 ov) · target 11',
      'Extras:</b> 1 (b 0, lb 0, w 1, nb 0)',
      'Fall of wickets:</b> 1-9 (A2, 1.1 ov)',
      'c B3 b B2',
      'Partnerships',
      '1st (unbroken)',
      'Over by over',
      'Player of the Match</b>—',
      'Best Batter</b>B1 12* (2)',
      'Best Bowler</b>B2 1/1 (1 ov)',
      'Scored with Local Cricket Scorer',
    ]) {
      expect(html).toContain(text);
    }
  });

  it('flows over pages: headers repeat and rows are never split', () => {
    const html = scorecardHtml(doc(finishedMatch().state));
    expect(html).toContain('@page { size: A4;');
    expect(html).toContain('thead { display: table-header-group; }');
    expect(html).toContain('tr { break-inside: avoid; page-break-inside: avoid; }');
  });

  it('builds a long 11-a-side, 20-over scorecard with every over listed', () => {
    const m = new TestMatch(makeSetup({ playersPerSide: 11, oversPerInnings: 20 })).start('a1', 'a2', 'b1');
    for (let over = 0; over < 20; over++) {
      if (over > 0) m.bowler(over % 2 ? 'b2' : 'b1');
      m.balls(1, 0, 4, 0, 6, 1);
    }
    const html = scorecardHtml(doc(m.state));
    expect(html.match(/<tr><td>\d+<\/td><td>B[12]<\/td>/g)).toHaveLength(20);
    expect(html).toContain('Alpha innings: 240/0 (20 ov)');
  });

  it('escapes names so they cannot break the document', () => {
    expect(esc(`<b>"Tom" & Jerry's</b>`)).toBe('&lt;b&gt;&quot;Tom&quot; &amp; Jerry&#39;s&lt;/b&gt;');
    const s = makeSetup({ playersPerSide: 2, oversPerInnings: 1 });
    s.teams[0].name = '<script>alert(1)</script>';
    s.teams[0].players[0].name = 'O"Brien & <Co>';
    const m = new TestMatch(s).start('a1', 'a2', 'b1').ball({ runs: 1 });
    const html = scorecardHtml(doc(m.state));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('O&quot;Brien &amp; &lt;Co&gt;');
  });

  it('works offline: logos are embedded, and nothing is loaded from the internet or local files', () => {
    const state = finishedMatch().state;
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    const html = scorecardHtml(doc(state, { logos: { 'team-a': logo, 'team-b': null } }));
    expect(html).toContain(`<img class="logo" src="${logo}"`);
    expect(html).toContain('<div class="initials">BR</div>');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/src="file:/);
  });

  it('shows ties, no-results and abandoned innings', () => {
    const tie = startedMatch({ oversPerInnings: 1, playersPerSide: 2 });
    tie.balls(1, 0, 0, 0, 0, 0).start('b1', 'b2', 'a1').balls(1, 0, 0, 0, 0, 0);
    expect(scorecardHtml(doc(tie.state))).toContain('Match tied');

    const abandoned = startedMatch({ oversPerInnings: 5 });
    abandoned.balls(1);
    abandoned.events.push({ type: 'abandon' });
    const html = scorecardHtml(doc(abandoned.state));
    expect(html).toContain('No result (match abandoned)');
    expect(html).toContain('match abandoned</p>');
  });
});

describe('export file names', () => {
  it('are safe and readable', () => {
    expect(slug('Tigers XI')).toBe('tigers-xi');
    expect(slug('  ***  ')).toBe('team');
    expect(slug('Ünïcode Rovers / 2nd')).toBe('n-code-rovers-2nd');
    expect(exportFileName('scorecard', 'Tigers XI', 'Lions', new Date(2026, 9, 5).toISOString(), 'pdf')).toBe(
      'scorecard-tigers-xi-v-lions-2026-10-05.pdf',
    );
    expect(exportFileName('poster', 'A/B', '..', new Date(2026, 0, 1).toISOString(), 'png')).toBe('poster-a-b-v-team-2026-01-01.png');
  });
});
