// Match controls beside the scoring pad: pausing and resuming, and the "More" sheet with ending
// the innings early, changing the overs after an interruption and, until the first ball,
// editing the match settings. Each sheet is a full-screen modal like the ball picker.
import { useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MatchPause } from '../../data/matchRepository';
import { formatOvers, scoreText } from '../../domain/format';
import { MAX_PLAYERS_PER_SIDE, MIN_PLAYERS_PER_SIDE, teamSize, type MatchEvent } from '../../domain/match';
import { formatMatchDate, formatMatchTime } from '../../domain/schedule';
import { canCloseInnings, currentInnings, oversRevision, suggestedTarget, upcomingInnings, type MatchState } from '../../domain/scoring';
import type { SubmitResult } from '../../hooks/useMatchScoring';
import type { MatchSettings } from '../../services/matchService';
import { colors, font, radius, spacing } from '../../theme/theme';
import { parseWhole } from '../../utils/numbers';
import { Button } from '../Button';
import { Chips } from '../Chips';
import { ErrorBanner } from '../StateViews';
import { TextField } from '../TextField';

function Sheet({ title, subtitle, footer, onClose, children }: { title: string; subtitle: string; footer: ReactNode; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: spacing.md + insets.top }]}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}>{footer}</View>
      </View>
    </Modal>
  );
}

/** Cancel and a main action side by side. */
function SheetButtons({ title, saving, onPress, onClose }: { title: string; saving: boolean; onPress: () => void; onClose: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Button title="Cancel" variant="secondary" onPress={onClose} disabled={saving} />
      </View>
      <View style={styles.flex}>
        <Button title={title} loading={saving} onPress={onPress} />
      </View>
    </View>
  );
}

/** Keeps the sheet open with the error shown, or closes it once the change is saved. */
function useSave(onClose: () => void) {
  const [error, setError] = useState<string | null>(null);
  const save = async (work: () => Promise<SubmitResult>) => {
    setError(null);
    const r = await work();
    if (r.ok) onClose();
    else if (r.error) setError(r.error);
  };
  return { error, setError, save };
}

// ---- Pause ----------------------------------------------------------------------------------

const PAUSE_REASONS = ['Rain', 'Bad light', 'Drinks break', 'Meal break', 'Injury'];

export function PauseSheet({
  saving,
  onPause,
  onClose,
}: {
  saving: boolean;
  onPause: (reason: string | null) => Promise<SubmitResult>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const { error, save } = useSave(onClose);
  return (
    <Sheet
      title="Pause match"
      subtitle="Everything recorded so far is saved."
      onClose={onClose}
      footer={<SheetButtons title="Pause match" saving={saving} onPress={() => void save(() => onPause(reason))} onClose={onClose} />}
    >
      <Text style={styles.heading}>Reason (optional)</Text>
      <Chips
        options={PAUSE_REASONS.map((r) => ({ value: r, label: r }))}
        value={reason}
        onChange={(r) => setReason(r === reason ? null : r)}
        accessibilityLabel="Reason for the pause"
      />
      <Text style={styles.help}>
        Scoring stops and the match list shows the match as Paused. Open it again and tap Resume to carry on from the same
        ball. You can still change the overs or abandon the match while it is paused.
      </Text>
      {error ? <ErrorBanner message={error} /> : null}
    </Sheet>
  );
}

/** "3:05 PM" today, "Sat 25 Oct 2026 3:05 PM" on another day. */
function sinceText(iso: string): string {
  const today = formatMatchDate(new Date().toISOString());
  const day = formatMatchDate(iso);
  return day === today ? formatMatchTime(iso) : `${day} ${formatMatchTime(iso)}`;
}

/** Shown instead of the pad while the match is paused. */
export function PausedPanel({ pause, saving, onResume }: { pause: MatchPause; saving: boolean; onResume: () => Promise<SubmitResult> }) {
  const [error, setError] = useState<string | null>(null);
  const resume = async () => {
    setError(null);
    const r = await onResume();
    if (!r.ok && r.error) setError(r.error);
  };
  return (
    <View style={styles.paused} accessibilityLiveRegion="polite">
      <Text style={styles.pausedLabel}>MATCH PAUSED</Text>
      <Text style={styles.pausedReason}>
        {pause.reason ?? 'Paused'} · since {sinceText(pause.pausedAt)}
      </Text>
      <Text style={styles.help}>Scoring is stopped. Resume to carry on from the same ball.</Text>
      {error ? <ErrorBanner message={error} /> : null}
      <Button title="Resume match" loading={saving} onPress={() => void resume()} />
    </View>
  );
}

// ---- More -----------------------------------------------------------------------------------

function Option({ title, detail, disabled, onPress }: { title: string; detail: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.optionTitle}>{title}</Text>
      <Text style={styles.optionDetail}>{detail}</Text>
    </Pressable>
  );
}

export function MatchOptionsSheet({
  state,
  saving,
  onSubmit,
  onOpen,
  onClose,
}: {
  state: MatchState;
  saving: boolean;
  onSubmit: (event: MatchEvent) => Promise<SubmitResult>;
  onOpen: (sheet: 'overs' | 'settings') => void;
  onClose: () => void;
}) {
  const { error, save } = useSave(onClose);
  const inn = currentInnings(state);
  const canClose = canCloseInnings(state) && !!inn;
  const revision = oversRevision(state);
  const beforeFirstBall = state.innings.every((i) => i.deliveries.length === 0);
  const afterClose = inn && inn.index % 2 === 0 ? 'The next innings starts after it.' : 'The result is decided on the runs scored.';

  const confirmClose = () =>
    Alert.alert(
      'End the innings now?',
      `${inn!.battingTeam.name}'s innings ends at ${scoreText(inn!)} (${formatOvers(inn!.legalBalls)} ov). ${afterClose} You can undo this.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End innings', style: 'destructive', onPress: () => void save(() => onSubmit({ type: 'closeInnings' })) },
      ],
    );

  return (
    <Sheet title="More options" subtitle="Changes are kept in the match history and can be undone." onClose={onClose} footer={<Button title="Close" variant="secondary" onPress={onClose} />}>
      <Option
        title="End innings now"
        detail={
          canClose
            ? `Close ${inn!.battingTeam.name}'s innings before its overs or wickets run out: by agreement, or for any other reason. ${afterClose}`
            : 'Only while an innings is in progress.'
        }
        disabled={!canClose || saving}
        onPress={confirmClose}
      />
      <Option
        title="Change overs"
        detail={
          revision
            ? 'Shorten the match after rain, bad light or a late start, and set a revised target for the second innings.'
            : 'Only during an innings of the match or in the innings break, not in a Super Over.'
        }
        disabled={!revision || saving}
        onPress={() => onOpen('overs')}
      />
      <Option
        title="Edit match settings"
        detail={
          beforeFirstBall
            ? 'Overs, players per side, bowling limit and free hit. Possible until the first ball is bowled.'
            : 'Only before the first ball. To shorten the match now, use Change overs.'
        }
        disabled={!beforeFirstBall || saving}
        onPress={() => onOpen('settings')}
      />
      {error ? <ErrorBanner message={error} /> : null}
    </Sheet>
  );
}

// ---- Change overs ---------------------------------------------------------------------------

export function ChangeOversSheet({
  state,
  saving,
  onSubmit,
  onClose,
}: {
  state: MatchState;
  saving: boolean;
  onSubmit: (event: MatchEvent) => Promise<SubmitResult>;
  onClose: () => void;
}) {
  const revision = oversRevision(state);
  const { error, setError, save } = useSave(onClose);
  const [oversText, setOversText] = useState(String(revision?.overs ?? ''));
  const overs = parseWhole(oversText);
  const second = revision?.inningsIndex === 1;
  const suggestion = second && overs ? suggestedTarget(state, overs) : null;
  // The target follows the suggestion until the scorer types their own.
  const [ownTarget, setOwnTarget] = useState<string | null>(
    revision && second && revision.target !== suggestedTarget(state, revision.overs) ? String(revision.target) : null,
  );
  const targetText = ownTarget ?? (suggestion !== null ? String(suggestion) : '');
  const target = parseWhole(targetText);
  const [limitText, setLimitText] = useState(revision?.maxOversPerBowler == null ? '' : String(revision.maxOversPerBowler));
  if (!revision) return null;

  const inn = currentInnings(state)!;
  const first = state.innings[0];
  const chasing = revision.beforeStart ? upcomingInnings(state)?.battingTeam : second ? inn.battingTeam : null;
  const ballsLeft = overs !== null ? overs * 6 - (revision.beforeStart ? 0 : inn.legalBalls) : null;
  const runsSoFar = revision.beforeStart || !second ? 0 : inn.runs;

  const submit = () => {
    const limit = limitText.trim() === '' ? null : parseWhole(limitText);
    if (overs === null) return setError('Enter the number of overs.');
    if (second && target === null) return setError('Enter the target for the second innings.');
    if (limit === 0 || (limitText.trim() !== '' && limit === null)) return setError('Enter the maximum overs per bowler as a whole number, or leave it blank for no limit.');
    void save(() => onSubmit({ type: 'reviseOvers', overs, target: second ? target : null, maxOversPerBowler: limit }));
  };

  return (
    <Sheet
      title="Change overs"
      subtitle={second ? `Second innings: ${chasing?.name ?? ''}` : `First innings: ${inn.battingTeam.name}, ${scoreText(inn)} (${formatOvers(inn.legalBalls)} ov)`}
      onClose={onClose}
      footer={<SheetButtons title="Save" saving={saving} onPress={submit} onClose={onClose} />}
    >
      <TextField label="Overs for this innings" value={oversText} onChangeText={setOversText} keyboardType="number-pad" maxLength={3} />
      <Text style={styles.help}>
        From {revision.minOvers} to {revision.maxOvers}
        {revision.minOvers > 1 ? `: the ${revision.minOvers} overs already started cannot be taken away` : ''}.{' '}
        {second ? '' : 'The second innings gets the same number of overs.'}
        {!second && overs !== null && overs * 6 === inn.legalBalls ? ' The innings ends as soon as you save.' : ''}
      </Text>

      {second ? (
        <>
          <TextField
            label={`Target for ${chasing?.name ?? 'the second innings'}`}
            value={targetText}
            onChangeText={setOwnTarget}
            keyboardType="number-pad"
            maxLength={4}
          />
          <Text style={styles.help}>
            {suggestion !== null
              ? `Suggested ${suggestion}: ${first.battingTeam.name}'s ${first.runs} runs in ${first.oversLimit} overs, scaled to ${overs} overs, plus 1 (average run rate method). `
              : ''}
            Agree the target with both captains. The DLS method is not used.
          </Text>
          {ownTarget !== null && suggestion !== null ? (
            <Button title={`Use the suggested target (${suggestion})`} variant="secondary" onPress={() => setOwnTarget(null)} />
          ) : null}
          {target !== null && ballsLeft !== null && ballsLeft > 0 ? (
            <Text style={styles.preview}>
              {chasing?.name} will need {Math.max(0, target - runsSoFar)} from {ballsLeft} {ballsLeft === 1 ? 'ball' : 'balls'}.
            </Text>
          ) : null}
        </>
      ) : null}

      <TextField
        label="Maximum overs per bowler"
        value={limitText}
        onChangeText={setLimitText}
        keyboardType="number-pad"
        placeholder="No limit"
        maxLength={3}
      />
      <Text style={styles.help}>
        Leave blank for no limit.{overs !== null ? ` In shortened matches it is usually a fifth of the overs: ${Math.ceil(overs / 5)} for ${overs}.` : ''}
      </Text>
      {error ? <ErrorBanner message={error} /> : null}
    </Sheet>
  );
}

// ---- Match settings (before the first ball) ---------------------------------------------------

const SIZE_OPTIONS = Array.from({ length: MAX_PLAYERS_PER_SIDE - MIN_PLAYERS_PER_SIDE + 1 }, (_, i) => i + MIN_PLAYERS_PER_SIDE);

export function MatchSettingsSheet({
  state,
  saving,
  onSave,
  onClose,
}: {
  state: MatchState;
  saving: boolean;
  onSave: (settings: MatchSettings) => Promise<SubmitResult>;
  onClose: () => void;
}) {
  const { rules, teams } = state.setup;
  const { error, setError, save } = useSave(onClose);
  const [oversText, setOversText] = useState(String(rules.oversPerInnings));
  const [limitText, setLimitText] = useState(rules.maxOversPerBowler === null ? '' : String(rules.maxOversPerBowler));
  const [freeHit, setFreeHit] = useState(rules.freeHitAfterNoBall);
  const [sizes, setSizes] = useState<[number, number]>([teamSize(teams[0]), teamSize(teams[1])]);

  const submit = () => {
    const overs = parseWhole(oversText);
    const limit = limitText.trim() === '' ? null : parseWhole(limitText);
    if (overs === null || overs < 1) return setError('Enter the overs per innings as a whole number.');
    if (limit === 0 || (limitText.trim() !== '' && limit === null)) return setError('Enter the maximum overs per bowler as a whole number, or leave it blank for no limit.');
    void save(() => onSave({ oversPerInnings: overs, maxOversPerBowler: limit, freeHitAfterNoBall: freeHit, sizes }));
  };

  return (
    <Sheet
      title="Match settings"
      subtitle="Can be changed until the first ball is bowled."
      onClose={onClose}
      footer={<SheetButtons title="Save" saving={saving} onPress={submit} onClose={onClose} />}
    >
      <TextField label="Overs per innings" value={oversText} onChangeText={setOversText} keyboardType="number-pad" maxLength={3} />
      {teams.map((team, i) => (
        <View key={team.teamId} style={styles.group}>
          <Text style={styles.heading}>Players for {team.name}</Text>
          <Chips
            options={SIZE_OPTIONS.map((n) => ({ value: n, label: String(n), disabled: n < team.players.length }))}
            value={sizes[i]}
            onChange={(n) => setSizes(i === 0 ? [n, sizes[1]] : [sizes[0], n])}
            accessibilityLabel={`Players for ${team.name}`}
          />
          <Text style={styles.help}>
            {team.players.length} named so far, so at least {Math.max(MIN_PLAYERS_PER_SIDE, team.players.length)}.
          </Text>
        </View>
      ))}
      <TextField
        label="Maximum overs per bowler"
        value={limitText}
        onChangeText={setLimitText}
        keyboardType="number-pad"
        placeholder="No limit"
        maxLength={3}
      />
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={styles.heading}>Free hit after a no-ball</Text>
          <Text style={styles.help}>A competition rule (ICC limited-overs), not part of the MCC Laws.</Text>
        </View>
        <Switch value={freeHit} onValueChange={setFreeHit} trackColor={{ true: colors.primary, false: colors.border }} accessibilityLabel="Free hit after a no-ball" />
      </View>
      <Text style={styles.help}>The toss and the openers cannot be changed here. To change them, delete the match and start it again.</Text>
      {error ? <ErrorBanner message={error} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primary, padding: spacing.md, gap: 2 },
  title: { color: colors.onPrimary, fontSize: font.title, fontWeight: '800' },
  subtitle: { color: '#D5E8DF', fontSize: font.body, fontWeight: '600' },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  group: { gap: spacing.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.text },
  help: { fontSize: font.small, color: colors.textMuted },
  preview: { fontSize: font.large, fontWeight: '700', color: colors.primaryDark },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  option: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 },
  optionTitle: { fontSize: font.large, fontWeight: '800', color: colors.primary },
  optionDetail: { fontSize: font.small, color: colors.textMuted },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  paused: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: '#E0B43A',
    padding: spacing.md,
  },
  pausedLabel: { fontSize: font.small, fontWeight: '900', letterSpacing: 2, color: '#7A5A00' },
  pausedReason: { fontSize: font.title, fontWeight: '800', color: colors.text },
});
