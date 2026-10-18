// Poster for an upcoming match: choose a template, then save the PNG or share it.
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_NAME } from '../../../appInfo';
import { Button } from '../../../components/Button';
import { Chips } from '../../../components/Chips';
import { MatchPoster, POSTER_EXPORT, POSTER_TEMPLATES, type PosterTemplate } from '../../../components/export/MatchPoster';
import { ErrorBanner, ErrorView, LoadingView } from '../../../components/StateViews';
import { useRepositories } from '../../../data/AppDataProvider';
import { formatLabel, formatMatchDate, formatMatchTime } from '../../../domain/schedule';
import { captureViewPng } from '../../../export/exportFiles';
import { exportFileName } from '../../../export/exportNames';
import { saveFileToFolder, shareFile } from '../../../files/shareAndSave';
import { useFocusLoad } from '../../../hooks/useFocusLoad';
import { useGuardedAction } from '../../../hooks/useGuardedAction';
import { colors, font, radius, spacing } from '../../../theme/theme';
import { errorMessage } from '../../../utils/errors';

export default function PosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { schedules, teams } = useRepositories();
  const insets = useSafeAreaInsets();
  const { run, pending } = useGuardedAction();
  const posterRef = useRef<View>(null);
  const [template, setTemplate] = useState<PosterTemplate>('pitch');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: loadError, reload } = useFocusLoad(async () => {
    const schedule = await schedules.get(id);
    if (!schedule) return null;
    const [teamA, teamB] = await Promise.all([teams.get(schedule.teamAId), teams.get(schedule.teamBId)]);
    return { schedule, teamA, teamB };
  }, [schedules, teams, id]);

  if (loadError && !data) return <ErrorView message={loadError} onRetry={reload} />;
  if (loading && !data) return <LoadingView />;
  if (!data) return <ErrorView title="Not found" message="This scheduled match no longer exists." />;
  const { schedule, teamA, teamB } = data;
  const fileName = exportFileName('poster', teamA?.name ?? 'team', teamB?.name ?? 'team', schedule.scheduledAt, 'png');

  const act = (work: () => Promise<string | null>) =>
    run(async () => {
      setMessage(null);
      setError(null);
      try {
        setMessage(await work());
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  const makePng = () => captureViewPng(posterRef, fileName, POSTER_EXPORT);

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}>
      {error ? <ErrorBanner message={error} /> : null}
      {message ? (
        <View style={styles.success} accessibilityLiveRegion="polite">
          <Text style={styles.successText}>{message}</Text>
        </View>
      ) : null}
      <Text style={styles.heading}>Template</Text>
      <Chips options={POSTER_TEMPLATES} value={template} onChange={setTemplate} />

      <View style={styles.preview}>
        <MatchPoster
          ref={posterRef}
          template={template}
          teamA={{ name: teamA?.name ?? 'Team 1', logoFile: teamA?.logoFile ?? null }}
          teamB={{ name: teamB?.name ?? 'Team 2', logoFile: teamB?.logoFile ?? null }}
          date={formatMatchDate(schedule.scheduledAt)}
          time={formatMatchTime(schedule.scheduledAt)}
          venue={schedule.venue}
          format={formatLabel(schedule.formatName, schedule.oversPerInnings)}
          appName={APP_NAME}
        />
      </View>
      <Text style={styles.help}>Saved as a {POSTER_EXPORT.width} × {POSTER_EXPORT.height} PNG.</Text>

      <Button
        title="Save poster to a folder…"
        loading={pending}
        onPress={() =>
          void act(async () => {
            const saved = await saveFileToFolder(await makePng(), fileName, 'image/png');
            return saved ? `Poster saved as ${saved}.` : null;
          })
        }
      />
      <Button
        title="Share poster"
        variant="secondary"
        disabled={pending}
        onPress={() =>
          void act(async () => {
            await shareFile(await makePng(), 'image/png', 'Share match poster');
            return null;
          })
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  heading: { fontSize: font.large, fontWeight: '700', color: colors.text },
  help: { fontSize: font.small, color: colors.textMuted, textAlign: 'center' },
  preview: { alignItems: 'center', borderRadius: radius.md, overflow: 'hidden' },
  success: { backgroundColor: '#E6F2EC', borderLeftWidth: 4, borderLeftColor: colors.primary, padding: spacing.md, borderRadius: radius.sm },
  successText: { color: colors.primaryDark, fontSize: font.body, fontWeight: '600' },
});
