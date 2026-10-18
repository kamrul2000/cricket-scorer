// New match wizard: format -> lineup 1 -> lineup 2 -> toss -> openers -> start.
// Nothing is saved until "Start match"; then the match and its first event are saved together.
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { Chips } from '../../components/Chips';
import { OpenersPicker, type Openers } from '../../components/OpenersPicker';
import { PlayerPicker } from '../../components/PlayerPicker';
import { EmptyState, ErrorBanner, ErrorView, LoadingView } from '../../components/StateViews';
import { TextField } from '../../components/TextField';
import { useMatchService, useRepositories } from '../../data/AppDataProvider';
import {
  MAX_OVERS_PER_INNINGS,
  MAX_PLAYERS_PER_SIDE,
  MIN_PLAYERS_PER_SIDE,
  type MatchSetup,
  type TeamLineup,
  type TossDecision,
} from '../../domain/match';
import { firstBattingTeamIndex, validateMatchSetup } from '../../domain/setupValidation';
import { useFocusLoad } from '../../hooks/useFocusLoad';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { colors, font, spacing } from '../../theme/theme';
import { errorMessage } from '../../utils/errors';

const STEP_TITLES = ['Format', 'Lineup', 'Lineup', 'Toss', 'Openers'];

interface TeamOption {
  id: string;
  name: string;
  /** Active players on the roster. */
  players: { playerId: string; name: string }[];
}

function parseWhole(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

export default function NewMatchScreen() {
  const { teams, players } = useRepositories();
  const service = useMatchService();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { run, pending } = useGuardedAction();

  const { data, error, reload } = useFocusLoad(async () => {
    const [teamList, activePlayers] = await Promise.all([teams.list(), players.list()]);
    const names = new Map(activePlayers.map((p) => [p.id, p.name]));
    const options: TeamOption[] = [];
    for (const t of teamList) {
      const full = await teams.get(t.id);
      const roster = (full?.playerIds ?? [])
        .filter((id) => names.has(id))
        .map((id) => ({ playerId: id, name: names.get(id)! }));
      options.push({ id: t.id, name: t.name, players: roster });
    }
    return options;
  }, [teams, players]);

  const [step, setStep] = useState(0);
  const [teamAId, setTeamAId] = useState<string | null>(null);
  const [teamBId, setTeamBId] = useState<string | null>(null);
  const [playersPerSide, setPlayersPerSide] = useState(11);
  const [oversText, setOversText] = useState('20');
  const [freeHit, setFreeHit] = useState(true);
  const [maxOversText, setMaxOversText] = useState('');
  const [lineupA, setLineupA] = useState<string[]>([]);
  const [lineupB, setLineupB] = useState<string[]>([]);
  const [tossWinner, setTossWinner] = useState<string | null>(null);
  const [decision, setDecision] = useState<TossDecision | null>(null);
  const [openers, setOpeners] = useState<Openers>({ strikerId: null, nonStrikerId: null, bowlerId: null });
  const [stepError, setStepError] = useState<string | null>(null);

  // Android back button goes to the previous step instead of leaving the wizard.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (step === 0) return false;
        setStepError(null);
        setStep((s) => s - 1);
        return true;
      });
      return () => sub.remove();
    }, [step]),
  );

  const teamA = data?.find((t) => t.id === teamAId) ?? null;
  const teamB = data?.find((t) => t.id === teamBId) ?? null;

  const setup: MatchSetup | null = useMemo(() => {
    if (!teamA || !teamB || !tossWinner || !decision) return null;
    const pick = (team: TeamOption, ids: string[]): TeamLineup => ({
      teamId: team.id,
      name: team.name,
      players: ids.map((id) => team.players.find((p) => p.playerId === id)!).filter(Boolean),
    });
    return {
      rules: {
        oversPerInnings: parseWhole(oversText) ?? 0,
        playersPerSide,
        freeHitAfterNoBall: freeHit,
        maxOversPerBowler: maxOversText.trim() === '' ? null : (parseWhole(maxOversText) ?? 0),
      },
      teams: [pick(teamA, lineupA), pick(teamB, lineupB)],
      toss: { winnerTeamId: tossWinner, decision },
    };
  }, [teamA, teamB, tossWinner, decision, oversText, playersPerSide, freeHit, maxOversText, lineupA, lineupB]);

  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return <LoadingView />;
  if (data.length < 2) {
    return (
      <View style={styles.center}>
        <EmptyState
          title="You need two teams"
          message="Create at least two teams, each with enough players, before starting a match."
        />
        <View style={styles.padded}>
          <Button title="Go to Teams" onPress={() => router.replace('/teams')} />
        </View>
      </View>
    );
  }

  function validateStep(): string | null {
    switch (step) {
      case 0: {
        if (!teamA || !teamB) return 'Choose both teams.';
        if (teamA.id === teamB.id) return 'Choose two different teams.';
        const overs = parseWhole(oversText);
        if (overs === null || overs < 1 || overs > MAX_OVERS_PER_INNINGS) {
          return `Overs per innings must be a whole number from 1 to ${MAX_OVERS_PER_INNINGS}.`;
        }
        if (maxOversText.trim() !== '' && !(parseWhole(maxOversText)! > 0)) {
          return 'Maximum overs per bowler must be a whole number above 0, or left blank for no limit.';
        }
        for (const t of [teamA, teamB]) {
          if (t.players.length < playersPerSide) {
            return `${t.name} has only ${t.players.length} active players. Add players to the team or lower players per side.`;
          }
        }
        return null;
      }
      case 1:
        return lineupA.length === playersPerSide ? null : `Choose exactly ${playersPerSide} players for ${teamA?.name}.`;
      case 2:
        return lineupB.length === playersPerSide ? null : `Choose exactly ${playersPerSide} players for ${teamB?.name}.`;
      case 3: {
        if (!tossWinner || !decision) return 'Record who won the toss and what they chose.';
        if (!setup) return 'Setup is incomplete.';
        const errs = validateMatchSetup(setup);
        return errs.length ? errs[0] : null;
      }
      default:
        return null;
    }
  }

  const next = () => {
    const problem = validateStep();
    setStepError(problem);
    if (problem) return;
    if (step === 0) {
      // Drop lineup picks that no longer fit the chosen teams or size.
      setLineupA((ids) => ids.filter((id) => teamA!.players.some((p) => p.playerId === id)).slice(0, playersPerSide));
      setLineupB((ids) => ids.filter((id) => teamB!.players.some((p) => p.playerId === id)).slice(0, playersPerSide));
    }
    if (step === 3) setOpeners({ strikerId: null, nonStrikerId: null, bowlerId: null });
    setStep(step + 1);
  };

  const back = () => {
    setStepError(null);
    setStep(step - 1);
  };

  const start = () =>
    run(async () => {
      if (!setup) return;
      if (!openers.strikerId || !openers.nonStrikerId || !openers.bowlerId) {
        setStepError('Choose the striker, the non-striker and the opening bowler.');
        return;
      }
      try {
        const id = await service.startMatch(setup, {
          strikerId: openers.strikerId,
          nonStrikerId: openers.nonStrikerId,
          bowlerId: openers.bowlerId,
        });
        router.replace(`/match/${id}/score`);
      } catch (e) {
        setStepError(errorMessage(e)); // nothing was saved; the user can fix and retry
      }
    });

  const toggleIn = (list: string[], setList: (l: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const lineupStep = (team: TeamOption, list: string[], setList: (l: string[]) => void, otherList: string[], otherName: string) => (
    <>
      <Text style={styles.lead}>
        Choose {playersPerSide} players for {team.name}. {list.length} of {playersPerSide} selected.
      </Text>
      {team.players.length === playersPerSide && list.length !== playersPerSide ? (
        <Button title="Select all" variant="secondary" onPress={() => setList(team.players.map((p) => p.playerId).filter((id) => !otherList.includes(id)))} />
      ) : null}
      <PlayerPicker
        multiple
        players={team.players.map((p) => ({
          ...p,
          disabledReason: otherList.includes(p.playerId)
            ? `Playing for ${otherName}`
            : !list.includes(p.playerId) && list.length >= playersPerSide
              ? 'Lineup is full'
              : null,
        }))}
        selectedIds={list}
        onToggle={(id) => toggleIn(list, setList, id)}
      />
    </>
  );

  const battingIdx = setup ? firstBattingTeamIndex(setup) : 0;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: `New match · ${step + 1}/5 ${STEP_TITLES[step]}` }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <>
            <Text style={styles.heading}>Team 1</Text>
            <Chips
              options={data.map((t) => ({ value: t.id, label: t.name, disabled: t.id === teamBId }))}
              value={teamAId}
              onChange={setTeamAId}
            />
            <Text style={styles.heading}>Team 2</Text>
            <Chips
              options={data.map((t) => ({ value: t.id, label: t.name, disabled: t.id === teamAId }))}
              value={teamBId}
              onChange={setTeamBId}
            />
            <Text style={styles.heading}>Players per side</Text>
            <Chips
              options={Array.from({ length: MAX_PLAYERS_PER_SIDE - MIN_PLAYERS_PER_SIDE + 1 }, (_, i) => {
                const n = i + MIN_PLAYERS_PER_SIDE;
                return { value: n, label: String(n) };
              })}
              value={playersPerSide}
              onChange={setPlayersPerSide}
            />
            <Text style={styles.help}>
              Both teams use the same number. A side is all out when only one batter is left.
            </Text>
            <TextField label="Overs per innings" value={oversText} onChangeText={setOversText} keyboardType="number-pad" maxLength={3} />
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.heading}>Free hit after a no-ball</Text>
                <Text style={styles.help}>A competition rule (ICC limited-overs), not part of the MCC Laws.</Text>
              </View>
              <Switch value={freeHit} onValueChange={setFreeHit} trackColor={{ true: colors.primary, false: colors.border }} accessibilityLabel="Free hit after a no-ball" />
            </View>
            <TextField
              label="Maximum overs per bowler (optional)"
              value={maxOversText}
              onChangeText={setMaxOversText}
              keyboardType="number-pad"
              placeholder="No limit"
              maxLength={3}
            />
          </>
        ) : null}

        {step === 1 && teamA ? lineupStep(teamA, lineupA, setLineupA, lineupB, teamB?.name ?? '') : null}
        {step === 2 && teamB ? lineupStep(teamB, lineupB, setLineupB, lineupA, teamA?.name ?? '') : null}

        {step === 3 && teamA && teamB ? (
          <>
            <Text style={styles.heading}>Who won the toss?</Text>
            <Chips
              options={[
                { value: teamA.id, label: teamA.name },
                { value: teamB.id, label: teamB.name },
              ]}
              value={tossWinner}
              onChange={setTossWinner}
            />
            <Text style={styles.heading}>They chose to</Text>
            <Chips
              options={[
                { value: 'bat', label: 'Bat first' },
                { value: 'bowl', label: 'Bowl first' },
              ]}
              value={decision}
              onChange={(v) => setDecision(v as TossDecision)}
            />
            {setup ? (
              <Text style={styles.lead}>{setup.teams[battingIdx].name} will bat first.</Text>
            ) : null}
          </>
        ) : null}

        {step === 4 && setup ? (
          <OpenersPicker
            batting={setup.teams[battingIdx]}
            bowling={setup.teams[1 - battingIdx]}
            value={openers}
            onChange={(v) => {
              setOpeners(v);
              setStepError(null);
            }}
          />
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}>
        {stepError ? <ErrorBanner message={stepError} /> : null}
        <View style={styles.footerButtons}>
          {step > 0 ? (
            <View style={styles.flex}>
              <Button title="Back" variant="secondary" onPress={back} disabled={pending} />
            </View>
          ) : null}
          <View style={styles.flex}>
            {step < 4 ? (
              <Button title="Next" onPress={next} />
            ) : (
              <Button title="Start match" onPress={start} loading={pending} />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1 },
  padded: { padding: spacing.md },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  heading: { fontSize: font.large, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  lead: { fontSize: font.large, color: colors.text },
  help: { fontSize: font.small, color: colors.textMuted },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.sm },
  switchText: { flex: 1 },
  footer: { padding: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  footerButtons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
