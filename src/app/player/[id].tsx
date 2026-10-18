import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { CareerStats } from '../../components/CareerStats';
import { ErrorBanner, ErrorView, LoadingView } from '../../components/StateViews';
import { TextField } from '../../components/TextField';
import { useMatchService, useRepositories } from '../../data/AppDataProvider';
import { validateName } from '../../domain/people';
import { playerCareer } from '../../domain/stats';
import { useFocusLoad } from '../../hooks/useFocusLoad';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { colors, font, spacing } from '../../theme/theme';
import { errorMessage } from '../../utils/errors';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { players } = useRepositories();
  const matchService = useMatchService();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { run, pending } = useGuardedAction();

  const { data, error, reload } = useFocusLoad(
    async () => {
      const player = await players.get(id);
      const teamNames = player ? await players.activeTeamNames(id) : [];
      const played = player ? await matchService.loadMatchesForPlayer(id) : { matches: [], skipped: 0 };
      const career = playerCareer(id, played.matches.map((m) => m.state));
      return { player, teamNames, career, skipped: played.skipped };
    },
    [players, matchService, id],
  );

  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Copy the saved name into the form whenever it changes (adjusting state during render,
  // as React recommends, instead of an effect).
  const loadedName = data?.player?.name;
  const [syncedName, setSyncedName] = useState<string | undefined>(undefined);
  if (loadedName !== undefined && loadedName !== syncedName) {
    setSyncedName(loadedName);
    setName(loadedName);
  }

  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return <LoadingView />;
  const { player, teamNames, career, skipped } = data;
  if (!player) return <ErrorView title="Player not found" message="This player no longer exists." />;

  const archived = player.archivedAt !== null;

  const save = () =>
    run(async () => {
      const check = validateName(name, 'Player');
      if (!check.ok) {
        setFieldError(check.error);
        return;
      }
      try {
        await players.rename(player.id, check.value);
        router.back();
      } catch (e) {
        setActionError(errorMessage(e));
      }
    });

  const changeArchived = (next: boolean) =>
    run(async () => {
      try {
        await players.setArchived(player.id, next);
        setActionError(null);
        await reload();
      } catch (e) {
        setActionError(errorMessage(e));
      }
    });

  const confirmArchive = () => {
    const teamLine = teamNames.length
      ? `\n\nThey are on: ${teamNames.join(', ')}. They stay on those rosters and in past matches, but cannot be added to teams or lineups.`
      : '\n\nThey will no longer appear when you pick players.';
    Alert.alert(`Archive ${player.name}?`, `Archiving can be undone later.${teamLine}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => void changeArchived(true) },
    ]);
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: player.name }} />
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {archived ? (
        <Text style={styles.note}>This player is archived. Restore them to edit or use them.</Text>
      ) : null}

      <TextField
        label="Player name"
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

      <View style={styles.section}>
        <Text style={styles.heading}>Teams</Text>
        <Text style={styles.body}>
          {teamNames.length ? teamNames.join(', ') : 'Not on any active team.'}
        </Text>
      </View>

      <CareerStats career={career} skipped={skipped} />

      {archived ? (
        <Button title="Restore player" onPress={() => void changeArchived(false)} loading={pending} />
      ) : (
        <>
          <Button title="Save name" onPress={save} loading={pending} />
          <Button title="Archive player" variant="danger" onPress={confirmArchive} disabled={pending} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  note: { fontSize: font.body, color: colors.text, backgroundColor: colors.warningBg, padding: spacing.md, borderRadius: 8 },
  section: { gap: spacing.xs },
  heading: { fontSize: font.body, fontWeight: '600', color: colors.text },
  body: { fontSize: font.body, color: colors.textMuted },
});
