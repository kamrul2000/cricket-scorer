// Delivery history for one innings, grouped by over (latest over first). Over totals come from
// the scoring engine's over-by-over summary.
import { StyleSheet, Text, View } from 'react-native';

import { playerName } from '../../domain/format';
import type { DeliveryRecord, InningsState, MatchState } from '../../domain/scoring';
import { colors, font, radius, spacing } from '../../theme/theme';
import { BallChip } from '../scoring/OverStrip';

export function BallByBall({ state, inn }: { state: MatchState; inn: InningsState }) {
  const balls = new Map<number, DeliveryRecord[]>();
  for (const d of inn.deliveries) balls.set(d.over, [...(balls.get(d.over) ?? []), d]);
  // Each scorer swap is shown under the over of the last ball bowled before it.
  const swapOver = (eventIndex: number) => {
    const before = inn.deliveries.filter((d) => d.eventIndex < eventIndex);
    return before.length ? before[before.length - 1].over : 0;
  };
  const overs = [...inn.overs].reverse();
  if (overs.length === 0) return <Text style={styles.empty}>No deliveries yet.</Text>;

  return (
    <View style={styles.wrap}>
      {overs.map((o) => {
        const swaps = inn.strikeSwaps.filter((s) => swapOver(s.eventIndex) === o.over);
        const list = balls.get(o.over) ?? [];
        return (
          <View key={o.over} style={styles.over}>
            <Text style={styles.overTitle}>
              Over {o.over + 1} · {playerName(state.setup, o.bowlerId)} · {o.runs} {o.runs === 1 ? 'run' : 'runs'}
              {o.wickets ? `, ${o.wickets} wkt` : ''} · {o.totalRuns}/{o.totalWickets}
            </Text>
            <View style={styles.balls}>
              {list.map((d) => (
                <BallChip key={d.eventIndex} d={d} />
              ))}
            </View>
            {list
              .filter((d) => d.wicket)
              .map((d) => (
                <Text key={d.eventIndex} style={styles.note}>
                  Wicket: {playerName(state.setup, d.wicket!.playerOutId)}
                </Text>
              ))}
            {swaps.map((s) => (
              <Text key={s.eventIndex} style={styles.correction}>
                Batters swapped by the scorer (correction)
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  empty: { fontSize: font.body, color: colors.textMuted },
  over: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, gap: spacing.sm },
  overTitle: { fontSize: font.body, fontWeight: '700', color: colors.text },
  balls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { fontSize: font.small, color: colors.danger, fontWeight: '600' },
  correction: { fontSize: font.small, color: colors.textMuted, fontStyle: 'italic' },
});
