// Current batters (striker clearly marked) and current bowler with figures, in compact rows.
import { StyleSheet, Text, View } from 'react-native';

import { formatOvers } from '../../domain/format';
import type { InningsState } from '../../domain/scoring';
import { colors, font, radius, spacing } from '../../theme/theme';

export function CreasePanel({ inn }: { inn: InningsState }) {
  const batter = (id: string | null, onStrike: boolean) => {
    if (!id) {
      return (
        <View style={styles.row}>
          <Text style={styles.waiting}>{onStrike ? 'Striker' : 'Non-striker'}: waiting for the new batter</Text>
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
          {onStrike ? '*' : ''}
        </Text>
        <Text style={styles.figures}>
          {b.runs} <Text style={styles.muted}>({b.ballsFaced})</Text>
        </Text>
        <Text style={styles.boundaries}>
          {b.fours}×4 {b.sixes}×6
        </Text>
      </View>
    );
  };

  const bowler = inn.bowlerId ? inn.bowlers.find((b) => b.playerId === inn.bowlerId) : null;
  const lastBowlers = inn.bowlers.filter((b) => inn.previousOverBowlerIds.includes(b.playerId)).map((b) => b.name);
  const partnership = inn.partnerships[inn.partnerships.length - 1];
  const retiredHurt = inn.batters.filter((b) => b.retiredHurt).map((b) => b.name);
  const notes = [
    partnership && !partnership.broken && !partnership.retired
      ? `Partnership ${partnership.runs} (${partnership.balls})`
      : null,
    retiredHurt.length ? `Retired hurt: ${retiredHurt.join(', ')}` : null,
  ].filter(Boolean);

  return (
    <View style={styles.card}>
      {batter(inn.strikerId, true)}
      {batter(inn.nonStrikerId, false)}
      <View style={styles.bowlerRow} accessibilityLabel={bowler ? `Bowling: ${bowler.name}` : undefined}>
        {bowler ? (
          <>
            <Text style={styles.bowlerLabel}>BOWLING</Text>
            <Text style={styles.bowlerName} numberOfLines={1}>
              {bowler.name}
            </Text>
            <Text style={styles.bowlerFigures}>
              {formatOvers(bowler.legalBalls)}-{bowler.maidens}-{bowler.runsConceded}-{bowler.wickets}
            </Text>
          </>
        ) : (
          <Text style={styles.waiting} numberOfLines={1}>
            {inn.completed ? 'Innings complete' : `Over complete${lastBowlers.length ? ` (${lastBowlers.join(' & ')})` : ''}: choose the next bowler`}
          </Text>
        )}
      </View>
      {notes.length ? (
        <Text style={styles.notes} numberOfLines={1}>
          {notes.join('  ·  ')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.xs, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  strikerRow: { backgroundColor: '#E6F2EC' },
  marker: { color: colors.primary, fontSize: font.small, width: 14 },
  markerHidden: { opacity: 0 },
  name: { flex: 1, fontSize: font.body, color: colors.text },
  strikerName: { fontWeight: '800' },
  figures: { fontSize: font.body, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.small, color: colors.textMuted, fontWeight: '600' },
  boundaries: { fontSize: 13, color: colors.textMuted, width: 62, textAlign: 'right' },
  waiting: { flex: 1, fontSize: font.small, color: colors.textMuted, fontStyle: 'italic' },
  bowlerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    minHeight: 30,
  },
  bowlerLabel: { fontSize: 12, fontWeight: '800', color: colors.primary },
  bowlerName: { flex: 1, fontSize: font.body, fontWeight: '700', color: colors.text },
  bowlerFigures: { fontSize: font.body, fontWeight: '700', color: colors.text },
  notes: { fontSize: 12, color: colors.textMuted, fontWeight: '700', paddingHorizontal: spacing.sm, paddingBottom: 2 },
});
