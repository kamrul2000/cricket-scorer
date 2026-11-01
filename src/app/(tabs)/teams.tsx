// Teams: add a team, and find teams by name, description or the name of a player on the roster.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { ListRow } from '../../components/ListRow';
import { SearchField } from '../../components/SearchField';
import { EmptyState, ErrorBanner, ErrorView, LoadingView } from '../../components/StateViews';
import { TeamLogo } from '../../components/TeamLogo';
import { useRepositories } from '../../data/AppDataProvider';
import type { TeamSummary } from '../../domain/people';
import { useFocusLoad } from '../../hooks/useFocusLoad';
import { colors, font, spacing } from '../../theme/theme';
import { matchesSearch } from '../../utils/search';

export default function TeamsScreen() {
  const { teams } = useRepositories();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');

  const { data, loading, error, reload } = useFocusLoad(
    () => teams.list({ includeArchived: showArchived }),
    [teams, showArchived],
  );

  const all = data ?? [];
  const q = query.trim();
  const shown = q ? all.filter((t) => matchesSearch([t.name, t.description, ...t.playerNames].join('\n'), q)) : all;

  const subtitle = (t: TeamSummary) => {
    const lines = [`${t.playerCount} ${t.playerCount === 1 ? 'player' : 'players'}${t.description ? ` · ${t.description}` : ''}`];
    // Say which players matched, since their names are not otherwise shown in the list.
    const found = q && !matchesSearch(t.name, q) ? t.playerNames.filter((n) => matchesSearch(n, q)).sort() : [];
    if (found.length) lines.push(`${found.length === 1 ? 'Player' : 'Players'}: ${found.join(', ')}`);
    return lines.join('\n');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Button title="Add team" onPress={() => router.push('/team/new')} />
        {all.length ? (
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search team or player name"
            accessibilityLabel="Search teams"
          />
        ) : null}
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
          data={shown}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={error ? <ErrorBanner message={error} /> : undefined}
          ListEmptyComponent={
            all.length ? (
              <EmptyState title="No teams found" message={`No team or player matches "${q}".`} />
            ) : (
              <EmptyState
                title="No teams yet"
                message="Tap Add team to create one and choose its players."
              />
            )
          }
          renderItem={({ item }) => (
            <ListRow
              leading={<TeamLogo name={item.name} logoFile={item.logoFile} size={44} />}
              title={item.name}
              subtitle={subtitle(item)}
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
