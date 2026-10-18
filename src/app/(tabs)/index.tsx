// Matches dashboard: upcoming matches, matches in progress (resume), and completed scorecards.
import { useRouter } from 'expo-router';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { ListRow } from '../../components/ListRow';
import { EmptyState, ErrorBanner, ErrorView, LoadingView } from '../../components/StateViews';
import { TeamLogo } from '../../components/TeamLogo';
import { useRepositories } from '../../data/AppDataProvider';
import type { MatchSummary } from '../../data/matchRepository';
import { formatLabel, formatMatchDate, formatMatchTime, upcomingOrder, type ScheduledMatch } from '../../domain/schedule';
import { useFocusLoad } from '../../hooks/useFocusLoad';
import { colors, font, spacing } from '../../theme/theme';

type Item = { kind: 'match'; match: MatchSummary } | { kind: 'schedule'; schedule: ScheduledMatch };

export default function MatchesScreen() {
  const { matches, schedules, teams } = useRepositories();
  const router = useRouter();
  const { data, loading, error, reload } = useFocusLoad(async () => {
    const [matchList, scheduleList, teamList] = await Promise.all([
      matches.list(),
      schedules.list(),
      teams.list({ includeArchived: true }),
    ]);
    return { matchList, scheduleList, teams: new Map(teamList.map((t) => [t.id, t])) };
  }, [matches, schedules, teams]);

  const matchItems = (status: MatchSummary['status']): Item[] =>
    (data?.matchList ?? []).filter((m) => m.status === status).map((match) => ({ kind: 'match', match }));
  const sections = [
    { title: 'Upcoming', data: upcomingOrder(data?.scheduleList ?? []).map((schedule): Item => ({ kind: 'schedule', schedule })) },
    { title: 'In progress', data: matchItems('inProgress') },
    { title: 'Completed', data: matchItems('completed') },
  ].filter((s) => s.data.length > 0);

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === 'match') {
      const m = item.match;
      return (
        <ListRow
          title={`${m.teamAName} v ${m.teamBName}`}
          subtitle={`${m.summary}\n${new Date(m.createdAt).toLocaleDateString()}`}
          badge={m.status === 'inProgress' ? 'Resume' : undefined}
          onPress={() => router.push(m.status === 'inProgress' ? `/match/${m.id}/score` : `/match/${m.id}`)}
        />
      );
    }
    const s = item.schedule;
    const a = data?.teams.get(s.teamAId);
    const b = data?.teams.get(s.teamBId);
    const when = `${formatMatchDate(s.scheduledAt)} · ${formatMatchTime(s.scheduledAt)}`;
    return (
      <ListRow
        leading={<TeamLogo name={a?.name ?? '?'} logoFile={a?.logoFile} size={36} />}
        title={`${a?.name ?? 'Unknown team'} v ${b?.name ?? 'Unknown team'}`}
        subtitle={`${when}${s.venue ? ` · ${s.venue}` : ''}\n${formatLabel(s.formatName, s.oversPerInnings)}`}
        badge={s.status === 'cancelled' ? 'Cancelled' : 'Upcoming'}
        onPress={() => router.push(`/schedule/${s.id}`)}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Button title="New match" onPress={() => router.push('/match/new')} />
        </View>
        <View style={styles.flex}>
          <Button title="Schedule match" variant="secondary" onPress={() => router.push('/schedule/new')} />
        </View>
      </View>
      {error && !data ? (
        <ErrorView message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingView label="Loading matches…" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => (item.kind === 'match' ? `m-${item.match.id}` : `s-${item.schedule.id}`)}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={error ? <ErrorBanner message={error} /> : undefined}
          ListEmptyComponent={
            <EmptyState
              title="No matches yet"
              message="Tap New match to set up teams, lineups and the toss and start scoring, or Schedule match to plan one."
            />
          }
          renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { padding: spacing.md, flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  list: { padding: spacing.md, paddingTop: 0, flexGrow: 1 },
  section: { fontSize: font.body, fontWeight: '800', color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm },
});
