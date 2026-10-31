// New match wizard: format -> lineup 1 -> lineup 2 -> toss -> openers -> start.
// The match is not saved until "Start match"; then the match and its first event are saved
// together. Teams and players can be created on the spot (they are saved straight away), and
// a lineup can name fewer players than the team size: the rest join while scoring.
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { Chips } from '../../components/Chips';
import { NewPlayerField } from '../../components/NewPlayerField';
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
import { MATCH_FORMATS, VENUE_MAX_LENGTH } from '../../domain/schedule';
import { openSlots } from '../../domain/scoring';
import { firstBattingTeamIndex, validateMatchSetup } from '../../domain/setupValidation';
import { useFocusLoad } from '../../hooks/useFocusLoad';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { colors, font, spacing } from '../../theme/theme';
import { errorMessage } from '../../utils/errors';
import { parseWhole } from '../../utils/numbers';

const STEP_TITLES = ['Format', 'Lineup', 'Lineup', 'Toss', 'Openers'];

interface TeamOption {
  id: string;
  name: string;
  /** Active players on the roster. */
  players: { playerId: string; name: string }[];
  captainId: string | null;
  viceCaptainId: string | null;
}

/** Captain/vice-captain choices for one lineup step. */
interface Leaders {
  captainId: string | null;
  viceCaptainId: string | null;
}

const sizeOptions = Array.from({ length: MAX_PLAYERS_PER_SIDE - MIN_PLAYERS_PER_SIDE + 1 }, (_, i) => ({
  value: i + MIN_PLAYERS_PER_SIDE,
  label: String(i + MIN_PLAYERS_PER_SIDE),
}));

export default function NewMatchScreen() {
  const { scheduleId } = useLocalSearchParams<{ scheduleId?: string }>();
  const { teams, players, schedules } = useRepositories();
  const service = useMatchService();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { run, pending } = useGuardedAction();

  const scheduleLoad = useFocusLoad(async () => (scheduleId ? schedules.get(scheduleId) : null), [schedules, scheduleId]);
  const schedule = scheduleLoad.data;

  const { data, error, reload } = useFocusLoad(async () => {
    const [teamList, activePlayers] = await Promise.all([teams.list(), players.list()]);
    const names = new Map(activePlayers.map((p) => [p.id, p.name]));
    const options: TeamOption[] = [];
    for (const t of teamList) {
      const full = await teams.get(t.id);
      const roster = (full?.playerIds ?? [])
        .filter((id) => names.has(id))
        .map((id) => ({ playerId: id, name: names.get(id)! }));
      options.push({
        id: t.id,
        name: t.name,
        players: roster,
        captainId: full?.captainId ?? null,
        viceCaptainId: full?.viceCaptainId ?? null,
      });
    }
    return options;
  }, [teams, players]);

  const [step, setStep] = useState(0);
  const [teamAId, setTeamAId] = useState<string | null>(null);
  const [teamBId, setTeamBId] = useState<string | null>(null);
  const [playersPerSide, setPlayersPerSide] = useState(11);
  /** Team 2's lineup size when the teams have different numbers of players. */
  const [unequal, setUnequal] = useState(false);
  const [playersB, setPlayersB] = useState(11);
  const [oversText, setOversText] = useState('20');
  const [freeHit, setFreeHit] = useState(true);
  const [maxOversText, setMaxOversText] = useState('');
  const [lineupA, setLineupA] = useState<string[]>([]);
  const [lineupB, setLineupB] = useState<string[]>([]);
  const [subsA, setSubsA] = useState<string[]>([]);
  const [subsB, setSubsB] = useState<string[]>([]);
  const [leadersA, setLeadersA] = useState<Leaders>({ captainId: null, viceCaptainId: null });
  const [leadersB, setLeadersB] = useState<Leaders>({ captainId: null, viceCaptainId: null });
  const [tossWinner, setTossWinner] = useState<string | null>(null);
  const [decision, setDecision] = useState<TossDecision | null>(null);
  const [openers, setOpeners] = useState<Openers>({ strikerId: null, nonStrikerId: null, bowlerId: null });
  const [stepError, setStepError] = useState<string | null>(null);
  const [venue, setVenue] = useState('');
  const [formatName, setFormatName] = useState('Custom');
  const [prefilled, setPrefilled] = useState(false);

  // Starting a scheduled match: copy its teams and settings in once (adjusting state during render).
  if (schedule && !prefilled) {
    setTeamAId(schedule.teamAId);
    setTeamBId(schedule.teamBId);
    setOversText(String(schedule.oversPerInnings));
    setPlayersPerSide(schedule.playersPerSide);
    setVenue(schedule.venue);
    setFormatName(schedule.formatName);
    setPrefilled(true);
  }
  const fromSchedule = !!scheduleId;

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
  const sizeA = playersPerSide;
  const sizeB = unequal ? playersB : playersPerSide;

  const setup: MatchSetup | null = useMemo(() => {
    if (!teamA || !teamB || !tossWinner || !decision) return null;
    const pick = (team: TeamOption, size: number, ids: string[], subIds: string[], leaders: Leaders): TeamLineup => {
      const toPlayers = (list: string[]) => list.map((id) => team.players.find((p) => p.playerId === id)!).filter(Boolean);
      const lineup: TeamLineup = { teamId: team.id, name: team.name, size, players: toPlayers(ids) };
      const subs = toPlayers(subIds.filter((id) => !ids.includes(id)));
      if (subs.length) lineup.substitutes = subs;
      // Captain and vice-captain only count when they are in the playing lineup.
      if (leaders.captainId && ids.includes(leaders.captainId)) lineup.captainId = leaders.captainId;
      if (leaders.viceCaptainId && ids.includes(leaders.viceCaptainId)) lineup.viceCaptainId = leaders.viceCaptainId;
      return lineup;
    };
    return {
      rules: {
        oversPerInnings: parseWhole(oversText) ?? 0,
        freeHitAfterNoBall: freeHit,
        maxOversPerBowler: maxOversText.trim() === '' ? null : (parseWhole(maxOversText) ?? 0),
      },
      teams: [pick(teamA, sizeA, lineupA, subsA, leadersA), pick(teamB, sizeB, lineupB, subsB, leadersB)],
      toss: { winnerTeamId: tossWinner, decision },
    };
  }, [teamA, teamB, sizeA, sizeB, tossWinner, decision, oversText, freeHit, maxOversText, lineupA, lineupB, subsA, subsB, leadersA, leadersB]);

  /** Creates a team on the spot and picks it as Team 1, or Team 2 when Team 1 is chosen. */
  const createTeam = async (name: string): Promise<string | null> => {
    try {
      const team = await teams.create(name, []);
      await reload();
      if (!teamAId) setTeamAId(team.id);
      else if (!teamBId) setTeamBId(team.id);
      setStepError(null);
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  };

  /** Creates a player on the team's roster on the spot; resolves to the player or an error. */
  const createPlayer = async (teamId: string, name: string) => {
    try {
      const p = await players.create(name);
      await teams.addToRoster(teamId, p.id);
      await reload();
      return { ok: true as const, player: { playerId: p.id, name: p.name } };
    } catch (e) {
      return { ok: false as const, error: errorMessage(e) };
    }
  };

  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data || (fromSchedule && !prefilled && scheduleLoad.loading)) return <LoadingView />;
  if (fromSchedule && !prefilled) {
    return <ErrorView title="Not found" message={scheduleLoad.error ?? 'This scheduled match no longer exists.'} onRetry={scheduleLoad.reload} />;
  }
  if (fromSchedule && schedule && schedule.status !== 'scheduled') {
    return (
      <View style={styles.center}>
        <EmptyState
          title={schedule.status === 'started' ? 'Already started' : 'Match cancelled'}
          message={
            schedule.status === 'started'
              ? 'Scoring has already started for this scheduled match, so it cannot be started again.'
              : 'This scheduled match was cancelled. Restore it before starting it.'
          }
        />
        <View style={styles.padded}>
          {schedule.matchId ? (
            <Button title="Open the match" onPress={() => router.replace(`/match/${schedule.matchId}/score`)} />
          ) : (
            <Button title="Back" onPress={() => router.back()} />
          )}
        </View>
      </View>
    );
  }
  function validateStep(): string | null {
    switch (step) {
      case 0: {
        if (!teamA || !teamB) return data && data.length < 2 ? 'Create the teams that are playing (type a name above).' : 'Choose both teams.';
        if (teamA.id === teamB.id) return 'Choose two different teams.';
        const overs = parseWhole(oversText);
        if (overs === null || overs < 1 || overs > MAX_OVERS_PER_INNINGS) {
          return `Overs per innings must be a whole number from 1 to ${MAX_OVERS_PER_INNINGS}.`;
        }
        if (maxOversText.trim() !== '' && !(parseWhole(maxOversText)! > 0)) {
          return 'Maximum overs per bowler must be a whole number above 0, or left blank for no limit.';
        }
        return null;
      }
      // A lineup may name anyone from none to the whole team: the rest join while scoring.
      case 1:
        return lineupA.length <= sizeA ? null : `Choose at most ${sizeA} players for ${teamA?.name}.`;
      case 2:
        return lineupB.length <= sizeB ? null : `Choose at most ${sizeB} players for ${teamB?.name}.`;
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
      const fits = (team: TeamOption) => (id: string) => team.players.some((p) => p.playerId === id);
      setLineupA((ids) => ids.filter(fits(teamA!)).slice(0, sizeA));
      setLineupB((ids) => ids.filter(fits(teamB!)).slice(0, sizeB));
      setSubsA((ids) => ids.filter(fits(teamA!)));
      setSubsB((ids) => ids.filter(fits(teamB!)));
      // Start from each team's own captain and vice-captain.
      setLeadersA({ captainId: teamA!.captainId, viceCaptainId: teamA!.viceCaptainId });
      setLeadersB({ captainId: teamB!.captainId, viceCaptainId: teamB!.viceCaptainId });
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
      if (!setup || !teamA || !teamB) return;
      if (!openers.strikerId || !openers.nonStrikerId || !openers.bowlerId) {
        setStepError('Choose the striker, the non-striker and the opening bowler.');
        return;
      }
      // Openers chosen from outside a lineup join it.
      const options = [teamA, teamB];
      const withOpeners = (index: number, ids: string[]): TeamLineup => {
        const lineup = setup.teams[index];
        const joining = ids.filter((id) => !lineup.players.some((p) => p.playerId === id));
        const found = joining.map((id) => options[index].players.find((p) => p.playerId === id)).filter((p) => !!p);
        return { ...lineup, players: [...lineup.players, ...found] };
      };
      const teamsWithOpeners: [TeamLineup, TeamLineup] =
        battingIdx === 0
          ? [withOpeners(0, [openers.strikerId, openers.nonStrikerId]), withOpeners(1, [openers.bowlerId])]
          : [withOpeners(0, [openers.bowlerId]), withOpeners(1, [openers.strikerId, openers.nonStrikerId])];
      try {
        const id = await service.startMatch(
          { ...setup, teams: teamsWithOpeners },
          { strikerId: openers.strikerId, nonStrikerId: openers.nonStrikerId, bowlerId: openers.bowlerId },
          { details: { venue, formatName }, scheduleId },
        );
        router.replace(`/match/${id}/score`);
      } catch (e) {
        setStepError(errorMessage(e)); // nothing was saved; the user can fix and retry
      }
    });

  const toggleIn = (list: string[], setList: (l: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  interface LineupSide {
    team: TeamOption;
    /** Players this team fields. */
    size: number;
    list: string[];
    setList: (l: string[]) => void;
    subs: string[];
    setSubs: (l: string[]) => void;
    leaders: Leaders;
    setLeaders: (l: Leaders) => void;
  }

  const lineupStep = (side: LineupSide, other: { name: string; list: string[]; subs: string[] }) => {
    const { team, size, list, setList, subs, setSubs, leaders, setLeaders } = side;
    const elsewhere = (id: string) =>
      other.list.includes(id) ? `Playing for ${other.name}` : other.subs.includes(id) ? `Substitute for ${other.name}` : null;
    const benchable = team.players.filter((p) => !list.includes(p.playerId));
    const inLineup = team.players.filter((p) => list.includes(p.playerId));
    const leaderChips = (otherId: string | null) => [
      { value: '', label: 'None' },
      ...inLineup.map((p) => ({ value: p.playerId, label: p.name, disabled: p.playerId === otherId })),
    ];
    const selectable = team.players.filter((p) => !elsewhere(p.playerId)).map((p) => p.playerId);
    return (
      <>
        <Text style={styles.lead}>
          Choose up to {size} players for {team.name}. {list.length} of {size} selected.
        </Text>
        <Text style={styles.help}>
          You can leave places empty, or skip this step: players can be added while scoring, when they bat, bowl or field.
        </Text>
        {selectable.length <= size && list.length < selectable.length ? (
          <Button title="Select all" variant="secondary" onPress={() => setList(selectable)} />
        ) : null}
        {list.length < size ? (
          <NewPlayerField
            placeholder={`New ${team.name} player's name`}
            disabled={pending}
            onAdd={async (name) => {
              const r = await createPlayer(team.id, name);
              if (!r.ok) return r.error;
              setList([...list, r.player.playerId]);
              return null;
            }}
          />
        ) : null}
        <PlayerPicker
          multiple
          players={team.players.map((p) => ({
            ...p,
            disabledReason:
              elsewhere(p.playerId) ?? (!list.includes(p.playerId) && list.length >= size ? 'Lineup is full' : null),
          }))}
          selectedIds={list}
          onToggle={(id) => {
            toggleIn(list, setList, id);
            if (subs.includes(id)) setSubs(subs.filter((x) => x !== id)); // never both playing and substitute
          }}
        />

        {inLineup.length ? (
          <>
            <Text style={styles.heading}>Captain</Text>
            <Chips
              options={leaderChips(leaders.viceCaptainId)}
              value={leaders.captainId && list.includes(leaders.captainId) ? leaders.captainId : ''}
              onChange={(v) => setLeaders({ ...leaders, captainId: v || null })}
            />
            <Text style={styles.heading}>Vice-captain</Text>
            <Chips
              options={leaderChips(leaders.captainId)}
              value={leaders.viceCaptainId && list.includes(leaders.viceCaptainId) ? leaders.viceCaptainId : ''}
              onChange={(v) => setLeaders({ ...leaders, viceCaptainId: v || null })}
            />
          </>
        ) : null}

        {list.length === size && benchable.length ? (
          <>
            <Text style={styles.heading}>Substitutes (optional)</Text>
            <Text style={styles.help}>
              Substitutes are listed on the scorecard only. They cannot bat, bowl or be recorded as fielders in this version.
            </Text>
            <PlayerPicker
              multiple
              players={benchable.map((p) => ({ ...p, disabledReason: elsewhere(p.playerId) }))}
              selectedIds={subs}
              onToggle={(id) => toggleIn(subs, setSubs, id)}
            />
          </>
        ) : null}
      </>
    );
  };

  const battingIdx = setup ? firstBattingTeamIndex(setup) : 0;
  /** Roster players not named in either lineup (or as a substitute): they can still join one. */
  const outsiders = (team: TeamOption) => {
    const named = new Set([...lineupA, ...lineupB, ...subsA, ...subsB]);
    return team.players.filter((p) => !named.has(p.playerId));
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: `New match · ${step + 1}/5 ${STEP_TITLES[step]}` }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <>
            {fromSchedule ? <Text style={styles.help}>Teams come from the scheduled match.</Text> : null}
            <Text style={styles.heading}>Team 1</Text>
            {data.length ? (
              <Chips
                options={data.map((t) => ({ value: t.id, label: t.name, disabled: fromSchedule || t.id === teamBId }))}
                value={teamAId}
                onChange={setTeamAId}
              />
            ) : (
              <Text style={styles.help}>No teams yet.</Text>
            )}
            <Text style={styles.heading}>Team 2</Text>
            {data.length ? (
              <Chips
                options={data.map((t) => ({ value: t.id, label: t.name, disabled: fromSchedule || t.id === teamAId }))}
                value={teamBId}
                onChange={setTeamBId}
              />
            ) : (
              <Text style={styles.help}>No teams yet.</Text>
            )}
            {!fromSchedule ? (
              <>
                <Text style={styles.help}>
                  {teamAId && teamBId
                    ? 'Playing someone new? Create their team here.'
                    : 'Team not listed? Type its name to create it: it is picked straight away, and players can be added later.'}
                </Text>
                <NewPlayerField placeholder="New team name" disabled={pending} onAdd={createTeam} />
              </>
            ) : null}
            <TextField label="Venue (optional)" value={venue} onChangeText={setVenue} maxLength={VENUE_MAX_LENGTH} placeholder="e.g. Eastfield Park" />
            <Text style={styles.heading}>Format</Text>
            <Chips
              options={MATCH_FORMATS.map((f) => ({ value: f.name, label: f.overs ? `${f.name} (${f.overs})` : f.name }))}
              value={MATCH_FORMATS.some((f) => f.name === formatName) ? formatName : 'Custom'}
              onChange={(name) => {
                setFormatName(name);
                const f = MATCH_FORMATS.find((x) => x.name === name);
                if (f?.overs) setOversText(String(f.overs));
              }}
            />
            <Text style={styles.heading}>{unequal ? `Players for ${teamA?.name ?? 'Team 1'}` : 'Players per side'}</Text>
            <Chips options={sizeOptions} value={playersPerSide} onChange={setPlayersPerSide} />
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.heading}>Teams have different numbers of players</Text>
                <Text style={styles.help}>For example 11 v 10 when a player is missing.</Text>
              </View>
              <Switch
                value={unequal}
                onValueChange={(on) => {
                  setUnequal(on);
                  if (on) setPlayersB(playersPerSide);
                }}
                trackColor={{ true: colors.primary, false: colors.border }}
                accessibilityLabel="Teams have different numbers of players"
              />
            </View>
            {unequal ? (
              <>
                <Text style={styles.heading}>Players for {teamB?.name ?? 'Team 2'}</Text>
                <Chips options={sizeOptions} value={playersB} onChange={setPlayersB} />
              </>
            ) : null}
            <Text style={styles.help}>
              A side is all out when only one of its batters is left. The players do not all need names now: add them
              while scoring.
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

        {step === 1 && teamA
          ? lineupStep(
              { team: teamA, size: sizeA, list: lineupA, setList: setLineupA, subs: subsA, setSubs: setSubsA, leaders: leadersA, setLeaders: setLeadersA },
              { name: teamB?.name ?? '', list: lineupB, subs: subsB },
            )
          : null}
        {step === 2 && teamB
          ? lineupStep(
              { team: teamB, size: sizeB, list: lineupB, setList: setLineupB, subs: subsB, setSubs: setSubsB, leaders: leadersB, setLeaders: setLeadersB },
              { name: teamA?.name ?? '', list: lineupA, subs: subsA },
            )
          : null}

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

        {step === 4 && setup && teamA && teamB ? (
          <OpenersPicker
            batting={setup.teams[battingIdx]}
            bowling={setup.teams[1 - battingIdx]}
            value={openers}
            onChange={(v) => {
              setOpeners(v);
              setStepError(null);
            }}
            joiners={{
              batting: outsiders([teamA, teamB][battingIdx]),
              bowling: outsiders([teamA, teamB][1 - battingIdx]),
              battingSlots: openSlots(setup.teams[battingIdx]),
              bowlingSlots: openSlots(setup.teams[1 - battingIdx]),
            }}
            onCreatePlayer={(side, name) => createPlayer(setup.teams[side === 'batting' ? battingIdx : 1 - battingIdx].teamId, name)}
            disabled={pending}
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
