import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme/theme';
import { Button } from './Button';

export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.message}>{label}</Text>
    </View>
  );
}

export function ErrorView({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <Button title="Retry" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

/** Inline error shown above a form or list when an action (like Save) fails. */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text, textAlign: 'center' },
  message: { fontSize: font.body, color: colors.textMuted, textAlign: 'center' },
  banner: {
    backgroundColor: colors.errorBg,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    padding: spacing.md,
    borderRadius: radius.sm,
  },
  bannerText: { color: colors.danger, fontSize: font.body, fontWeight: '600' },
});
