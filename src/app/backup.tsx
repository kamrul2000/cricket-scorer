// Backup and restore: export all data as a JSON file, restore from one (replacing everything),
// and check the stored data.
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickBackupFile, saveBackupToFolder, shareBackup } from '../backup/backupFiles';
import type { BackupSummary } from '../backup/backupFormat';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/StateViews';
import { useBackupService } from '../data/AppDataProvider';
import type { DataCounts } from '../data/backupRepository';
import { useGuardedAction } from '../hooks/useGuardedAction';
import type { DataCheckReport, RestorePreview } from '../services/backupService';
import { colors, font, radius, spacing } from '../theme/theme';
import { errorMessage } from '../utils/errors';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function describeCounts(c: DataCounts): string {
  return `${count(c.players, 'player', 'players')}, ${count(c.teams, 'team', 'teams')}, ${count(c.matches, 'match', 'matches')}`;
}

function describeSummary(s: BackupSummary): string {
  return `${describeCounts(s)} (${s.completed} completed, ${s.inProgress} in progress)`;
}

export default function BackupScreen() {
  const service = useBackupService();
  const insets = useSafeAreaInsets();
  const { run, pending } = useGuardedAction();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ fileName: string; result: RestorePreview } | null>(null);
  const [report, setReport] = useState<DataCheckReport | null>(null);

  const reset = () => {
    setMessage(null);
    setError(null);
    setReport(null);
  };

  const exportBackup = (to: 'folder' | 'share') =>
    run(async () => {
      reset();
      try {
        const backup = await service.createBackup();
        const logoNote = backup.missingLogos
          ? ` ${backup.missingLogos} team logo image${backup.missingLogos === 1 ? ' was' : 's were'} missing on this phone and left out.`
          : '';
        if (to === 'folder') {
          const name = await saveBackupToFolder(backup.json, backup.fileName);
          if (name) setMessage(`Backup saved as ${name}: ${describeSummary(backup.summary)}.${logoNote}`);
        } else {
          await shareBackup(backup.json, backup.fileName);
          setMessage(
            `Backup created: ${describeSummary(backup.summary)}. Check that the app you chose actually saved or sent it.${logoNote}`,
          );
        }
      } catch (e) {
        setError(`No backup was saved. ${errorMessage(e)}`);
      }
    });

  const chooseFile = () =>
    run(async () => {
      reset();
      setPreview(null);
      try {
        const picked = await pickBackupFile();
        if (!picked) return;
        setPreview({ fileName: picked.name, result: await service.previewRestore(picked.text) });
      } catch (e) {
        setError(`The file could not be read. Nothing was changed. ${errorMessage(e)}`);
      }
    });

  const confirmRestore = () => {
    if (!preview?.result.ok) return;
    const { backup } = preview.result;
    Alert.alert(
      'Replace all data?',
      'Everything currently in the app will be permanently deleted and replaced by this backup. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace all data',
          style: 'destructive',
          onPress: () =>
            void run(async () => {
              reset();
              try {
                await service.restore(backup);
                setPreview(null);
                setMessage(`Restore complete. The app now contains ${describeSummary(backup.summary)}.`);
              } catch (e) {
                setError(`Restore failed. Nothing was changed. ${errorMessage(e)}`);
              }
            }),
        },
      ],
    );
  };

  const checkData = () =>
    run(async () => {
      reset();
      try {
        setReport(await service.checkData());
      } catch (e) {
        setError(`The check could not be run. ${errorMessage(e)}`);
      }
    });

  const valid = preview?.result.ok ? preview.result : null;
  const invalid = preview && !preview.result.ok ? preview.result.errors : null;

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}>
      <View style={styles.card}>
        <Text style={styles.heading}>Keep your own copy</Text>
        <Text style={styles.line}>
          Your data is stored only inside this app on this phone. It is not backed up automatically. If the phone is lost
          or reset, or the app is uninstalled, everything is gone unless you have a backup file.
        </Text>
        <Text style={styles.line}>
          Make a backup after each match and keep it somewhere other than this phone, such as Google Drive or email.
        </Text>
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      {message ? (
        <View style={styles.success} accessibilityLiveRegion="polite">
          <Text style={styles.successText}>{message}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.heading}>Create a backup</Text>
        <Text style={styles.line}>
          All players, teams (with logos), matches, awards and upcoming matches, in one file. The file is checked before it
          is saved.
        </Text>
        <Button title="Save to a folder…" onPress={() => void exportBackup('folder')} loading={pending} />
        <Button title="Share (Drive, email…)" variant="secondary" onPress={() => void exportBackup('share')} disabled={pending} />
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Restore from a backup</Text>
        <Text style={styles.line}>
          Restoring replaces all data in the app with the backup. Nothing is merged. The file is checked completely first,
          and nothing changes until you confirm.
        </Text>
        <Button title="Choose backup file…" variant="secondary" onPress={() => void chooseFile()} disabled={pending} />

        {invalid ? (
          <View style={styles.problemBox} accessibilityRole="alert">
            <Text style={styles.problemTitle}>{preview?.fileName} cannot be restored. Nothing was changed.</Text>
            {invalid.map((p, i) => (
              <Text key={i} style={styles.problem}>
                • {p}
              </Text>
            ))}
          </View>
        ) : null}

        {valid ? (
          <View style={styles.confirmBox}>
            <Text style={styles.subheading}>{preview?.fileName}</Text>
            <Text style={styles.line}>
              Exported {new Date(valid.backup.file.exportedAt).toLocaleString()} (app version {valid.backup.file.appVersion}).
            </Text>
            <Text style={styles.line}>
              <Text style={styles.bold}>Backup contains: </Text>
              {describeSummary(valid.backup.summary)}.
            </Text>
            <Text style={styles.warning}>
              <Text style={styles.bold}>Will be permanently replaced: </Text>
              {describeCounts(valid.current)} currently in the app.
            </Text>
            <Text style={styles.help}>Not sure? Create a backup of the current data first (above).</Text>
            <Button title="Replace all data" variant="danger" onPress={confirmRestore} loading={pending} />
            <Button title="Cancel" variant="secondary" onPress={() => setPreview(null)} disabled={pending} />
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Check stored data</Text>
        <Text style={styles.line}>
          Checks the database file and replays every match ball by ball to confirm the stored history is complete.
        </Text>
        <Button title="Check stored data" variant="secondary" onPress={() => void checkData()} disabled={pending} />
        {report ? (
          report.problems.length === 0 ? (
            <Text style={styles.ok} accessibilityLiveRegion="polite">
              No problems found{report.summary ? `: ${describeSummary(report.summary)}` : ''}.
            </Text>
          ) : (
            <View style={styles.problemBox} accessibilityRole="alert">
              <Text style={styles.problemTitle}>Problems found:</Text>
              {report.problems.map((p, i) => (
                <Text key={i} style={styles.problem}>
                  • {p}
                </Text>
              ))}
            </View>
          )
        ) : null}
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
  subheading: { fontSize: font.large, fontWeight: '700', color: colors.text },
  line: { fontSize: font.body, color: colors.text },
  help: { fontSize: font.small, color: colors.textMuted },
  bold: { fontWeight: '800' },
  warning: { fontSize: font.body, color: colors.danger },
  success: { backgroundColor: '#E6F2EC', borderLeftWidth: 4, borderLeftColor: colors.primary, padding: spacing.md, borderRadius: radius.sm },
  successText: { color: colors.primaryDark, fontSize: font.body, fontWeight: '600' },
  ok: { fontSize: font.body, color: colors.primaryDark, fontWeight: '700' },
  confirmBox: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  problemBox: { gap: spacing.xs, backgroundColor: colors.errorBg, padding: spacing.sm, borderRadius: radius.sm },
  problemTitle: { fontSize: font.body, fontWeight: '700', color: colors.danger },
  problem: { fontSize: font.small, color: colors.text },
});
