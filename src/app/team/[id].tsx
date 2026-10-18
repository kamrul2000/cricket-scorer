// Create (id = "new") or edit a team: name plus roster checklist.
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { ErrorBanner, ErrorView, LoadingView } from '../../components/StateViews';
import { TextField } from '../../components/TextField';
import { useRepositories } from '../../data/AppDataProvider';
import { validateName } from '../../domain/people';
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

  // Fill the form once when data first arrives, so later refreshes never wipe typing.
  // (Adjusting state during render, as React recommends, instead of an effect.)
  if (data && !initialised) {
    if (data.team) {
      setName(data.team.name);
      setSelected(new Set(data.team.playerIds));
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
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const save = () =>
    run(async () => {
      const check = validateName(name, 'Team');
      if (!check.ok) {
        setFieldError(check.error);
        return;
      }
      try {
        const ids = [...selected];
        if (isNew) await teams.create(check.value, ids);
        else await teams.update(id, check.value, ids);
        router.back();
      } catch (e) {
        setActionError(errorMessage(e)); // form stays filled so the user can retry
      }
    });

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
});
