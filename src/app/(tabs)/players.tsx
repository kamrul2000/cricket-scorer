// Players: add a player, and find players by name, role or batting hand.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { ListRow } from '../../components/ListRow';
import { SearchField } from '../../components/SearchField';
import { EmptyState, ErrorBanner, ErrorView, LoadingView } from '../../components/StateViews';
import { useRepositories } from '../../data/AppDataProvider';
import { profileText } from '../../domain/people';
import { useFocusLoad } from '../../hooks/useFocusLoad';
import { colors, font, spacing } from '../../theme/theme';
import { matchesSearch } from '../../utils/search';

export default function PlayersScreen() {
  const { players } = useRepositories();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');

  const { data, loading, error, reload } = useFocusLoad(
    () => players.list({ includeArchived: showArchived }),
    [players, showArchived],
  );

  const all = data ?? [];
  const shown = query.trim() ? all.filter((p) => matchesSearch(`${p.name} ${profileText(p)}`, query)) : all;

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Button title="Add player" onPress={() => router.push('/player/new')} />
        {all.length ? (
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, role or left / right"
            accessibilityLabel="Search players"
          />
        ) : null}
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
          data={shown}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={error ? <ErrorBanner message={error} /> : undefined}
          ListEmptyComponent={
            all.length ? (
              <EmptyState
                title="No players found"
                message={`Nothing matches "${query.trim()}". Search by name, or by Batter, Bowler, All-rounder, Wicket-keeper, Left or Right.`}
              />
            ) : (
              <EmptyState
                title="No players yet"
                message="Tap Add player to add one, with their batting hand and role. You can put players on teams afterwards."
              />
            )
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={profileText(item) || undefined}
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
  top: { padding: spacing.md, gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: font.body, color: colors.text },
  list: { padding: spacing.md, paddingTop: 0, flexGrow: 1 },
});
