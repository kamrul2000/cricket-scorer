// Occasional scoring actions, opened from the scoring screen: a batter retiring, and another
// bowler taking over the over. Each records one event, checked by the scoring engine.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatOvers } from '../../domain/format';
import type { MatchEvent, Retirement } from '../../domain/match';
import { currentInnings, overInProgress, replacementBowlerOptions, type MatchState } from '../../domain/scoring';
import type { LineupAdder } from '../../hooks/useLineupAdder';
import type { SubmitResult } from '../../hooks/useMatchScoring';
import { colors, font, radius, spacing } from '../../theme/theme';
import { Button } from '../Button';
import { Chips } from '../Chips';
import { ErrorBanner } from '../StateViews';
import { ChooseOrAddPlayer } from './ChooseOrAddPlayer';

interface Props {
  state: MatchState;
  saving: boolean;
  onSubmit: (event: MatchEvent) => Promise<SubmitResult>;
  onClose: () => void;
}

export function RetirePanel({ state, saving, onSubmit, onClose }: Props) {
  const inn = currentInnings(state)!;
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [retirement, setRetirement] = useState<Retirement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string | null) => inn.batters.find((b) => b.playerId === id)?.name ?? '';

  const save = async () => {
    if (!playerId || !retirement) return;
    setError(null);
    const r = await onSubmit({ type: 'retire', playerId, retirement });
    if (r.ok || r.error === null) onClose();
    else setError(r.error);
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Retire a batter</Text>
      <Text style={styles.heading}>Who is retiring?</Text>
      <Chips
        options={[
          { value: inn.strikerId!, label: `${name(inn.strikerId)} (striker)` },
          { value: inn.nonStrikerId!, label: `${name(inn.nonStrikerId)} (non-striker)` },
        ]}
        value={playerId}
        onChange={setPlayerId}
      />
      <Text style={styles.heading}>How?</Text>
      <Chips
        options={[
          { value: 'hurt', label: 'Retired hurt' },
          { value: 'out', label: 'Retired out' },
        ]}
        value={retirement}
        onChange={(v) => setRetirement(v as Retirement)}
      />
      <Text style={styles.help}>
        {retirement === 'out'
          ? 'Retired out counts as a wicket (not credited to the bowler). The batter cannot come back.'
          : 'Retired hurt is not a wicket. The batter is shown as retired hurt and can resume later, when the next batter is needed.'}{' '}
        A new batter takes their place.
      </Text>
      {error ? <ErrorBanner message={error} /> : null}
      <View style={styles.buttons}>
        <View style={styles.flex}>
          <Button title="Cancel" variant="secondary" onPress={onClose} disabled={saving} />
        </View>
        <View style={styles.flex}>
          <Button title="Retire" onPress={() => void save()} disabled={!playerId || !retirement} loading={saving} />
        </View>
      </View>
    </View>
  );
}

export function ReplaceBowlerPanel({ state, saving, onSubmit, onClose, adder }: Props & { adder: LineupAdder }) {
  const inn = currentInnings(state)!;
  const options = replacementBowlerOptions(state);
  const started = overInProgress(inn);
  const current = inn.bowlers.find((b) => b.playerId === inn.bowlerId)?.name ?? '';

  const choose = async (playerId: string) => {
    const r = await onSubmit({ type: 'replaceBowler', playerId });
    if (r.ok || r.error === null) onClose();
    return r.ok ? null : r.error;
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{started ? `Who finishes ${current}'s over?` : `Change bowler instead of ${current}`}</Text>
      <Text style={styles.help}>
        {started
          ? "For a bowler who cannot finish the over (for example injured). Balls already bowled stay in the first bowler's figures. Neither bowler may bowl the next over (Laws 17.6 and 17.8), and a shared over is no one's maiden."
          : 'No ball has been bowled in this over yet, so this simply corrects who is bowling it.'}
      </Text>
      <ChooseOrAddPlayer
        teamId={inn.bowlingTeam.teamId}
        teamName={inn.bowlingTeam.name}
        players={options.map((o) => {
          const b = inn.bowlers.find((x) => x.playerId === o.playerId);
          return {
            playerId: o.playerId,
            name: inn.bowlingTeam.players.find((p) => p.playerId === o.playerId)!.name,
            disabledReason: o.reason ?? (saving ? 'Saving…' : null),
            detail: b ? `${formatOvers(b.legalBalls)}-${b.maidens}-${b.runsConceded}-${b.wickets}` : undefined,
          };
        })}
        adder={adder}
        saving={saving}
        onChoose={choose}
        newPlaceholder="New bowler's name"
      />
      <Button title="Cancel" variant="secondary" onPress={onClose} disabled={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text },
  heading: { fontSize: font.large, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  help: { fontSize: font.small, color: colors.textMuted },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
