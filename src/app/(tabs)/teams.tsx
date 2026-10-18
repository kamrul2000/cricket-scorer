import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { ListRow } from '../../components/ListRow';
import { EmptyState, ErrorBanner, ErrorView, LoadingView } from '../../components/StateViews';
import { useRepositories } from '../../data/AppDataProvider';
import { useFocusLoad } from '../../hooks/useFocusLoad';
import { colors, font, spacing } from '../../theme/theme';

export default function TeamsScreen() {
  const { teams } = useRepositories();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);

  const { data, loading, error, reload } = useFocusLoad(
    () => teams.list({ includeArchived: showArchived }),
    [teams, showArchived],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Button title="Add team" onPress={() => router.push('/team/new')} />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Show archived teams</Text>
          <Switch
            value={showArchived}
            onValueChange={setShowArchived}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Show archived teams"
          />
        </View>
      </View>

      {error && !data ? (
        <ErrorView message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingView label="Loading teams…" />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={error ? <ErrorBanner message={error} /> : undefined}
          ListEmptyComponent={
            <EmptyState
              title="No teams yet"
              message="Tap Add team to create one and choose its players."
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={`${item.playerCount} ${item.playerCount === 1 ? 'player' : 'players'}`}
              badge={item.archivedAt ? 'Archived' : undefined}
              onPress={() => router.push(`/team/${item.id}`)}
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
