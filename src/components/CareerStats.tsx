// Career batting and bowling figures for one player (see src/domain/stats.ts).
import { StyleSheet, Text, View } from 'react-native';

import { economy, formatAverage, formatOvers, strikeRate } from '../domain/format';
import type { PlayerCareer } from '../domain/stats';
import { colors, font, radius, spacing } from '../theme/theme';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export function CareerStats({ career, skipped }: { career: PlayerCareer; skipped: number }) {
  const { batting: b, bowling: w } = career;
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Career · {career.matches} {career.matches === 1 ? 'match' : 'matches'}</Text>
      {career.matches === 0 ? <Text style={styles.note}>No matches played yet.</Text> : null}

      {b.innings > 0 ? (
        <>
          <Text style={styles.sub}>Batting</Text>
          <View style={styles.grid}>
            <Stat label="Innings" value={b.innings} />
            <Stat label="Runs" value={b.runs} />
            <Stat label="Highest" value={b.highest ? `${b.highest.runs}${b.highest.notOut ? '*' : ''}` : '-'} />
            <Stat label="Average" value={formatAverage(b.runs, b.dismissals)} />
            <Stat label="Strike rate" value={strikeRate(b.runs, b.ballsFaced)} />
            <Stat label="Not outs" value={b.notOuts} />
            <Stat label="4s / 6s" value={`${b.fours} / ${b.sixes}`} />
            <Stat label="50s / 100s" value={`${b.fifties} / ${b.hundreds}`} />
          </View>
        </>
      ) : null}

      {w.innings > 0 ? (
        <>
          <Text style={styles.sub}>Bowling</Text>
          <View style={styles.grid}>
            <Stat label="Overs" value={formatOvers(w.legalBalls)} />
            <Stat label="Wickets" value={w.wickets} />
            <Stat label="Best" value={w.best ? `${w.best.wickets}/${w.best.runs}` : '-'} />
            <Stat label="Average" value={formatAverage(w.runsConceded, w.wickets)} />
            <Stat label="Economy" value={economy(w.runsConceded, w.legalBalls)} />
            <Stat label="Maidens" value={w.maidens} />
          </View>
        </>
      ) : null}

      <Text style={styles.note}>
        {'Average = runs per dismissal (batting) or runs conceded per wicket (bowling); "-" until there is one.'}
        {skipped ? ` ${skipped} damaged match${skipped === 1 ? ' was' : 'es were'} left out.` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  heading: { fontSize: font.title, fontWeight: '700', color: colors.text },
  sub: { fontSize: font.body, fontWeight: '800', color: colors.primary, marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { width: '30%', minWidth: 90, paddingVertical: spacing.xs },
  value: { fontSize: font.large, fontWeight: '800', color: colors.text },
  label: { fontSize: font.small, color: colors.textMuted },
  note: { fontSize: font.small, color: colors.textMuted },
});
