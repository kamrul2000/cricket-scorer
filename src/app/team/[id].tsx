// Create (id = "new") or edit a team: name plus roster checklist.
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { Chips } from '../../components/Chips';
import { ErrorBanner, ErrorView, LoadingView } from '../../components/StateViews';
import { TeamLogo } from '../../components/TeamLogo';
import { TextField } from '../../components/TextField';
import { useRepositories } from '../../data/AppDataProvider';
import { DESCRIPTION_MAX_LENGTH, leadershipError, validateDescription, validateName } from '../../domain/people';
import { deviceLogoFiles, pickAndStoreLogo } from '../../files/logoFiles';
import { removeUnusedLogos } from '../../services/backupService';
import { useFocusLoad } from '../../hooks/useFocusLoad';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { colors, font, MIN_TOUCH, radius, spacing } from '../../theme/theme';
import { errorMessage } from '../../utils/errors';

export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { teams, players } = useRepositories();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { run, pending } = useGuardedAction();

  const { data, error, reload } = useFocusLoad(
    async () => {
      const team = isNew ? null : await teams.get(id);
      const allPlayers = await players.list({ includeArchived: true });
      return { team, allPlayers };
    },
    [teams, players, id, isNew],
  );

  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);
  const [description, setDescription] = useState('');
  const [logoFile, setLogoFile] = useState<string | null>(null);
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [viceCaptainId, setViceCaptainId] = useState<string | null>(null);

  // Fill the form once when data first arrives, so later refreshes never wipe typing.
  // (Adjusting state during render, as React recommends, instead of an effect.)
  if (data && !initialised) {
    if (data.team) {
      setName(data.team.name);
      setSelected(new Set(data.team.playerIds));
      setDescription(data.team.description);
      setLogoFile(data.team.logoFile);
      setCaptainId(data.team.captainId);
      setViceCaptainId(data.team.viceCaptainId);
    }
    setInitialised(true);
  }

  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data || !initialised) return <LoadingView />;
  const { team, allPlayers } = data;
  if (!isNew && !team) return <ErrorView title="Team not found" message="This team no longer exists." />;

  const archived = team?.archivedAt != null;
  const rosterIds = new Set(team?.playerIds ?? []);
  // Show active players, plus archived players who are already on this roster.
  const visible = allPlayers.filter((p) => p.archivedAt === null || rosterIds.has(p.id));

  const toggle = (playerId: string) => {
    if (archived) return;
    if (selected.has(playerId)) {
      // A player leaving the squad cannot stay captain or vice-captain.
      if (captainId === playerId) setCaptainId(null);
      if (viceCaptainId === playerId) setViceCaptainId(null);
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const chooseLogo = () =>
    run(async () => {
      try {
        const name = await pickAndStoreLogo();
        if (name) setLogoFile(name);
        setActionError(null);
      } catch (e) {
        setActionError(errorMessage(e));
      }
    });

  const save = () =>
    run(async () => {
      const check = validateName(name, 'Team');
      if (!check.ok) {
        setFieldError(check.error);
        return;
      }
      const desc = validateDescription(description);
      const ids = [...selected];
      const problem = desc.ok ? leadershipError(ids, captainId, viceCaptainId) : desc.error;
      if (problem || !desc.ok) {
        setActionError(problem);
        return;
      }
      try {
        const details = { description: desc.value, logoFile, captainId, viceCaptainId };
        if (isNew) await teams.create(check.value, ids, details);
        else await teams.update(id, check.value, ids, details);
        // Tidy up logo images that were replaced or chosen and then not used.
        await removeUnusedLogos(deviceLogoFiles, await teams.logoFilesInUse()).catch(() => undefined);
        router.back();
      } catch (e) {
        setActionError(errorMessage(e)); // form stays filled so the user can retry
      }
    });

  const squad = visible.filter((p) => selected.has(p.id));
  const leaderOptions = (other: string | null) => [
    { value: '', label: 'None' },
    ...squad.map((p) => ({ value: p.id, label: p.name, disabled: p.id === other })),
  ];

  const changeArchived = (next: boolean) =>
    run(async () => {
      try {
        await teams.setArchived(id, next);
        setActionError(null);
        if (next) router.back();
        else await reload();
      } catch (e) {
        setActionError(errorMessage(e));
      }
    });

  const confirmArchive = () =>
    Alert.alert(
      `Archive ${team?.name}?`,
      'The team is hidden from new matches. Its roster and any past matches are kept, and you can restore it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => void changeArchived(true) },
      ],
    );

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: isNew ? 'New team' : (team?.name ?? 'Team') }} />
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {archived ? (
        <Text style={styles.note}>This team is archived. Restore it to make changes.</Text>
      ) : null}

      <TextField
        label="Team name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setFieldError(null);
        }}
        editable={!archived}
        maxLength={80}
        autoCapitalize="words"
        error={fieldError}
      />

      <View style={styles.logoRow}>
        <TeamLogo name={name || 'Team'} logoFile={logoFile} size={72} />
        <View style={styles.logoButtons}>
          <Button title={logoFile ? 'Change logo' : 'Choose logo'} variant="secondary" onPress={() => void chooseLogo()} disabled={archived || pending} />
          {logoFile ? (
            <Button title="Remove logo" variant="secondary" onPress={() => setLogoFile(null)} disabled={archived || pending} />
          ) : null}
        </View>
      </View>
      <Text style={styles.help}>The image is copied into the app (max 512 px), so it stays available offline.</Text>

      <TextField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        editable={!archived}
        maxLength={DESCRIPTION_MAX_LENGTH}
        multiline
        style={styles.multiline}
        placeholder="e.g. Saturday club side, home ground Eastfield"
      />

      <View style={styles.rosterHeader}>
        <Text style={styles.heading}>Roster</Text>
        <Text style={styles.count}>{selected.size} selected</Text>
      </View>

      {visible.length === 0 ? (
        <Text style={styles.note}>
          There are no players yet. Add players on the Players tab, then come back and select them.{' '}
          <Link href="/players" style={styles.link}>
            Go to Players
          </Link>
        </Text>
      ) : (
        <View style={styles.list}>
          {visible.map((p) => {
            const on = selected.has(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => toggle(p.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: archived }}
                style={[styles.playerRow, on && styles.playerRowOn]}
              >
                <View style={[styles.box, on && styles.boxOn]}>
                  {on ? <Text style={styles.tick}>✓</Text> : null}
                </View>
                <Text style={styles.playerName}>{p.name}</Text>
                {p.archivedAt ? <Text style={styles.tag}>Archived</Text> : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {squad.length ? (
        <>
          <Text style={styles.heading}>Captain</Text>
          <Chips
            options={leaderOptions(viceCaptainId)}
            value={captainId ?? ''}
            onChange={(v) => !archived && setCaptainId(v || null)}
          />
          <Text style={styles.heading}>Vice-captain</Text>
          <Chips
            options={leaderOptions(captainId)}
            value={viceCaptainId ?? ''}
            onChange={(v) => !archived && setViceCaptainId(v || null)}
          />
          <Text style={styles.help}>Used as the default for each new match; you can change them in match setup.</Text>
        </>
      ) : null}

      {archived ? (
        <Button title="Restore team" onPress={() => void changeArchived(false)} loading={pending} />
      ) : (
        <>
          <Button title={isNew ? 'Create team' : 'Save team'} onPress={save} loading={pending} />
          {!isNew ? (
            <Button title="Archive team" variant="danger" onPress={confirmArchive} disabled={pending} />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  note: { fontSize: font.body, color: colors.text, backgroundColor: colors.warningBg, padding: spacing.md, borderRadius: radius.sm },
  link: { color: colors.primary, fontWeight: '700' },
  rosterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  heading: { fontSize: font.title, fontWeight: '700', color: colors.text },
  count: { fontSize: font.body, color: colors.textMuted, fontWeight: '600' },
  list: { gap: spacing.sm },
  playerRow: {
    minHeight: MIN_TOUCH + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  playerRowOn: { borderColor: colors.primary, backgroundColor: '#E6F2EC' },
  box: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.onPrimary, fontWeight: '800', fontSize: font.body },
  playerName: { flex: 1, fontSize: font.large, color: colors.text },
  tag: { fontSize: font.small, fontWeight: '700', color: colors.textMuted },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logoButtons: { flex: 1, gap: spacing.sm },
  help: { fontSize: font.small, color: colors.textMuted },
  multiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: spacing.sm },
});
