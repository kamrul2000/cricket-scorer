// Prompts shown instead of the scoring pad when the engine needs a choice first.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatOvers, resultText, scoreText } from '../../domain/format';
import type { MatchEvent } from '../../domain/match';
import { availableBatters, bowlerOptions, currentInnings, type MatchState } from '../../domain/scoring';
import { firstBattingTeamIndex } from '../../domain/setupValidation';
import type { SubmitResult } from '../../hooks/useMatchScoring';
import { colors, font, radius, spacing } from '../../theme/theme';
import { Button } from '../Button';
import { OpenersPicker, type Openers } from '../OpenersPicker';
import { PlayerPicker } from '../PlayerPicker';
import { ErrorBanner } from '../StateViews';

interface PanelProps {
  state: MatchState;
  saving: boolean;
  onSubmit: (event: MatchEvent) => Promise<SubmitResult>;
}

function useSubmitWithError(onSubmit: PanelProps['onSubmit']) {
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: MatchEvent) => {
    setError(null);
    const r = await onSubmit(event);
    if (!r.ok && !r.saveFailed) setError(r.error);
  };
  return { error, submit };
}

export function NewBatterPanel({ state, saving, onSubmit }: PanelProps) {
  const inn = currentInnings(state)!;
  const { error, submit } = useSubmitWithError(onSubmit);
  const ids = availableBatters(state);
  const takesStrike = inn.strikerId === null;
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Wicket! Choose the next batter</Text>
      <Text style={styles.help}>
        They come in at the {takesStrike ? "striker's end and face the next ball" : "non-striker's end"}.
      </Text>
      {error ? <ErrorBanner message={error} /> : null}
      <PlayerPicker
        players={ids.map((id) => ({ playerId: id, name: inn.battingTeam.players.find((p) => p.playerId === id)!.name, disabledReason: saving ? 'Saving…' : null }))}
        selectedIds={[]}
        onToggle={(id) => void submit({ type: 'newBatter', playerId: id })}
      />
    </View>
  );
}

export function NewBowlerPanel({ state, saving, onSubmit }: PanelProps) {
  const inn = currentInnings(state)!;
  const { error, submit } = useSubmitWithError(onSubmit);
  const options = bowlerOptions(state);
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Over {Math.floor(inn.legalBalls / 6)} complete. Who bowls next?</Text>
      {error ? <ErrorBanner message={error} /> : null}
      <PlayerPicker
        players={options.map((o) => {
          const b = inn.bowlers.find((x) => x.playerId === o.playerId);
          return {
            playerId: o.playerId,
            name: inn.bowlingTeam.players.find((p) => p.playerId === o.playerId)!.name,
            disabledReason: o.reason ?? (saving ? 'Saving…' : null),
            detail: b ? `${formatOvers(b.legalBalls)}-${b.maidens}-${b.runsConceded}-${b.wickets}` : undefined,
          };
        })}
        selectedIds={[]}
        onToggle={(id) => void submit({ type: 'newBowler', playerId: id })}
      />
    </View>
  );
}

export function InningsBreakPanel({ state, saving, onSubmit }: PanelProps) {
  const first = state.innings[0];
  const { error, submit } = useSubmitWithError(onSubmit);
  const [openers, setOpeners] = useState<Openers>({ strikerId: null, nonStrikerId: null, bowlerId: null });
  const firstIdx = firstBattingTeamIndex(state.setup);
  const batting = state.setup.teams[1 - firstIdx];
  const bowling = state.setup.teams[firstIdx];
  const reason = first.endReason === 'allOut' ? 'all out' : 'overs complete';
  const ready = openers.strikerId && openers.nonStrikerId && openers.bowlerId;
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Innings break</Text>
      <Text style={styles.lead}>
        {first.battingTeam.name} {scoreText(first)} ({formatOvers(first.legalBalls)} ov, {reason}).
      </Text>
      <Text style={styles.lead}>
        {batting.name} need {first.runs + 1} to win from {state.setup.rules.oversPerInnings * 6} balls.
      </Text>
      <OpenersPicker batting={batting} bowling={bowling} value={openers} onChange={setOpeners} />
      {error ? <ErrorBanner message={error} /> : null}
      <Button
        title="Start second innings"
        loading={saving}
        disabled={!ready}
        onPress={() =>
          void submit({
            type: 'inningsStart',
            strikerId: openers.strikerId!,
            nonStrikerId: openers.nonStrikerId!,
            bowlerId: openers.bowlerId!,
          })
        }
      />
    </View>
  );
}

export function MatchCompletePanel({ state, onViewScorecard }: { state: MatchState; onViewScorecard: () => void }) {
  return (
    <View style={[styles.panel, styles.resultPanel]}>
      <Text style={styles.resultLabel}>MATCH COMPLETE</Text>
      <Text style={styles.result}>{state.result ? resultText(state.setup, state.result) : ''}</Text>
      {state.innings.map((inn) => (
        <Text key={inn.index} style={styles.lead}>
          {inn.battingTeam.name}: {scoreText(inn)} ({formatOvers(inn.legalBalls)} ov)
        </Text>
      ))}
      <Button title="View full scorecard" onPress={onViewScorecard} />
      <Text style={styles.help}>Made a mistake? Undo below reopens the match.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text },
  lead: { fontSize: font.large, color: colors.text },
  help: { fontSize: font.small, color: colors.textMuted },
  resultPanel: { borderColor: colors.primary, borderWidth: 2 },
  resultLabel: { fontSize: font.small, fontWeight: '800', color: colors.primary },
  result: { fontSize: font.heading, fontWeight: '800', color: colors.text },
});
