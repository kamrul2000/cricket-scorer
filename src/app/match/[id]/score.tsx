// The scoring screen. Every tap becomes one event that is validated by the scoring engine and
// saved in a transaction before the screen updates. Laid out to fit one phone screen: score,
// batters and bowler, this over, the occasional actions, then the pad fills the rest. Prompts
// (next batter, next bowler, ...) take the pad's place and scroll if they are long.
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/Button';
import { ReplaceBowlerPanel, RetirePanel } from '../../../components/scoring/ActionPanels';
import { BallPicker } from '../../../components/scoring/BallPicker';
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
import { canReplaceBowler, canRetire, canSwapBatters, currentInnings } from '../../../domain/scoring';
import { useLineupAdder } from '../../../hooks/useLineupAdder';
import { useMatchScoring } from '../../../hooks/useMatchScoring';
import { colors, font, radius, spacing } from '../../../theme/theme';

/** The delivery editor: a new ball from a preset, or (with editIndex) an earlier ball. */
type EditorState = { preset: EditorPreset; editIndex?: number };

/** A small button for the occasional actions row. */
function ActionButton({ label, onPress, disabled, active }: { label: string; onPress: () => void; disabled: boolean; active?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: !!active }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [styles.action, active && styles.actionActive, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.actionText, active && styles.actionTextActive]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </Pressable>
  );
}

export default function ScoreScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { match, loadError, saving, saveError, submit, edit, undo, retry, discardFailed, reload } = useMatchScoring(id);
  const adder = useLineupAdder(match, submit);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [panel, setPanel] = useState<'retire' | 'bowler' | null>(null);
  const [pickingBall, setPickingBall] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [slowSave, setSlowSave] = useState(false);

  // Most saves take a few milliseconds: only mention saving when one takes noticeably longer.
  useEffect(() => {
    if (!saving) return;
    const timer = setTimeout(() => setSlowSave(true), 400);
    return () => {
      clearTimeout(timer);
      setSlowSave(false);
    };
  }, [saving]);

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
  const retireAllowed = canRetire(state);
  const bowlerChangeAllowed = canReplaceBowler(state);
  const hasDeliveries = state.innings.some((i) => i.deliveries.length > 0);
  const openEdit = (eventIndex: number) => {
    setQuickError(null);
    setPickingBall(false);
    setEditor({ preset: { kind: 'fair' }, editIndex: eventIndex });
  };
  // An open action panel takes the place of the pad (or the current prompt) until it closes.
  const shownPanel =
    panel === 'retire' && retireAllowed ? 'retire' : panel === 'bowler' && bowlerChangeAllowed ? 'bowler' : null;
  const inPlay = !!inn && !inn.completed && (next.type === 'delivery' || next.type === 'selectBowler');
  const padShown = !shownPanel && next.type === 'delivery';

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
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.sm + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
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
        {inn ? (
          <OverStrip
            inn={inn}
            onSelectBall={blocked ? undefined : openEdit}
            onPickBall={hasDeliveries && !blocked ? () => setPickingBall(true) : undefined}
          />
        ) : null}
        {inPlay ? (
          <View style={styles.actions}>
            <ActionButton label="⇄ Swap" onPress={confirmSwap} disabled={blocked || !canSwapBatters(state)} />
            <ActionButton
              label="Retire batter"
              onPress={() => setPanel(shownPanel === 'retire' ? null : 'retire')}
              disabled={blocked || !retireAllowed}
              active={shownPanel === 'retire'}
            />
            <ActionButton
              label="Change bowler"
              onPress={() => setPanel(shownPanel === 'bowler' ? null : 'bowler')}
              disabled={blocked || !bowlerChangeAllowed}
              active={shownPanel === 'bowler'}
            />
          </View>
        ) : null}

        {quickError ? <ErrorBanner message={quickError} /> : null}

        {padShown ? (
          <ScoringPad
            disabled={blocked}
            onRuns={(runs) => void quick({ runs, boundary: 'none' })}
            onBoundary={(b) => void quick({ runs: 0, boundary: b })}
            onOpenEditor={(p) => {
              setQuickError(null);
              setEditor({ preset: p });
            }}
            onUndo={confirmUndo}
            canUndo={canUndo}
          />
        ) : shownPanel === 'retire' ? (
          <RetirePanel state={state} saving={blocked} onSubmit={submit} onClose={() => setPanel(null)} />
        ) : shownPanel === 'bowler' ? (
          <ReplaceBowlerPanel state={state} saving={blocked} onSubmit={submit} onClose={() => setPanel(null)} adder={adder} />
        ) : (
          <>
            {next.type === 'selectBatter' ? <NewBatterPanel state={state} saving={blocked} onSubmit={submit} adder={adder} /> : null}
            {next.type === 'selectBowler' ? <NewBowlerPanel state={state} saving={blocked} onSubmit={submit} adder={adder} /> : null}
            {next.type === 'selectOpeners' ? <InningsBreakPanel state={state} saving={blocked} onSubmit={submit} adder={adder} /> : null}
            {next.type === 'matchComplete' ? (
              <MatchCompletePanel
                state={state}
                saving={blocked}
                onSubmit={submit}
                onViewScorecard={() => router.push(`/match/${id}`)}
              />
            ) : null}
            <Button title="Undo last action" variant="secondary" onPress={confirmUndo} disabled={blocked || !canUndo} />
          </>
        )}

        {next.type !== 'matchComplete' ? (
          <Pressable
            accessibilityRole="button"
            onPress={blocked ? undefined : confirmAbandon}
            style={({ pressed }) => [styles.abandon, pressed && styles.pressed, blocked && styles.disabled]}
          >
            <Text style={styles.abandonText}>Abandon match (no result)</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {saving && slowSave ? (
        <View pointerEvents="none" style={[styles.savingPill, { top: spacing.sm }]}>
          <Text style={styles.savingText} accessibilityLiveRegion="polite">
            Saving…
          </Text>
        </View>
      ) : null}

      {editor ? (
        <DeliveryEditor
          visible
          preset={editor.preset}
          editIndex={editor.editIndex}
          setup={setup}
          state={state}
          events={events}
          saving={saving}
          adder={adder}
          onCancel={() => setEditor(null)}
          onSubmit={(event) => (editor.editIndex === undefined ? submit(event) : edit(editor.editIndex, event))}
        />
      ) : null}
      {pickingBall ? <BallPicker state={state} onSelect={openEdit} onClose={() => setPickingBall(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // flexGrow lets the pad fill the screen; on a very small screen the page can still scroll.
  content: { flexGrow: 1, padding: spacing.sm, gap: spacing.sm },
  headerLink: { color: colors.onPrimary, fontSize: font.body, fontWeight: '700', padding: spacing.sm },
  saveError: { gap: spacing.sm, backgroundColor: colors.surface, padding: spacing.sm, borderRadius: radius.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionActive: { backgroundColor: colors.primary },
  actionText: { fontSize: font.small, fontWeight: '800', color: colors.primary },
  actionTextActive: { color: colors.onPrimary },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  abandon: {
    minHeight: 36,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abandonText: { color: colors.danger, fontSize: font.small, fontWeight: '800' },
  savingPill: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(20, 32, 27, 0.85)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 12,
  },
  savingText: { color: colors.onPrimary, fontSize: font.small, fontWeight: '700' },
});
