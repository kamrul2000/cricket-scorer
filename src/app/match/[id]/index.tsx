// Match scorecard: result, both innings, extras, fall of wickets and ball-by-ball history.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/Button';
import { Chips } from '../../../components/Chips';
import { BallByBall } from '../../../components/scorecard/BallByBall';
import { InningsScorecard } from '../../../components/scorecard/InningsScorecard';
import { ErrorBanner, ErrorView, LoadingView } from '../../../components/StateViews';
import { useMatchService } from '../../../data/AppDataProvider';
import { matchSummary, teamName } from '../../../domain/format';
import { useFocusLoad } from '../../../hooks/useFocusLoad';
import { useGuardedAction } from '../../../hooks/useGuardedAction';
import { colors, font, radius, spacing } from '../../../theme/theme';
import { errorMessage } from '../../../utils/errors';

export default function MatchScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const service = useMatchService();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { run, pending } = useGuardedAction();
  const [tab, setTab] = useState<string>('0');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: match, error, reload, loading } = useFocusLoad(() => service.loadMatch(id), [service, id]);

  if (error && !match) return <ErrorView title="Could not open this match" message={error} onRetry={reload} />;
  if (loading && !match) return <LoadingView />;
  if (!match) return <ErrorView title="Match not found" message="This match no longer exists." />;

  const { state, setup } = match;
  const completed = state.result !== null;
  const tabs = state.innings.flatMap((inn) => [
    { value: `${inn.index}`, label: `${inn.battingTeam.name} card` },
    { value: `${inn.index}b`, label: `${inn.index === 0 ? '1st' : '2nd'} inns balls` },
  ]);
  const selectedIndex = Number(tab[0]);
  const selected = state.innings[selectedIndex] ?? state.innings[0];
  const showBalls = tab.endsWith('b');

  const confirmDelete = () =>
    Alert.alert(
      'Delete this match?',
      `${setup.teams[0].name} v ${setup.teams[1].name} and its full ball-by-ball history will be permanently deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            void run(async () => {
              try {
                await service.deleteMatch(id);
                router.dismissTo('/');
              } catch (e) {
                setActionError(errorMessage(e));
              }
            }),
        },
      ],
    );

  const toss = `${teamName(setup, setup.toss.winnerTeamId)} won the toss and chose to ${setup.toss.decision}.`;
  const r = setup.rules;
  const rules = `${r.oversPerInnings} overs · ${r.playersPerSide} a side · free hit ${r.freeHitAfterNoBall ? 'on' : 'off'}${
    r.maxOversPerBowler ? ` · max ${r.maxOversPerBowler} overs per bowler` : ''
  }`;

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}>
      <Stack.Screen options={{ title: 'Scorecard' }} />
      {actionError ? <ErrorBanner message={actionError} /> : null}

      <View style={[styles.summary, completed && styles.summaryDone]}>
        <Text style={styles.status}>{completed ? 'RESULT' : 'IN PROGRESS'}</Text>
        <Text style={styles.summaryText}>{matchSummary(state)}</Text>
        <Text style={styles.meta}>{toss}</Text>
        <Text style={styles.meta}>{rules}</Text>
        <Text style={styles.meta}>Started {new Date(match.createdAt).toLocaleString()}</Text>
      </View>

      {!completed ? (
        <Button title="Resume scoring" onPress={() => router.push(`/match/${id}/score`)} />
      ) : (
        <Button title="Open scoring screen (to undo)" variant="secondary" onPress={() => router.push(`/match/${id}/score`)} />
      )}

      <Chips options={tabs} value={tab} onChange={setTab} accessibilityLabel="Choose innings and view" />

      {selected ? (
        showBalls ? <BallByBall state={state} inn={selected} /> : <InningsScorecard state={state} inn={selected} />
      ) : (
        <Text style={styles.meta}>No innings yet.</Text>
      )}

      <View style={styles.dangerZone}>
        <Button title="Delete match" variant="danger" onPress={confirmDelete} loading={pending} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  summary: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  summaryDone: { borderColor: colors.primary, borderWidth: 2 },
  status: { fontSize: font.small, fontWeight: '800', color: colors.primary },
  summaryText: { fontSize: font.title, fontWeight: '800', color: colors.text },
  meta: { fontSize: font.small, color: colors.textMuted },
  dangerZone: { marginTop: spacing.xl },
});
