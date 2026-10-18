// Delivery history for one innings, grouped by over (latest over first).
import { StyleSheet, Text, View } from 'react-native';

import { playerName } from '../../domain/format';
import type { DeliveryRecord, InningsState, MatchState } from '../../domain/scoring';
import { colors, font, radius, spacing } from '../../theme/theme';
import { BallChip } from '../scoring/OverStrip';

export function BallByBall({ state, inn }: { state: MatchState; inn: InningsState }) {
  const overs = new Map<number, DeliveryRecord[]>();
  for (const d of inn.deliveries) {
    const list = overs.get(d.over) ?? [];
    list.push(d);
    overs.set(d.over, list);
  }
  const entries = [...overs.entries()].sort((a, b) => b[0] - a[0]);
  if (entries.length === 0) return <Text style={styles.empty}>No deliveries yet.</Text>;

  return (
    <View style={styles.wrap}>
      {entries.map(([over, balls]) => {
        const runs = balls.reduce((s, d) => s + d.totalRuns, 0);
        const wickets = balls.filter((d) => d.wicket).length;
        return (
          <View key={over} style={styles.over}>
            <Text style={styles.overTitle}>
              Over {over + 1} · {playerName(state.setup, balls[0].bowlerId)} · {runs} {runs === 1 ? 'run' : 'runs'}
              {wickets ? `, ${wickets} wkt` : ''}
            </Text>
            <View style={styles.balls}>
              {balls.map((d) => (
                <BallChip key={d.eventIndex} d={d} />
              ))}
            </View>
            {balls
              .filter((d) => d.wicket)
              .map((d) => (
                <Text key={d.eventIndex} style={styles.note}>
                  Wicket: {playerName(state.setup, d.wicket!.playerOutId)}
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
});
