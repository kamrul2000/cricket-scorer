// The scoring screen. Every tap becomes one event that is validated by the scoring engine and
// saved in a transaction before the screen updates.
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/Button';
import { DeliveryEditor } from '../../../components/scoring/DeliveryEditor';
import { CreasePanel } from '../../../components/scoring/CreasePanel';
import { OverStrip } from '../../../components/scoring/OverStrip';
import { ScoreHeader } from '../../../components/scoring/ScoreHeader';
import { ScoringPad, type EditorPreset } from '../../../components/scoring/ScoringPad';
import {
  InningsBreakPanel,
  MatchCompletePanel,
  NewBatterPanel,
  NewBowlerPanel,
} from '../../../components/scoring/SelectionPanels';
import { ErrorBanner, ErrorView, LoadingView } from '../../../components/StateViews';
import { describeLastEvent } from '../../../domain/format';
import type { DeliveryEvent, MatchEvent } from '../../../domain/match';
import { canSwapBatters, currentInnings } from '../../../domain/scoring';
import { useMatchScoring } from '../../../hooks/useMatchScoring';
import { colors, font, radius, spacing } from '../../../theme/theme';

export default function ScoreScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { match, loadError, saving, saveError, submit, undo, retry, discardFailed, reload } = useMatchScoring(id);
  const [editor, setEditor] = useState<EditorPreset | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);

  // Every saved action is already in the database, so leaving is always safe, except for an
  // action whose save failed: leaving gives up on it, so ask first (Android back or header back).
  useEffect(() => {
    if (!saveError) return;
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert('Leave without saving?', 'The last action was not saved. If you leave now, it will not be recorded.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
  }, [navigation, saveError]);

  if (loadError) return <ErrorView title="Could not open this match" message={loadError} onRetry={() => void reload()} />;
  if (!match) return <LoadingView label="Loading match…" />;

  const { state, events, setup } = match;
  const inn = currentInnings(state);
  const blocked = saving || !!saveError;

  const quick = async (input: Pick<DeliveryEvent, 'runs' | 'boundary'>) => {
    if (!inn?.strikerId || !inn.nonStrikerId || !inn.bowlerId) return;
    setQuickError(null);
    const r = await submit({
      type: 'delivery',
      ballType: 'fair',
      runsFrom: 'bat',
      dismissal: null,
      strikerId: inn.strikerId,
      nonStrikerId: inn.nonStrikerId,
      bowlerId: inn.bowlerId,
      ...input,
    });
    if (!r.ok && r.error) setQuickError(r.error);
  };

  const confirmUndo = () => {
    const what = describeLastEvent(state, events);
    Alert.alert('Undo last action?', what ?? '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: async () => {
          setQuickError(null);
          const r = await undo();
          if (!r.ok && r.error) setQuickError(r.error);
        },
      },
    ]);
  };

  const record = async (event: MatchEvent) => {
    setQuickError(null);
    const r = await submit(event);
    if (!r.ok && r.error) setQuickError(r.error);
  };

  const confirmSwap = () => {
    if (!inn?.strikerId || !inn.nonStrikerId) return;
    const striker = inn.batters.find((b) => b.playerId === inn.strikerId)!.name;
    const other = inn.batters.find((b) => b.playerId === inn.nonStrikerId)!.name;
    Alert.alert(
      'Swap batsmen?',
      `${other} will be on strike instead of ${striker}.\n\nThis is a scorer correction, not a delivery: no ball, run or statistic changes. It is kept in the match history and can be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Swap', onPress: () => void record({ type: 'swapBatters' }) },
      ],
    );
  };

  const confirmAbandon = () =>
    Alert.alert(
      'Abandon match?',
      'The match ends now with no result (for example because of rain or bad light). The score so far is kept. You can undo this.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Abandon match', style: 'destructive', onPress: () => void record({ type: 'abandon' }) },
      ],
    );

  const next = state.next;
  const canUndo = events.length > 1;
  const swapAllowed = canSwapBatters(state);
  const swapBlockedReason = next.type === 'selectBatter' ? 'Choose the new batter before swapping.' : null;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: `${setup.teams[0].name} v ${setup.teams[1].name}`,
          headerRight: () => (
            <Text style={styles.headerLink} onPress={() => router.push(`/match/${id}`)} accessibilityRole="link">
              Scorecard
            </Text>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}>
        {saveError ? (
          <View style={styles.saveError}>
            <ErrorBanner message={saveError} />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button title="Retry save" onPress={() => void retry()} loading={saving} />
              </View>
              <View style={styles.flex}>
                <Button title="Discard" variant="secondary" onPress={() => void discardFailed()} disabled={saving} />
              </View>
            </View>
          </View>
        ) : null}

        {inn ? <ScoreHeader state={state} inn={inn} /> : null}
        {inn && !inn.completed ? <CreasePanel inn={inn} /> : null}
        {swapAllowed || swapBlockedReason ? (
          <View style={styles.swapRow}>
            <Button title="⇄ Swap batsmen" variant="secondary" onPress={confirmSwap} disabled={blocked || !swapAllowed} />
            {swapBlockedReason ? <Text style={styles.hint}>{swapBlockedReason}</Text> : null}
          </View>
        ) : null}
        {inn ? <OverStrip inn={inn} /> : null}

        {saving ? (
          <Text style={styles.saving} accessibilityLiveRegion="polite">
            Saving…
          </Text>
        ) : null}
        {quickError ? <ErrorBanner message={quickError} /> : null}

        {next.type === 'delivery' ? (
          <ScoringPad
            disabled={blocked}
            onRuns={(runs) => void quick({ runs, boundary: 'none' })}
            onBoundary={(b) => void quick({ runs: 0, boundary: b })}
            onOpenEditor={(p) => {
              setQuickError(null);
              setEditor(p);
            }}
            onUndo={confirmUndo}
            canUndo={canUndo}
          />
        ) : (
          <>
            {next.type === 'selectBatter' ? <NewBatterPanel state={state} saving={blocked} onSubmit={submit} /> : null}
            {next.type === 'selectBowler' ? <NewBowlerPanel state={state} saving={blocked} onSubmit={submit} /> : null}
            {next.type === 'selectOpeners' ? <InningsBreakPanel state={state} saving={blocked} onSubmit={submit} /> : null}
            {next.type === 'matchComplete' ? (
              <MatchCompletePanel state={state} onViewScorecard={() => router.push(`/match/${id}`)} />
            ) : null}
            <Button title="Undo last action" variant="secondary" onPress={confirmUndo} disabled={blocked || !canUndo} />
          </>
        )}

        {next.type !== 'matchComplete' ? (
          <View style={styles.abandon}>
            <Button title="Abandon match (no result)" variant="danger" onPress={confirmAbandon} disabled={blocked} />
          </View>
        ) : null}
      </ScrollView>

      {editor ? (
        <DeliveryEditor
          visible
          preset={editor}
          state={state}
          events={events}
          saving={saving}
          onCancel={() => setEditor(null)}
          onSubmit={submit}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  headerLink: { color: colors.onPrimary, fontSize: font.body, fontWeight: '700', padding: spacing.sm },
  saveError: { gap: spacing.sm, backgroundColor: colors.surface, padding: spacing.sm, borderRadius: radius.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  saving: { fontSize: font.body, color: colors.textMuted, fontWeight: '700', textAlign: 'center' },
  swapRow: { gap: spacing.xs },
  hint: { fontSize: font.small, color: colors.textMuted, textAlign: 'center' },
  abandon: { marginTop: spacing.xl },
});
