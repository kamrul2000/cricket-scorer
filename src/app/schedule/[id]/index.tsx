// Create (id = "new") or edit an upcoming match; start scoring it, make a poster, or cancel it.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/Button';
import { Chips } from '../../../components/Chips';
import { DateTimeField } from '../../../components/DateTimeField';
import { EmptyState, ErrorBanner, ErrorView, LoadingView } from '../../../components/StateViews';
import { TextField } from '../../../components/TextField';
import { useRepositories } from '../../../data/AppDataProvider';
import { MAX_PLAYERS_PER_SIDE, MIN_PLAYERS_PER_SIDE } from '../../../domain/match';
import { MATCH_FORMATS, validateSchedule, VENUE_MAX_LENGTH, type ScheduleInput } from '../../../domain/schedule';
import { useFocusLoad } from '../../../hooks/useFocusLoad';
import { useGuardedAction } from '../../../hooks/useGuardedAction';
import { colors, font, radius, spacing } from '../../../theme/theme';
import { errorMessage } from '../../../utils/errors';

/** Tomorrow at 10:00 local time. */
function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

export default function ScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { teams, schedules } = useRepositories();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { run, pending } = useGuardedAction();

  const { data, error, reload } = useFocusLoad(async () => {
    const [teamList, schedule] = await Promise.all([teams.list(), isNew ? null : schedules.get(id)]);
    return { teamList, schedule };
  }, [teams, schedules, id, isNew]);

  const [teamAId, setTeamAId] = useState<string | null>(null);
  const [teamBId, setTeamBId] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState(defaultStart);
  const [venue, setVenue] = useState('');
  const [formatName, setFormatName] = useState<string>('T20');
  const [oversText, setOversText] = useState('20');
  const [playersPerSide, setPlayersPerSide] = useState(11);
  const [formError, setFormError] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  // Fill the form once when the schedule first loads (adjusting state during render).
  if (data && !initialised) {
    const s = data.schedule;
    if (s) {
      setTeamAId(s.teamAId);
      setTeamBId(s.teamBId);
      setScheduledAt(s.scheduledAt);
      setVenue(s.venue);
      setFormatName(s.formatName);
      setOversText(String(s.oversPerInnings));
      setPlayersPerSide(s.playersPerSide);
    }
    setInitialised(true);
  }

  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data || !initialised) return <LoadingView />;
  const { teamList, schedule } = data;
  if (!isNew && !schedule) return <ErrorView title="Not found" message="This scheduled match no longer exists." />;
  if (isNew && teamList.length < 2) {
    return <EmptyState title="You need two teams" message="Create at least two teams on the Teams tab before scheduling a match." />;
  }

  const status = schedule?.status ?? 'scheduled';
  const editable = status === 'scheduled';
  // Only active teams can be scheduled (the repository checks this too).
  const teamOptions = teamList.map((t) => ({ value: t.id, label: t.name }));
  const preset = MATCH_FORMATS.find((f) => f.name === formatName);

  const input = (): ScheduleInput => ({
    teamAId: teamAId ?? '',
    teamBId: teamBId ?? '',
    scheduledAt,
    venue,
    formatName,
    oversPerInnings: /^\d+$/.test(oversText.trim()) ? Number(oversText.trim()) : NaN,
    playersPerSide,
  });

  const save = () =>
    run(async () => {
      const { errors } = validateSchedule(input());
      if (errors.length) {
        setFormError(errors[0]);
        return;
      }
      try {
        if (isNew) await schedules.create(input());
        else await schedules.update(id, input());
        router.back();
      } catch (e) {
        setFormError(errorMessage(e));
      }
    });

  const setCancelled = (cancelled: boolean) =>
    run(async () => {
      try {
        await schedules.setCancelled(id, cancelled);
        setFormError(null);
        await reload();
      } catch (e) {
        setFormError(errorMessage(e));
      }
    });

  const confirmCancel = () =>
    Alert.alert('Cancel this match?', 'It stays in the list as cancelled, and you can restore it later.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel match', style: 'destructive', onPress: () => void setCancelled(true) },
    ]);

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Schedule a match' : 'Upcoming match' }} />
      {formError ? <ErrorBanner message={formError} /> : null}
      {status === 'cancelled' ? <Text style={styles.note}>This match is cancelled. Restore it to edit or start it.</Text> : null}
      {status === 'started' ? <Text style={styles.note}>Scoring has started for this match.</Text> : null}

      <Text style={styles.heading}>Team 1</Text>
      <Chips options={teamOptions.map((o) => ({ ...o, disabled: !editable || o.value === teamBId }))} value={teamAId} onChange={setTeamAId} />
      <Text style={styles.heading}>Team 2</Text>
      <Chips options={teamOptions.map((o) => ({ ...o, disabled: !editable || o.value === teamAId }))} value={teamBId} onChange={setTeamBId} />

      <DateTimeField label="Date and time" value={scheduledAt} onChange={setScheduledAt} disabled={!editable} />
      <TextField label="Venue" value={venue} onChangeText={setVenue} maxLength={VENUE_MAX_LENGTH} editable={editable} placeholder="e.g. Eastfield Park" />

      <Text style={styles.heading}>Format</Text>
      <Chips
        options={MATCH_FORMATS.map((f) => ({ value: f.name, label: f.overs ? `${f.name} (${f.overs})` : f.name, disabled: !editable }))}
        value={preset ? formatName : 'Custom'}
        onChange={(name) => {
          setFormatName(name);
          const f = MATCH_FORMATS.find((x) => x.name === name);
          if (f?.overs) setOversText(String(f.overs));
        }}
      />
      <TextField
        label="Overs per innings"
        value={oversText}
        onChangeText={setOversText}
        keyboardType="number-pad"
        maxLength={3}
        editable={editable && (!preset || preset.overs === null)}
      />
      <Text style={styles.heading}>Players per side</Text>
      <Chips
        options={Array.from({ length: MAX_PLAYERS_PER_SIDE - MIN_PLAYERS_PER_SIDE + 1 }, (_, i) => ({
          value: i + MIN_PLAYERS_PER_SIDE,
          label: String(i + MIN_PLAYERS_PER_SIDE),
          disabled: !editable,
        }))}
        value={playersPerSide}
        onChange={setPlayersPerSide}
      />

      {editable ? <Button title={isNew ? 'Save upcoming match' : 'Save changes'} onPress={save} loading={pending} /> : null}

      {!isNew && schedule ? (
        <View style={styles.actions}>
          {status === 'scheduled' ? (
            <>
              <Button title="Start scoring" onPress={() => router.push(`/match/new?scheduleId=${id}`)} disabled={pending} />
              <Button title="Match poster" variant="secondary" onPress={() => router.push(`/schedule/${id}/poster`)} disabled={pending} />
              <Button title="Cancel match" variant="danger" onPress={confirmCancel} disabled={pending} />
            </>
          ) : null}
          {status === 'cancelled' ? <Button title="Restore match" onPress={() => void setCancelled(false)} loading={pending} /> : null}
          {status === 'started' && schedule.matchId ? (
            <Button title="Open the match" onPress={() => router.push(`/match/${schedule.matchId}`)} />
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  heading: { fontSize: font.large, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  note: { fontSize: font.body, color: colors.text, backgroundColor: colors.warningBg, padding: spacing.md, borderRadius: radius.sm },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
