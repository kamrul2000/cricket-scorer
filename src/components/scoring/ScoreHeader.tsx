// The score at the top of the scoring screen: kept compact so the whole screen fits without
// scrolling.
import { StyleSheet, Text, View } from 'react-native';

import { chaseInfo, formatOvers, formatRate, inningsLabel, runRate, scoreText } from '../../domain/format';
import type { InningsState, MatchState } from '../../domain/scoring';
import { colors, font, radius, spacing } from '../../theme/theme';

export function ScoreHeader({ state, inn }: { state: MatchState; inn: InningsState }) {
  const chase = chaseInfo(state, inn);
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.top}>
        <Text style={styles.team} numberOfLines={1}>
          {inn.battingTeam.name} · {inningsLabel(inn)}
          {inn.superOver !== null ? ` · ${inn.wicketsLimit} wickets end it` : ''}
        </Text>
        {inn.freeHitNext ? (
          <Text style={styles.freeHit} accessibilityLiveRegion="polite">
            FREE HIT
          </Text>
        ) : null}
      </View>
      <View style={styles.row}>
        <Text style={styles.score} accessibilityLabel={`${inn.runs} runs for ${inn.wickets} wickets`}>
          {scoreText(inn)}
        </Text>
        <Text style={styles.overs}>
          {formatOvers(inn.legalBalls)}
          <Text style={styles.small}> / {inn.oversLimit} ov</Text>
        </Text>
        <View style={styles.rates}>
          <Text style={styles.small}>CRR {formatRate(runRate(inn.runs, inn.legalBalls))}</Text>
          {chase && !inn.completed ? <Text style={styles.small}>RRR {formatRate(chase.requiredRate)}</Text> : null}
        </View>
      </View>
      {chase && !inn.completed ? (
        <Text style={styles.chase} numberOfLines={1}>
          Need {chase.runsNeeded} from {chase.ballsRemaining} {chase.ballsRemaining === 1 ? 'ball' : 'balls'} · Target {chase.target}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.primaryDark, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  team: { flex: 1, color: '#D5E8DF', fontSize: font.small, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  score: { color: colors.onPrimary, fontSize: 36, fontWeight: '800', lineHeight: 42 },
  overs: { color: colors.onPrimary, fontSize: font.large, fontWeight: '700' },
  rates: { flex: 1, alignItems: 'flex-end' },
  small: { color: '#D5E8DF', fontSize: font.small, fontWeight: '600' },
  chase: { color: colors.onPrimary, fontSize: font.small, fontWeight: '700' },
  freeHit: {
    backgroundColor: '#FFD54F',
    color: '#3A2A00',
    fontWeight: '800',
    fontSize: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
