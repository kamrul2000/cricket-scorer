// Matches dashboard: upcoming matches, live and paused matches (resume), completed scorecards
// and abandoned matches, with a search over teams, venue, date and result.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../../components/Button';
import { ListRow } from '../../components/ListRow';
import { EmptyState, ErrorBanner, ErrorView, LoadingView } from '../../components/StateViews';
import { TeamLogo } from '../../components/TeamLogo';
import { useRepositories } from '../../data/AppDataProvider';
import type { MatchSummary } from '../../data/matchRepository';
import { formatLabel, formatMatchDate, formatMatchTime, upcomingOrder, type ScheduledMatch } from '../../domain/schedule';
import { useFocusLoad } from '../../hooks/useFocusLoad';
import { colors, font, MIN_TOUCH, radius, spacing } from '../../theme/theme';

type Item = { kind: 'match'; match: MatchSummary } | { kind: 'schedule'; schedule: ScheduledMatch };

/** Every word of the search must appear somewhere in the text (case does not matter). */
function matchesSearch(text: string, query: string): boolean {
  const haystack = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

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

  const [query, setQuery] = useState('');
  const teamName = (id: string) => data?.teams.get(id)?.name ?? 'Unknown team';
  const searchText = (item: Item) => {
    if (item.kind === 'match') {
      const m = item.match;
      return [m.teamAName, m.teamBName, m.venue, m.summary, formatMatchDate(m.createdAt), m.pause?.reason ?? ''].join(' ');
    }
    const s = item.schedule;
    return [teamName(s.teamAId), teamName(s.teamBId), s.venue, formatMatchDate(s.scheduledAt), formatLabel(s.formatName, s.oversPerInnings)].join(' ');
  };
  const shown = (items: Item[]) => (query.trim() ? items.filter((item) => matchesSearch(searchText(item), query)) : items);
  const matchItems = (keep: (m: MatchSummary) => boolean): Item[] =>
    shown((data?.matchList ?? []).filter(keep).map((match) => ({ kind: 'match', match })));
  const sections = [
    { title: 'Upcoming', data: shown(upcomingOrder(data?.scheduleList ?? []).map((schedule): Item => ({ kind: 'schedule', schedule }))) },
    { title: 'Live', data: matchItems((m) => m.status === 'inProgress' && !m.pause) },
    { title: 'Paused', data: matchItems((m) => m.status === 'inProgress' && !!m.pause) },
    { title: 'Completed', data: matchItems((m) => m.status === 'completed' && !m.abandoned) },
    { title: 'Abandoned', data: matchItems((m) => m.status === 'completed' && m.abandoned) },
  ].filter((s) => s.data.length > 0);
  const hasAny = (data?.matchList.length ?? 0) + (data?.scheduleList.length ?? 0) > 0;

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === 'match') {
      const m = item.match;
      const paused = m.pause ? `Paused${m.pause.reason ? `: ${m.pause.reason}` : ''} · ` : '';
      return (
        <ListRow
          title={`${m.teamAName} v ${m.teamBName}`}
          subtitle={`${paused}${m.summary}\n${formatMatchDate(m.createdAt)}${m.venue ? ` · ${m.venue}` : ''}`}
          badge={m.status === 'inProgress' ? (m.pause ? 'Paused' : 'Live') : undefined}
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
      {hasAny ? (
        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search team, venue, date or result"
            placeholderTextColor={colors.textMuted}
            style={styles.search}
            accessibilityLabel="Search matches"
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      ) : null}
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
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            hasAny ? (
              <EmptyState
                title="No matches found"
                message={`Nothing matches "${query.trim()}". Search by team, venue, date (for example 8 Nov) or result.`}
              />
            ) : (
              <EmptyState
                title="No matches yet"
                message="Tap New match to set up teams, lineups and the toss and start scoring, or Schedule match to plan one."
              />
            )
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
  searchWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  search: {
    minHeight: MIN_TOUCH,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: font.body,
    color: colors.text,
  },
  flex: { flex: 1 },
  list: { padding: spacing.md, paddingTop: 0, flexGrow: 1 },
  section: { fontSize: font.body, fontWeight: '800', color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm },
});
