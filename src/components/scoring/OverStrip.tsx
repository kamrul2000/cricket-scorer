// Deliveries of the current (or just finished) over as coloured balls. Tapping a ball (when
// `onSelectBall` is given) opens it for editing.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { deliveryLabel } from '../../domain/format';
import type { DeliveryRecord, InningsState } from '../../domain/scoring';
import { colors, font, spacing } from '../../theme/theme';

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
      style={({ pressed }) => pressed && styles.pressed}
    >
      {chip}
    </Pressable>
  );
}

export function OverStrip({ inn, onSelectBall }: { inn: InningsState; onSelectBall?: (eventIndex: number) => void }) {
  const last = inn.deliveries[inn.deliveries.length - 1];
  const over = last?.over ?? 0;
  const balls = inn.deliveries.filter((d) => d.over === over);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        Over {over + 1}
        {onSelectBall && balls.length ? '  ·  tap a ball to edit it' : ''}
      </Text>
      {balls.length === 0 ? (
        <Text style={styles.empty}>No deliveries yet</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {balls.map((d) => (
            <BallChip key={d.eventIndex} d={d} onPress={onSelectBall ? () => onSelectBall(d.eventIndex) : undefined} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: font.small, fontWeight: '700', color: colors.textMuted },
  empty: { fontSize: font.body, color: colors.textMuted },
  row: { gap: spacing.sm, paddingVertical: 2 },
  ball: { minWidth: 44, height: 44, borderRadius: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  normal: { backgroundColor: colors.surface, borderColor: colors.border },
  extra: { backgroundColor: '#FFF4D6', borderColor: '#D9A400' },
  boundary: { backgroundColor: colors.primary, borderColor: colors.primary },
  wicket: { backgroundColor: colors.danger, borderColor: colors.danger },
  ballText: { fontSize: font.small, fontWeight: '800' },
  darkText: { color: colors.text },
  lightText: { color: colors.onPrimary },
  pressed: { opacity: 0.6 },
});
