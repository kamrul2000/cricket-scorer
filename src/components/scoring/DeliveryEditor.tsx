// Full delivery editor: ball type, runs source, runs completed, boundary, and dismissal.
// The preview is produced by the scoring engine itself, so what you see is what will be saved.
import { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DISMISSAL_LABELS, playerName } from '../../domain/format';
import {
  MAX_RUNS_PER_DELIVERY,
  type BallType,
  type Boundary,
  type DeliveryEvent,
  type Dismissal,
  type DismissalKind,
  type End,
  type MatchEvent,
  type RunsFrom,
} from '../../domain/match';
import { currentInnings, tryAddEvent, type MatchState } from '../../domain/scoring';
import type { SubmitResult } from '../../hooks/useMatchScoring';
import { colors, font, radius, spacing } from '../../theme/theme';
import { Button } from '../Button';
import { Chips } from '../Chips';
import type { EditorPreset } from './ScoringPad';

interface Draft {
  ballType: BallType;
  runsFrom: RunsFrom;
  runs: number;
  boundary: Boundary;
  /** null = the scorer still has to choose (used when opened with the Wicket button). */
  wicket: DismissalKind | 'none' | null;
  fielderId: string | null;
  runOutPlayerId: string | null;
  runOutEnd: End | null;
}

function draftFor(preset: EditorPreset): Draft {
  const base: Draft = {
    ballType: 'fair',
    runsFrom: 'bat',
    runs: 0,
    boundary: 'none',
    wicket: 'none',
    fielderId: null,
    runOutPlayerId: null,
    runOutEnd: null,
  };
  if (preset.kind === 'wicket') return { ...base, wicket: null };
  if (preset.kind === 'extra') {
    const isRunsExtra = preset.runsFrom === 'byes' || preset.runsFrom === 'legByes';
    return { ...base, ballType: preset.ballType, runsFrom: preset.runsFrom ?? 'bat', runs: isRunsExtra ? 1 : 0 };
  }
  return base;
}

interface Props {
  visible: boolean;
  preset: EditorPreset;
  state: MatchState;
  events: readonly MatchEvent[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (event: MatchEvent) => Promise<SubmitResult>;
}

/** Mount a fresh editor for each delivery; the draft starts from `preset` when it mounts. */
export function DeliveryEditor({ visible, preset, state, events, saving, onCancel, onSubmit }: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftFor(preset));
  const [submitError, setSubmitError] = useState<string | null>(null);

  const inn = currentInnings(state);
  const set = (patch: Partial<Draft>) => {
    setSubmitError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const built = useMemo((): { event: DeliveryEvent | null; problem: string | null } => {
    if (!inn || !inn.strikerId || !inn.nonStrikerId || !inn.bowlerId) return { event: null, problem: 'Not ready for a delivery.' };
    const d = draft;
    if (d.wicket === null) return { event: null, problem: 'Choose how the batter was out.' };
    let dismissal: Dismissal | null = null;
    switch (d.wicket) {
      case 'none':
        break;
      case 'caught':
      case 'stumped':
        if (!d.fielderId) return { event: null, problem: d.wicket === 'caught' ? 'Choose who took the catch.' : 'Choose the wicket-keeper.' };
        dismissal = { kind: d.wicket, fielderId: d.fielderId };
        break;
      case 'runOut':
        if (!d.runOutPlayerId) return { event: null, problem: 'Choose which batter is run out.' };
        if (!d.runOutEnd) return { event: null, problem: 'Choose the end where the wicket was broken.' };
        dismissal = { kind: 'runOut', playerOutId: d.runOutPlayerId, end: d.runOutEnd, fielderId: d.fielderId };
        break;
      default:
        dismissal = { kind: d.wicket };
    }
    const event: DeliveryEvent = {
      type: 'delivery',
      ballType: d.ballType,
      runsFrom: d.ballType === 'wide' ? null : d.runsFrom,
      runs: d.boundary === 'four' || d.boundary === 'six' ? 0 : d.runs,
      boundary: d.boundary,
      dismissal,
      strikerId: inn.strikerId,
      nonStrikerId: inn.nonStrikerId,
      bowlerId: inn.bowlerId,
    };
    return { event, problem: null };
  }, [draft, inn]);

  const check = useMemo(() => (built.event ? tryAddEvent(state.setup, events, built.event) : null), [built.event, state.setup, events]);
  const preview = useMemo(() => {
    if (!check?.ok) return null;
    const after = currentInnings(check.state);
    const record = check.state.innings.flatMap((i) => i.deliveries).find((d) => d.eventIndex === events.length);
    if (!record || !after) return null;
    const parts = [`Team +${record.totalRuns}`, `${playerName(state.setup, record.strikerId)} +${record.batterRuns}`];
    const ex = record.extras;
    const exParts = [
      ex.wides && `${ex.wides} wd`,
      ex.noBalls && `${ex.noBalls} nb`,
      ex.byes && `${ex.byes} b`,
      ex.legByes && `${ex.legByes} lb`,
    ].filter(Boolean);
    if (exParts.length) parts.push(`Extras ${exParts.join(', ')}`);
    parts.push(record.isLegalBall ? 'counts in the over' : 'does not count in the over');
    if (record.wicket) parts.push(`${playerName(state.setup, record.wicket.playerOutId)} OUT`);
    return parts.join(' · ');
  }, [check, events.length, state.setup]);

  if (!inn || !inn.strikerId || !inn.nonStrikerId) return null;
  const strikerName = playerName(state.setup, inn.strikerId);
  const nonStrikerName = playerName(state.setup, inn.nonStrikerId);
  const fielders = inn.bowlingTeam.players.map((p) => ({ value: p.playerId, label: p.name }));
  const error = built.problem ?? (check && !check.ok ? check.error : null);
  const boundaryRunsLocked = draft.boundary === 'four' || draft.boundary === 'six';

  const save = async () => {
    if (!built.event || !check?.ok) return;
    const result = await onSubmit(built.event);
    // Close on success, and on a storage failure too: the scoring screen shows that with Retry.
    if (result.ok || result.error === null) onCancel();
    else setSubmitError(result.error);
  };

  const wicketOptions: { value: DismissalKind | 'none'; label: string }[] = [
    { value: 'none', label: 'No wicket' },
    ...(['bowled', 'caught', 'lbw', 'stumped', 'hitWicket', 'runOut'] as DismissalKind[]).map((k) => ({
      value: k,
      label: DISMISSAL_LABELS[k],
    })),
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Record delivery</Text>
          <Text style={styles.subtitle}>
            {playerName(state.setup, inn.bowlerId)} to {strikerName}
            {inn.freeHitNext ? '  ·  FREE HIT' : ''}
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Delivery</Text>
          <Chips
            options={[
              { value: 'fair', label: 'Fair ball' },
              { value: 'wide', label: 'Wide' },
              { value: 'noBall', label: 'No ball' },
            ]}
            value={draft.ballType}
            onChange={(v) => set({ ballType: v as BallType })}
          />

          {draft.ballType !== 'wide' ? (
            <>
              <Text style={styles.heading}>Runs came from</Text>
              <Chips
                options={[
                  { value: 'bat', label: 'Bat' },
                  { value: 'byes', label: 'Byes' },
                  { value: 'legByes', label: 'Leg byes' },
                ]}
                value={draft.runsFrom}
                onChange={(v) => set({ runsFrom: v as RunsFrom })}
              />
            </>
          ) : (
            <Text style={styles.help}>All runs from a wide are scored as wides.</Text>
          )}

          <Text style={styles.heading}>Runs completed by running</Text>
          <Chips
            options={Array.from({ length: MAX_RUNS_PER_DELIVERY + 1 }, (_, n) => ({ value: n, label: String(n), disabled: boundaryRunsLocked }))}
            value={boundaryRunsLocked ? null : draft.runs}
            onChange={(v) => set({ runs: v })}
          />
          {boundaryRunsLocked ? <Text style={styles.help}>For a four or six, runs completed are not added.</Text> : null}

          <Text style={styles.heading}>Boundary</Text>
          <Chips
            options={[
              { value: 'none', label: 'None' },
              { value: 'four', label: 'Four' },
              { value: 'six', label: 'Six' },
              { value: 'overthrowFour', label: 'Overthrow 4' },
            ]}
            value={draft.boundary}
            onChange={(v) => set({ boundary: v as Boundary })}
          />
          {draft.boundary === 'overthrowFour' ? (
            <Text style={styles.help}>Overthrow to the boundary: 4 + the runs completed when the throw was made.</Text>
          ) : null}

          <Text style={styles.heading}>Wicket</Text>
          <Chips
            options={wicketOptions}
            value={draft.wicket}
            onChange={(v) => set({ wicket: v, fielderId: null, runOutPlayerId: null, runOutEnd: null })}
          />

          {draft.wicket === 'caught' || draft.wicket === 'stumped' ? (
            <>
              <Text style={styles.heading}>{draft.wicket === 'caught' ? 'Caught by' : 'Stumped by (wicket-keeper)'}</Text>
              <Chips options={fielders} value={draft.fielderId} onChange={(v) => set({ fielderId: v })} />
            </>
          ) : null}

          {draft.wicket === 'runOut' ? (
            <>
              <Text style={styles.heading}>Who is out?</Text>
              <Chips
                options={[
                  { value: inn.strikerId, label: `${strikerName} (striker)` },
                  { value: inn.nonStrikerId, label: `${nonStrikerName} (non-striker)` },
                ]}
                value={draft.runOutPlayerId}
                onChange={(v) => set({ runOutPlayerId: v })}
              />
              <Text style={styles.heading}>Wicket broken at</Text>
              <Chips
                options={[
                  { value: 'striker', label: "Striker's end" },
                  { value: 'nonStriker', label: "Bowler's end" },
                ]}
                value={draft.runOutEnd}
                onChange={(v) => set({ runOutEnd: v as End })}
              />
              <Text style={styles.help}>
                {`Striker's end = where ${strikerName} faced this ball. The batter who is not out finishes at the other end, ` +
                  'and the new batter comes in at the end where the wicket was broken. Enter only runs completed before the run out.'}
              </Text>
              <Text style={styles.heading}>Fielder (optional)</Text>
              <Chips options={fielders} value={draft.fielderId} onChange={(v) => set({ fielderId: v === draft.fielderId ? null : v })} />
            </>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {error || submitError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {submitError ?? error}
            </Text>
          ) : preview ? (
            <Text style={styles.preview}>{preview}</Text>
          ) : null}
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={saving} />
            </View>
            <View style={styles.flex}>
              <Button title="Save" onPress={save} disabled={!check?.ok} loading={saving} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primary, padding: spacing.md, gap: 2 },
  title: { color: colors.onPrimary, fontSize: font.title, fontWeight: '800' },
  subtitle: { color: '#D5E8DF', fontSize: font.body, fontWeight: '600' },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  heading: { fontSize: font.large, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  help: { fontSize: font.small, color: colors.textMuted },
  footer: { padding: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  error: { color: colors.danger, fontSize: font.body, fontWeight: '700' },
  preview: { color: colors.text, fontSize: font.body, fontWeight: '600', backgroundColor: '#E6F2EC', padding: spacing.sm, borderRadius: radius.sm },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
