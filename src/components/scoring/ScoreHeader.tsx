import { StyleSheet, Text, View } from 'react-native';

import { chaseInfo, formatOvers, formatRate, runRate, scoreText } from '../../domain/format';
import type { InningsState, MatchState } from '../../domain/scoring';
import { colors, font, radius, spacing } from '../../theme/theme';

export function ScoreHeader({ state, inn }: { state: MatchState; inn: InningsState }) {
  const chase = chaseInfo(state, inn);
  const totalOvers = state.setup.rules.oversPerInnings;
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.team}>
        {inn.battingTeam.name} · {inn.index === 0 ? '1st' : '2nd'} innings
      </Text>
      <View style={styles.row}>
        <Text style={styles.score} accessibilityLabel={`${inn.runs} runs for ${inn.wickets} wickets`}>
          {scoreText(inn)}
        </Text>
        <View style={styles.right}>
          <Text style={styles.overs}>
            {formatOvers(inn.legalBalls)} <Text style={styles.small}>/ {totalOvers} ov</Text>
          </Text>
          <Text style={styles.small}>Run rate {formatRate(runRate(inn.runs, inn.legalBalls))}</Text>
        </View>
      </View>
      {chase && !inn.completed ? (
        <Text style={styles.chase}>
          Need {chase.runsNeeded} from {chase.ballsRemaining} {chase.ballsRemaining === 1 ? 'ball' : 'balls'}
          {'  ·  '}Target {chase.target}
          {'  ·  '}Req. rate {formatRate(chase.requiredRate)}
        </Text>
      ) : null}
      {inn.freeHitNext ? (
        <Text style={styles.freeHit} accessibilityLiveRegion="polite">
          FREE HIT next ball
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.primaryDark, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  team: { color: '#D5E8DF', fontSize: font.body, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  score: { color: colors.onPrimary, fontSize: 48, fontWeight: '800', lineHeight: 54 },
  right: { alignItems: 'flex-end' },
  overs: { color: colors.onPrimary, fontSize: font.title, fontWeight: '700' },
  small: { color: '#D5E8DF', fontSize: font.small, fontWeight: '600' },
  chase: { color: colors.onPrimary, fontSize: font.body, fontWeight: '700', marginTop: spacing.xs },
  freeHit: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    backgroundColor: '#FFD54F',
    color: '#3A2A00',
    fontWeight: '800',
    fontSize: font.body,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
