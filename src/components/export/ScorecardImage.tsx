// A shareable image of a match scorecard (captured to PNG). Everything is drawn with plain
// views and the phone's own fonts, so it works offline.
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ResolvedAwards } from '../../domain/awards';
import { dismissalText, extrasLine, formatOvers, resultText, roleSuffix, scoreText } from '../../domain/format';
import { formatLabel, formatMatchDate } from '../../domain/schedule';
import type { InningsState, MatchState } from '../../domain/scoring';
import type { MatchDetails } from '../../data/matchRepository';
import { TeamLogo } from '../TeamLogo';

const C = {
  ink: '#14201B',
  muted: '#5B6B63',
  green: '#0B6E4F',
  dark: '#073D2C',
  gold: '#F2B705',
  paper: '#FFFFFF',
  band: '#EEF4F1',
};

interface Props {
  state: MatchState;
  details: MatchDetails;
  awards: ResolvedAwards;
  startedAt: string;
  logos: Record<string, string | null>; // teamId -> logo file name
  appName: string;
}

function Innings({ state, inn }: { state: MatchState; inn: InningsState }) {
  return (
    <View style={styles.innings}>
      <View style={styles.inningsHead}>
        <Text style={styles.inningsTeam}>{inn.battingTeam.name}</Text>
        <Text style={styles.inningsScore}>
          {scoreText(inn)} <Text style={styles.inningsOvers}>({formatOvers(inn.legalBalls)} ov)</Text>
        </Text>
      </View>
      {inn.batters.map((b) => (
        <View key={b.playerId} style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.name}>
              {b.name}
              {roleSuffix(inn.battingTeam, b.playerId)}
            </Text>
            <Text style={styles.how}>{b.wicket ? dismissalText(state.setup, b.wicket) : 'not out'}</Text>
          </View>
          <Text style={styles.figure}>
            {b.runs}
            <Text style={styles.balls}> ({b.ballsFaced})</Text>
          </Text>
        </View>
      ))}
      <Text style={styles.extras}>Extras {extrasLine(inn.extras)}</Text>
      <Text style={styles.sub}>Bowling</Text>
      {inn.bowlers
        .filter((b) => b.legalBalls + b.wideBalls + b.noBallBalls > 0)
        .map((b) => (
          <View key={b.playerId} style={styles.row}>
            <Text style={[styles.name, styles.flex]}>{b.name}</Text>
            <Text style={styles.figure}>
              {b.wickets}/{b.runsConceded}
              <Text style={styles.balls}> ({formatOvers(b.legalBalls)})</Text>
            </Text>
          </View>
        ))}
    </View>
  );
}

export const ScorecardImage = forwardRef<View, Props>(function ScorecardImage(
  { state, details, awards, startedAt, logos, appName },
  ref,
) {
  const [a, b] = state.setup.teams;
  const result = state.result ? resultText(state.setup, state.result) : 'Match in progress';
  const meta = [formatMatchDate(startedAt), details.venue, formatLabel(details.formatName, state.setup.rules.oversPerInnings)]
    .filter(Boolean)
    .join(' · ');
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.teams}>
          <View style={styles.team}>
            <TeamLogo name={a.name} logoFile={logos[a.teamId]} size={64} background={C.gold} foreground={C.dark} />
            <Text style={styles.teamName} numberOfLines={2}>
              {a.name}
            </Text>
          </View>
          <Text style={styles.vs}>v</Text>
          <View style={styles.team}>
            <TeamLogo name={b.name} logoFile={logos[b.teamId]} size={64} background={C.gold} foreground={C.dark} />
            <Text style={styles.teamName} numberOfLines={2}>
              {b.name}
            </Text>
          </View>
        </View>
        <Text style={styles.result}>{result}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>

      {state.innings.map((inn) => (
        <Innings key={inn.index} state={state} inn={inn} />
      ))}

      <View style={styles.awards}>
        <Award label="Player of the Match" value={awards.playerOfMatch?.name} />
        <Award
          label="Best Batter"
          value={
            awards.bestBatter
              ? `${awards.bestBatter.performance.name} ${awards.bestBatter.performance.runs}${awards.bestBatter.performance.notOut ? '*' : ''}`
              : undefined
          }
        />
        <Award
          label="Best Bowler"
          value={
            awards.bestBowler
              ? `${awards.bestBowler.performance.name} ${awards.bestBowler.performance.wickets}/${awards.bestBowler.performance.runsConceded}`
              : undefined
          }
        />
      </View>
      <Text style={styles.footer}>Scored with {appName}</Text>
    </View>
  );
});

function Award({ label, value }: { label: string; value: string | undefined }) {
  return (
    <View style={styles.award}>
      <Text style={styles.awardLabel}>{label}</Text>
      <Text style={styles.awardValue}>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 380, backgroundColor: C.paper, borderRadius: 16, overflow: 'hidden' },
  header: { backgroundColor: C.dark, padding: 16, alignItems: 'center', gap: 6 },
  teams: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  team: { alignItems: 'center', width: 130, gap: 6 },
  teamName: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  vs: { color: C.gold, fontSize: 22, fontWeight: '900' },
  result: { color: C.gold, fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 4 },
  meta: { color: '#CFE3DA', fontSize: 12, textAlign: 'center' },
  innings: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.band },
  inningsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', backgroundColor: C.band, marginHorizontal: -16, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 4 },
  inningsTeam: { fontSize: 16, fontWeight: '800', color: C.green },
  inningsScore: { fontSize: 18, fontWeight: '900', color: C.ink },
  inningsOvers: { fontSize: 12, fontWeight: '600', color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, gap: 8 },
  flex: { flex: 1 },
  name: { fontSize: 13, fontWeight: '700', color: C.ink },
  how: { fontSize: 11, color: C.muted },
  figure: { fontSize: 14, fontWeight: '800', color: C.ink },
  balls: { fontSize: 11, fontWeight: '600', color: C.muted },
  extras: { fontSize: 11, color: C.muted, marginTop: 4 },
  sub: { fontSize: 12, fontWeight: '800', color: C.green, marginTop: 8 },
  awards: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: C.band },
  award: { flex: 1, backgroundColor: C.paper, borderRadius: 8, padding: 8, borderTopWidth: 3, borderTopColor: C.gold },
  awardLabel: { fontSize: 9, fontWeight: '800', color: C.green, textTransform: 'uppercase' },
  awardValue: { fontSize: 12, fontWeight: '700', color: C.ink, marginTop: 2 },
  footer: { fontSize: 10, color: C.muted, textAlign: 'center', paddingVertical: 8 },
});
