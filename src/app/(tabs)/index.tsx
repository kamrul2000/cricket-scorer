// Matches: start a new match, resume one in progress, or open a completed scorecard.
import { useRouter } from 'expo-router';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { ListRow } from '../../components/ListRow';
import { EmptyState, ErrorBanner, ErrorView, LoadingView } from '../../components/StateViews';
import { useRepositories } from '../../data/AppDataProvider';
import type { MatchSummary } from '../../data/matchRepository';
import { useFocusLoad } from '../../hooks/useFocusLoad';
import { colors, font, spacing } from '../../theme/theme';

export default function MatchesScreen() {
  const { matches } = useRepositories();
  const router = useRouter();
  const { data, loading, error, reload } = useFocusLoad(() => matches.list(), [matches]);

  const sections = [
    { title: 'In progress', data: (data ?? []).filter((m) => m.status === 'inProgress') },
    { title: 'Completed', data: (data ?? []).filter((m) => m.status === 'completed') },
  ].filter((s) => s.data.length > 0);

  const open = (m: MatchSummary) => router.push(m.status === 'inProgress' ? `/match/${m.id}/score` : `/match/${m.id}`);

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Button title="New match" onPress={() => router.push('/match/new')} />
      </View>
      {error && !data ? (
        <ErrorView message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingView label="Loading matches…" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={error ? <ErrorBanner message={error} /> : undefined}
          ListEmptyComponent={
            <EmptyState title="No matches yet" message="Tap New match to set up teams, lineups and the toss, then start scoring." />
          }
          renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
          renderItem={({ item }) => (
            <ListRow
              title={`${item.teamAName} v ${item.teamBName}`}
              subtitle={`${item.summary}\n${new Date(item.createdAt).toLocaleDateString()}`}
              badge={item.status === 'inProgress' ? 'Resume' : undefined}
              onPress={() => open(item)}
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
  top: { padding: spacing.md },
  list: { padding: spacing.md, paddingTop: 0, flexGrow: 1 },
  section: { fontSize: font.body, fontWeight: '800', color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm },
});
