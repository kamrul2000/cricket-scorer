import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, MIN_TOUCH, radius, spacing } from '../theme/theme';

interface Props {
  title: string;
  subtitle?: string;
  /** Small label on the right, e.g. "Archived". */
  badge?: string;
  /** Shown on the left, e.g. a team logo. */
  leading?: ReactNode;
  onPress?: () => void;
}

export function ListRow({ title, subtitle, badge, leading, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {leading}
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH + 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  pressed: { backgroundColor: '#E8EFEB' },
  texts: { flex: 1 },
  title: { fontSize: font.large, fontWeight: '600', color: colors.text },
  subtitle: { fontSize: font.small, color: colors.textMuted },
  badge: {
    fontSize: font.small,
    fontWeight: '700',
    color: colors.textMuted,
    backgroundColor: '#E3E9E5',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
