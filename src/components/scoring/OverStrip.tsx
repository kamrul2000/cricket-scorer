// Deliveries of the current (or just finished) over as coloured balls. Tapping a ball (when
// `onSelectBall` is given) opens it for editing; "Edit" (`onPickBall`) lets any earlier ball be
// chosen.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { deliveryLabel } from '../../domain/format';
import type { DeliveryRecord, InningsState } from '../../domain/scoring';
import { colors, font, radius, spacing } from '../../theme/theme';

export function BallChip({ d, onPress }: { d: DeliveryRecord; onPress?: () => void }) {
  const style = d.wicket ? styles.wicket : d.isSix || d.isFour ? styles.boundary : !d.isLegalBall ? styles.extra : styles.normal;
  const text = d.wicket || d.isFour || d.isSix ? styles.lightText : styles.darkText;
  const chip = (
    <View style={[styles.ball, style]}>
      <Text style={[styles.ballText, text]} numberOfLines={1} adjustsFontSizeToFit>
        {deliveryLabel(d)}
      </Text>
    </View>
  );
  if (!onPress) return chip;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ball ${deliveryLabel(d)}, over ${d.over + 1}`}
      hitSlop={4}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {chip}
    </Pressable>
  );
}

interface Props {
  inn: InningsState;
  onSelectBall?: (eventIndex: number) => void;
  onPickBall?: () => void;
}

export function OverStrip({ inn, onSelectBall, onPickBall }: Props) {
  const last = inn.deliveries[inn.deliveries.length - 1];
  const over = last?.over ?? 0;
  const balls = inn.deliveries.filter((d) => d.over === over);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Over {over + 1}</Text>
      {balls.length === 0 ? (
        <Text style={styles.empty}>No balls yet</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
          {balls.map((d) => (
            <BallChip key={d.eventIndex} d={d} onPress={onSelectBall ? () => onSelectBall(d.eventIndex) : undefined} />
          ))}
        </ScrollView>
      )}
      {onPickBall ? (
        <Pressable
          onPress={onPickBall}
          accessibilityRole="button"
          accessibilityLabel="Edit a ball"
          hitSlop={8}
          style={({ pressed }) => [styles.edit, pressed && styles.pressed]}
        >
          <Text style={styles.editText}>✎ Edit</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  label: { fontSize: font.small, fontWeight: '800', color: colors.textMuted },
  scroll: { flex: 1 },
  empty: { flex: 1, fontSize: font.small, color: colors.textMuted },
  row: { gap: 6, paddingVertical: 2, alignItems: 'center' },
  ball: { minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  normal: { backgroundColor: colors.surface, borderColor: colors.border },
  extra: { backgroundColor: '#FFF4D6', borderColor: '#D9A400' },
  boundary: { backgroundColor: colors.primary, borderColor: colors.primary },
  wicket: { backgroundColor: colors.danger, borderColor: colors.danger },
  ballText: { fontSize: 13, fontWeight: '800' },
  darkText: { color: colors.text },
  lightText: { color: colors.onPrimary },
  edit: {
    paddingHorizontal: spacing.sm,
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  editText: { fontSize: font.small, fontWeight: '800', color: colors.primary },
  pressed: { opacity: 0.6 },
});
