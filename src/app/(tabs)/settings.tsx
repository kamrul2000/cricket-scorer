import Constants from 'expo-constants';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppData } from '../../data/AppDataProvider';
import { colors, font, radius, spacing } from '../../theme/theme';

export default function SettingsScreen() {
  const { schemaVersion } = useAppData();
  const appVersion = Constants.expoConfig?.version ?? 'unknown';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.heading}>About</Text>
        <Text style={styles.line}>Cricket Scorer, version {appVersion}</Text>
        <Text style={styles.line}>Database schema version {schemaVersion}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>Your data</Text>
        <Text style={styles.line}>
          Everything is stored only on this phone, with no account and no internet. Uninstalling
          the app or clearing its storage permanently deletes your data.
        </Text>
        <Text style={styles.line}>
          Local storage is not an automatic backup. Backup and restore will be added in a later
          stage.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  heading: { fontSize: font.title, fontWeight: '700', color: colors.text },
  line: { fontSize: font.body, color: colors.text },
});
