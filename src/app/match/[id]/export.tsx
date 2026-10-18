// Share a completed match: a multi-page PDF scorecard, or a scorecard image (PNG).
// Both are made on the phone, offline, and saved to a folder or sent with the share sheet.
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_NAME } from '../../../appInfo';
import { Button } from '../../../components/Button';
import { ScorecardImage } from '../../../components/export/ScorecardImage';
import { ErrorBanner, ErrorView, LoadingView } from '../../../components/StateViews';
import { useMatchService, useRepositories } from '../../../data/AppDataProvider';
import { resolveAwards } from '../../../domain/awards';
import { captureViewPng, createPdf, logoDataUris } from '../../../export/exportFiles';
import { exportFileName } from '../../../export/exportNames';
import { scorecardHtml } from '../../../export/scorecardHtml';
import { saveFileToFolder, shareFile } from '../../../files/shareAndSave';
import { useFocusLoad } from '../../../hooks/useFocusLoad';
import { useGuardedAction } from '../../../hooks/useGuardedAction';
import { colors, font, radius, spacing } from '../../../theme/theme';
import { errorMessage } from '../../../utils/errors';

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const service = useMatchService();
  const { teams } = useRepositories();
  const insets = useSafeAreaInsets();
  const { run, pending } = useGuardedAction();
  const imageRef = useRef<View>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: loadError, reload } = useFocusLoad(async () => {
    const match = await service.loadMatch(id);
    if (!match) return null;
    // Logos are the teams' current logos (the match snapshot keeps names, not images).
    const logoFiles: Record<string, string | null> = {};
    for (const t of match.setup.teams) logoFiles[t.teamId] = (await teams.get(t.teamId))?.logoFile ?? null;
    return { match, logoFiles };
  }, [service, teams, id]);

  if (loadError && !data) return <ErrorView message={loadError} onRetry={reload} />;
  if (loading && !data) return <LoadingView />;
  if (!data) return <ErrorView title="Match not found" message="This match no longer exists." />;
  const { match, logoFiles } = data;
  if (!match.state.result) {
    return <ErrorView title="Not finished yet" message="Scorecards can be exported once the match is complete." />;
  }
  const awards = resolveAwards(match.state, match.awards);
  const [a, b] = match.setup.teams;
  const name = (ext: 'pdf' | 'png') => exportFileName('scorecard', a.name, b.name, match.createdAt, ext);

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

  const makePdf = async () => {
    const html = scorecardHtml({
      state: match.state,
      details: match.details,
      awards,
      startedAt: match.createdAt,
      logos: await logoDataUris(match.setup.teams.map((t) => ({ teamId: t.teamId, logoFile: logoFiles[t.teamId] }))),
      appName: APP_NAME,
      generatedAt: new Date().toISOString(),
    });
    return createPdf(html, name('pdf'));
  };

  const makeImage = () => captureViewPng(imageRef, name('png'));

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}>
      {error ? <ErrorBanner message={error} /> : null}
      {message ? (
        <View style={styles.success} accessibilityLiveRegion="polite">
          <Text style={styles.successText}>{message}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.heading}>PDF scorecard</Text>
        <Text style={styles.line}>
          Both innings with batting, bowling, extras, fall of wickets, partnerships, over-by-over scores, the result and
          awards. Long scorecards continue over several A4 pages.
        </Text>
        <Button
          title="Save PDF to a folder…"
          loading={pending}
          onPress={() =>
            void act(async () => {
              const saved = await saveFileToFolder(await makePdf(), name('pdf'), 'application/pdf');
              return saved ? `PDF saved as ${saved}.` : null;
            })
          }
        />
        <Button
          title="Share PDF"
          variant="secondary"
          disabled={pending}
          onPress={() =>
            void act(async () => {
              await shareFile(await makePdf(), 'application/pdf', 'Share scorecard PDF');
              return null;
            })
          }
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Scorecard image</Text>
        <Text style={styles.line}>A picture of the card below, ready for messaging apps.</Text>
        <Button
          title="Save image to a folder…"
          loading={pending}
          onPress={() =>
            void act(async () => {
              const saved = await saveFileToFolder(await makeImage(), name('png'), 'image/png');
              return saved ? `Image saved as ${saved}.` : null;
            })
          }
        />
        <Button
          title="Share image"
          variant="secondary"
          disabled={pending}
          onPress={() =>
            void act(async () => {
              await shareFile(await makeImage(), 'image/png', 'Share scorecard image');
              return null;
            })
          }
        />
      </View>

      <View style={styles.preview}>
        <ScorecardImage
          ref={imageRef}
          state={match.state}
          details={match.details}
          awards={awards}
          startedAt={match.createdAt}
          logos={logoFiles}
          appName={APP_NAME}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  heading: { fontSize: font.title, fontWeight: '700', color: colors.text },
  line: { fontSize: font.body, color: colors.text },
  preview: { alignItems: 'center' },
  success: { backgroundColor: '#E6F2EC', borderLeftWidth: 4, borderLeftColor: colors.primary, padding: spacing.md, borderRadius: radius.sm },
  successText: { color: colors.primaryDark, fontSize: font.body, fontWeight: '600' },
});
