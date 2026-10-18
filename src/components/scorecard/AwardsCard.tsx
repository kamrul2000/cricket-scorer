// Match awards on the scorecard: Player of the Match (chosen by the scorer), Best Batter and
// Best Bowler (automatic, with an optional override). The ranking rules are in domain/awards.ts.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  participants,
  rankBatters,
  rankBowlers,
  resolveAwards,
  type BattingPerformance,
  type BowlingPerformance,
  type MatchAwards,
} from '../../domain/awards';
import { formatOvers, teamName } from '../../domain/format';
import type { MatchState } from '../../domain/scoring';
import { colors, font, radius, spacing } from '../../theme/theme';
import { Button } from '../Button';
import { PlayerPicker } from '../PlayerPicker';
import { ErrorBanner } from '../StateViews';

export const battingFigure = (b: BattingPerformance) => `${b.runs}${b.notOut ? '*' : ''} (${b.balls})`;
export const bowlingFigure = (b: BowlingPerformance) => `${b.wickets}/${b.runsConceded} (${formatOvers(b.legalBalls)} ov)`;

interface Props {
  state: MatchState;
  awards: MatchAwards;
  saving: boolean;
  onSave: (awards: MatchAwards) => Promise<string | null>;
}

export function AwardsCard({ state, awards, saving, onSave }: Props) {
  const [editing, setEditing] = useState<MatchAwards | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolved = resolveAwards(state, awards);
  const auto = resolveAwards(state, { ...awards, bestBatterId: null, bestBowlerId: null });

  const save = async () => {
    if (!editing) return;
    const problem = await onSave(editing);
    setError(problem);
    if (!problem) setEditing(null);
  };

  if (editing) {
    const pick = (key: keyof MatchAwards) => (id: string) =>
      setEditing({ ...editing, [key]: editing[key] === id ? null : id });
    return (
      <View style={styles.card}>
        <Text style={styles.heading}>Edit awards</Text>
        {error ? <ErrorBanner message={error} /> : null}

        <Text style={styles.sub}>Player of the Match</Text>
        <Text style={styles.help}>Tap a player to choose them; tap again for none.</Text>
        <PlayerPicker
          players={participants(state).map((p) => ({ playerId: p.playerId, name: p.name, detail: teamName(state.setup, p.teamId) }))}
          selectedIds={editing.playerOfMatchId ? [editing.playerOfMatchId] : []}
          onToggle={pick('playerOfMatchId')}
        />

        <Text style={styles.sub}>Best Batter</Text>
        <Text style={styles.help}>
          Leave unselected to use the automatic choice{auto.bestBatter ? ` (${auto.bestBatter.performance.name})` : ''}.
        </Text>
        <PlayerPicker
          players={rankBatters(state).map((b) => ({ playerId: b.playerId, name: b.name, detail: battingFigure(b) }))}
          selectedIds={editing.bestBatterId ? [editing.bestBatterId] : []}
          onToggle={pick('bestBatterId')}
        />

        <Text style={styles.sub}>Best Bowler</Text>
        <Text style={styles.help}>
          Leave unselected to use the automatic choice{auto.bestBowler ? ` (${auto.bestBowler.performance.name})` : ''}.
        </Text>
        <PlayerPicker
          players={rankBowlers(state).map((b) => ({ playerId: b.playerId, name: b.name, detail: bowlingFigure(b) }))}
          selectedIds={editing.bestBowlerId ? [editing.bestBowlerId] : []}
          onToggle={pick('bestBowlerId')}
        />

        <Button title="Save awards" onPress={() => void save()} loading={saving} />
        <Button title="Cancel" variant="secondary" onPress={() => setEditing(null)} disabled={saving} />
      </View>
    );
  }

  const tag = (automatic: boolean) => (automatic ? 'automatic' : 'chosen by scorer');
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Awards</Text>
      <Row label="Player of the Match" value={resolved.playerOfMatch?.name ?? 'Not chosen yet'} />
      <Row
        label="Best Batter"
        value={resolved.bestBatter ? `${resolved.bestBatter.performance.name} · ${battingFigure(resolved.bestBatter.performance)}` : 'None (no runs scored)'}
        note={resolved.bestBatter ? tag(resolved.bestBatter.automatic) : undefined}
      />
      <Row
        label="Best Bowler"
        value={resolved.bestBowler ? `${resolved.bestBowler.performance.name} · ${bowlingFigure(resolved.bestBowler.performance)}` : 'None'}
        note={resolved.bestBowler ? tag(resolved.bestBowler.automatic) : undefined}
      />
      <Text style={styles.help}>
        Automatic awards use this app’s own published rules (most runs, then fewest balls…; most wickets, then lowest
        economy…). They are not an official cricket formula.
      </Text>
      <Button
        title="Edit awards"
        variant="secondary"
        onPress={() => {
          setError(null);
          setEditing(awards);
        }}
      />
    </View>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  heading: { fontSize: font.title, fontWeight: '700', color: colors.text },
  sub: { fontSize: font.large, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  help: { fontSize: font.small, color: colors.textMuted },
  row: { gap: 2, paddingVertical: spacing.xs },
  label: { fontSize: font.small, fontWeight: '800', color: colors.primary },
  value: { fontSize: font.large, fontWeight: '700', color: colors.text },
  note: { fontSize: font.small, color: colors.textMuted },
});
