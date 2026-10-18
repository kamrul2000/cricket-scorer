// Current batters (striker clearly marked) and current bowler with figures.
import { StyleSheet, Text, View } from 'react-native';

import { formatOvers } from '../../domain/format';
import type { InningsState } from '../../domain/scoring';
import { colors, font, radius, spacing } from '../../theme/theme';

export function CreasePanel({ inn }: { inn: InningsState }) {
  const batter = (id: string | null, onStrike: boolean) => {
    if (!id) {
      return (
        <View style={styles.row}>
          <Text style={styles.waiting}>{onStrike ? 'Striker' : 'Non-striker'}: waiting for new batter</Text>
        </View>
      );
    }
    const b = inn.batters.find((x) => x.playerId === id)!;
    return (
      <View
        style={[styles.row, onStrike && styles.strikerRow]}
        accessibilityLabel={`${b.name}${onStrike ? ', on strike' : ''}, ${b.runs} runs off ${b.ballsFaced} balls`}
      >
        <Text style={[styles.marker, !onStrike && styles.markerHidden]}>▶</Text>
        <Text style={[styles.name, onStrike && styles.strikerName]} numberOfLines={1}>
          {b.name}
          {onStrike ? <Text style={styles.tag}>  ON STRIKE</Text> : null}
        </Text>
        <Text style={styles.figures}>
          {b.runs} <Text style={styles.balls}>({b.ballsFaced})</Text>
        </Text>
        <Text style={styles.boundaries}>
          {b.fours}×4 {b.sixes}×6
        </Text>
      </View>
    );
  };

  const bowler = inn.bowlerId ? inn.bowlers.find((b) => b.playerId === inn.bowlerId) : null;
  const lastBowler = inn.previousOverBowlerId ? inn.bowlers.find((b) => b.playerId === inn.previousOverBowlerId) : null;
  const shown = bowler ?? null;

  return (
    <View style={styles.card}>
      {batter(inn.strikerId, true)}
      {batter(inn.nonStrikerId, false)}
      <View style={styles.divider} />
      {shown ? (
        <View style={styles.bowlerRow} accessibilityLabel={`Bowling: ${shown.name}`}>
          <Text style={styles.bowlerLabel}>BOWLING</Text>
          <Text style={styles.bowlerName} numberOfLines={1}>
            {shown.name}
          </Text>
          <Text style={styles.bowlerFigures}>
            {formatOvers(shown.legalBalls)}-{shown.maidens}-{shown.runsConceded}-{shown.wickets}
          </Text>
        </View>
      ) : (
        <Text style={styles.waiting}>
          {inn.completed ? 'Innings complete' : `Over complete${lastBowler ? ` (${lastBowler.name})` : ''}: choose the next bowler`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  strikerRow: { backgroundColor: '#E6F2EC' },
  marker: { color: colors.primary, fontSize: font.body, width: 16 },
  markerHidden: { opacity: 0 },
  name: { flex: 1, fontSize: font.large, color: colors.text },
  strikerName: { fontWeight: '800' },
  tag: { fontSize: font.small, color: colors.primary, fontWeight: '800' },
  figures: { fontSize: font.large, fontWeight: '800', color: colors.text },
  balls: { fontSize: font.small, color: colors.textMuted, fontWeight: '600' },
  boundaries: { fontSize: font.small, color: colors.textMuted, width: 64, textAlign: 'right' },
  waiting: { fontSize: font.body, color: colors.textMuted, fontStyle: 'italic', padding: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border },
  bowlerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  bowlerLabel: { fontSize: font.small, fontWeight: '800', color: colors.primary },
  bowlerName: { flex: 1, fontSize: font.large, fontWeight: '700', color: colors.text },
  bowlerFigures: { fontSize: font.large, fontWeight: '700', color: colors.text },
});
