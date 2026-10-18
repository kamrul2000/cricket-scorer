import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { ListRow } from '../../components/ListRow';
import { EmptyState, ErrorBanner, ErrorView, LoadingView } from '../../components/StateViews';
import { TextField } from '../../components/TextField';
import { useRepositories } from '../../data/AppDataProvider';
import { validateName } from '../../domain/people';
import { useFocusLoad } from '../../hooks/useFocusLoad';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { colors, font, spacing } from '../../theme/theme';
import { errorMessage } from '../../utils/errors';

export default function PlayersScreen() {
  const { players } = useRepositories();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const { run, pending } = useGuardedAction();

  const { data, loading, error, reload } = useFocusLoad(
    () => players.list({ includeArchived: showArchived }),
    [players, showArchived],
  );

  const addPlayer = () =>
    run(async () => {
      const check = validateName(name, 'Player');
      if (!check.ok) {
        setFormError(check.error);
        return;
      }
      try {
        await players.create(check.value);
        setName('');
        setFormError(null);
        await reload();
      } catch (e) {
        setFormError(errorMessage(e)); // name stays in the box so the user can retry
      }
    });

  return (
    <View style={styles.screen}>
      <View style={styles.form}>
        <TextField
          label="New player name"
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (formError) setFormError(null);
          }}
          onSubmitEditing={addPlayer}
          placeholder="e.g. Rahim Uddin"
          maxLength={80}
          autoCapitalize="words"
          returnKeyType="done"
          error={formError}
        />
        <Button title="Add player" onPress={addPlayer} loading={pending} />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Show archived players</Text>
          <Switch
            value={showArchived}
            onValueChange={setShowArchived}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Show archived players"
          />
        </View>
      </View>

      {error && !data ? (
        <ErrorView message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingView label="Loading players…" />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={error ? <ErrorBanner message={error} /> : undefined}
          ListEmptyComponent={
            <EmptyState
              title="No players yet"
              message="Type a name above and tap Add player. You can put players on teams afterwards."
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              badge={item.archivedAt ? 'Archived' : undefined}
              onPress={() => router.push(`/player/${item.id}`)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  form: { padding: spacing.md, gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: font.body, color: colors.text },
  list: { padding: spacing.md, paddingTop: 0, flexGrow: 1 },
});
