// Delivery history for one innings, grouped by over (latest over first). Over totals come from
// the scoring engine's over-by-over summary. With `onSelectBall`, each ball can be tapped (used
// to choose a ball to edit).
import { StyleSheet, Text, View } from 'react-native';

import { overBowlersText, playerName } from '../../domain/format';
import type { DeliveryRecord, InningsState, MatchState } from '../../domain/scoring';
import { colors, font, radius, spacing } from '../../theme/theme';
import { BallChip } from '../scoring/OverStrip';

interface Props {
  state: MatchState;
  inn: InningsState;
  onSelectBall?: (eventIndex: number) => void;
}

export function BallByBall({ state, inn, onSelectBall }: Props) {
  const balls = new Map<number, DeliveryRecord[]>();
  for (const d of inn.deliveries) balls.set(d.over, [...(balls.get(d.over) ?? []), d]);
  // Scorer actions between balls (swaps, retirements) are shown under the over of the last ball
  // bowled before them.
  const overBefore = (eventIndex: number) => {
    const before = inn.deliveries.filter((d) => d.eventIndex < eventIndex);
    return before.length ? before[before.length - 1].over : 0;
  };
  const overs = [...inn.overs].reverse();
  if (overs.length === 0) return <Text style={styles.empty}>No deliveries yet.</Text>;

  return (
    <View style={styles.wrap}>
      {overs.map((o) => {
        const swaps = inn.strikeSwaps.filter((s) => overBefore(s.eventIndex) === o.over);
        const retirements = inn.retirements.filter((r) => overBefore(r.eventIndex) === o.over);
        const list = balls.get(o.over) ?? [];
        return (
          <View key={o.over} style={styles.over}>
            <Text style={styles.overTitle}>
              Over {o.over + 1} · {overBowlersText(state.setup, o)} · {o.runs} {o.runs === 1 ? 'run' : 'runs'}
              {o.wickets ? `, ${o.wickets} wkt` : ''} · {o.totalRuns}/{o.totalWickets}
            </Text>
            <View style={styles.balls}>
              {list.map((d) => (
                <BallChip key={d.eventIndex} d={d} onPress={onSelectBall ? () => onSelectBall(d.eventIndex) : undefined} />
              ))}
            </View>
            {list
              .filter((d) => d.wicket)
              .map((d) => (
                <Text key={d.eventIndex} style={styles.note}>
                  Wicket: {playerName(state.setup, d.wicket!.playerOutId)}
                </Text>
              ))}
            {o.bowlerIds.length > 1 ? (
              <Text style={styles.correction}>
                {playerName(state.setup, o.bowlerIds[o.bowlerIds.length - 1])} finished the over (bowler replaced)
              </Text>
            ) : null}
            {retirements.map((r) => (
              <Text key={r.eventIndex} style={r.retirement === 'out' ? styles.note : styles.correction}>
                {playerName(state.setup, r.playerId)} retired {r.retirement === 'out' ? 'out' : 'hurt'}
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
