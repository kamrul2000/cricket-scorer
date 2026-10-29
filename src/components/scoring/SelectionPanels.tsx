// Prompts shown instead of the scoring pad when the engine needs a choice first.
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { formatOvers, inningsLabel, resultText, scoreText, superOverName } from '../../domain/format';
import { SUPER_OVER_WICKETS, type MatchEvent } from '../../domain/match';
import {
  availableBatters,
  bowlerOptions,
  canEndInnings,
  canStartSuperOver,
  currentInnings,
  upcomingInnings,
  type MatchState,
} from '../../domain/scoring';
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
    if (!r.ok && r.error) setError(r.error);
  };
  return { error, submit };
}

export function NewBatterPanel({ state, saving, onSubmit }: PanelProps) {
  const inn = currentInnings(state)!;
  const { error, submit } = useSubmitWithError(onSubmit);
  const ids = availableBatters(state);
  const takesStrike = inn.strikerId === null;
  const afterRetirement = inn.vacancyLeftBy !== null;
  const confirmEnd = () =>
    Alert.alert(
      'End the innings?',
      'Use this only when everyone still to bat has retired hurt and cannot resume. The innings ends now. You can undo this.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End innings', style: 'destructive', onPress: () => void submit({ type: 'endInnings' }) },
      ],
    );
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{afterRetirement ? 'Choose the next batter' : 'Wicket! Choose the next batter'}</Text>
      <Text style={styles.help}>
        They come in at the {takesStrike ? "striker's end and face the next ball" : "non-striker's end"}.
      </Text>
      {error ? <ErrorBanner message={error} /> : null}
      <PlayerPicker
        players={ids.map((id) => {
          const resuming = inn.batters.some((b) => b.playerId === id && b.retiredHurt);
          return {
            playerId: id,
            name: inn.battingTeam.players.find((p) => p.playerId === id)!.name,
            disabledReason: saving ? 'Saving…' : null,
            detail: resuming ? 'retired hurt: resumes' : undefined,
          };
        })}
        selectedIds={[]}
        onToggle={(id) => void submit({ type: 'newBatter', playerId: id })}
      />
      {canEndInnings(state) ? (
        <>
          <Text style={styles.help}>Only retired-hurt batters are left. If none of them can bat again, end the innings.</Text>
          <Button title="No one else can bat: end innings" variant="secondary" onPress={confirmEnd} disabled={saving} />
        </>
      ) : null}
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

const END_REASONS = { allOut: 'all out', overs: 'overs complete', targetReached: 'target reached', abandoned: 'abandoned' };

/** Openers for the next innings: the second innings, or either innings of a Super Over. */
export function InningsBreakPanel({ state, saving, onSubmit }: PanelProps) {
  const { error, submit } = useSubmitWithError(onSubmit);
  const [openers, setOpeners] = useState<Openers>({ strikerId: null, nonStrikerId: null, bowlerId: null });
  const upcoming = upcomingInnings(state);
  if (!upcoming) return null;
  const { index, superOver, battingTeam: batting, bowlingTeam: bowling } = upcoming;
  const previous = state.innings[index - 1];
  const chasing = index % 2 === 1;
  const balls = (superOver === null ? state.setup.rules.oversPerInnings : 1) * 6;
  const unavailable = new Map<string, string>([
    ...upcoming.ineligibleBatterIds.map((id): [string, string] => [id, 'Dismissed in an earlier Super Over']),
    ...upcoming.ineligibleBowlerIds.map((id): [string, string] => [id, 'Bowled in the previous Super Over']),
  ]);
  const ready = openers.strikerId && openers.nonStrikerId && openers.bowlerId;
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{superOver === null ? 'Innings break' : superOverName(superOver)}</Text>
      {chasing ? (
        <>
          <Text style={styles.lead}>
            {previous.battingTeam.name} {scoreText(previous)} ({formatOvers(previous.legalBalls)} ov
            {previous.endReason ? `, ${END_REASONS[previous.endReason]}` : ''}).
          </Text>
          <Text style={styles.lead}>
            {batting.name} need {previous.runs + 1} to win from {balls} balls.
          </Text>
        </>
      ) : (
        <Text style={styles.lead}>
          Scores are level. {batting.name} bat first in the {superOverName(superOver ?? 1)}: one over each, and the
          innings ends after {Math.min(SUPER_OVER_WICKETS, batting.players.length - 1)} wickets.
        </Text>
      )}
      <OpenersPicker batting={batting} bowling={bowling} value={openers} onChange={setOpeners} unavailable={unavailable} />
      {error ? <ErrorBanner message={error} /> : null}
      <Button
        title={superOver === null ? 'Start second innings' : `Start ${batting.name} ${superOverName(superOver)} innings`}
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

export function MatchCompletePanel({
  state,
  saving,
  onSubmit,
  onViewScorecard,
}: PanelProps & { onViewScorecard: () => void }) {
  const { error, submit } = useSubmitWithError(onSubmit);
  const superOverPossible = canStartSuperOver(state);
  const next = superOverName(state.innings.length / 2);
  const confirmSuperOver = () =>
    Alert.alert(
      `Play a ${next}?`,
      'Each team bats one over, and an innings ends after two wickets. The team that batted second bats first. The match stays tied if you do not play one. You can undo this.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Play ${next}`, onPress: () => void submit({ type: 'superOver' }) },
      ],
    );
  return (
    <View style={[styles.panel, styles.resultPanel]}>
      <Text style={styles.resultLabel}>MATCH COMPLETE</Text>
      <Text style={styles.result}>{state.result ? resultText(state.setup, state.result) : ''}</Text>
      {state.innings.map((inn) => (
        <Text key={inn.index} style={styles.lead}>
          {inn.superOver !== null ? `${inningsLabel(inn)}: ` : ''}
          {inn.battingTeam.name}: {scoreText(inn)} ({formatOvers(inn.legalBalls)} ov)
        </Text>
      ))}
      {error ? <ErrorBanner message={error} /> : null}
      {superOverPossible ? <Button title={`Play a ${next}`} onPress={confirmSuperOver} loading={saving} /> : null}
      <Button title="View full scorecard" variant={superOverPossible ? 'secondary' : 'primary'} onPress={onViewScorecard} />
      <Text style={styles.help}>Made a mistake? Undo below reopens the match, or tap a ball above to edit it.</Text>
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
