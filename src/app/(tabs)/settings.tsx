import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { DEVELOPER } from '../../appInfo';
import { Button } from '../../components/Button';
import { useAppData } from '../../data/AppDataProvider';
import { faultInjection } from '../../services/matchService';
import { colors, font, radius, spacing } from '../../theme/theme';

export default function SettingsScreen() {
  const { schemaVersion } = useAppData();
  const router = useRouter();
  const appVersion = Constants.expoConfig?.version ?? 'unknown';
  const [armed, setArmed] = useState(faultInjection.failNextSave);
  // The flag clears itself after one failed save, so re-read it whenever this tab is shown.
  useFocusEffect(useCallback(() => setArmed(faultInjection.failNextSave), []));

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
          Local storage is not an automatic backup. Create a backup file regularly and keep it off
          this phone.
        </Text>
        <Button title="Backup and restore" onPress={() => router.push('/backup')} />
      </View>
      {__DEV__ ? (
        <View style={styles.card}>
          <Text style={styles.heading}>Developer testing</Text>
          <Text style={styles.line}>
            Only visible in development builds. Makes the next save (a scoring action or a restore) fail inside its
            transaction, so you can check the error message, Retry, and that nothing partial was stored.
          </Text>
          <Button
            title={armed ? 'Next save will fail (tap to cancel)' : 'Make the next save fail'}
            variant={armed ? 'danger' : 'secondary'}
            onPress={() => {
              faultInjection.failNextSave = !faultInjection.failNextSave;
              setArmed(faultInjection.failNextSave);
            }}
          />
        </View>
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.footerName}>Developed by {DEVELOPER.name}</Text>
        <Text style={styles.footerRole}>
          {DEVELOPER.role}, {DEVELOPER.company}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // flexGrow + marginTop 'auto' keep the footer at the bottom of the screen when there is room.
  content: { padding: spacing.md, gap: spacing.md, flexGrow: 1 },
  footer: { marginTop: 'auto', alignItems: 'center', paddingTop: spacing.lg, gap: 2 },
  footerName: { fontSize: font.body, fontWeight: '700', color: colors.textMuted, textAlign: 'center' },
  footerRole: { fontSize: font.small, color: colors.textMuted, textAlign: 'center' },
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
