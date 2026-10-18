// Batting and bowling scorecard for one innings, plus extras and fall of wickets.
// All numbers come from the scoring engine's state.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dismissalText, economy, formatOvers, ordinal, playerName, roleSuffix, scoreText, strikeRate } from '../../domain/format';
import { extrasTotal, type InningsState, type MatchState } from '../../domain/scoring';
import { colors, font, radius, spacing } from '../../theme/theme';

function Cell({ children, wide, bold, muted }: { children: ReactNode; wide?: boolean; bold?: boolean; muted?: boolean }) {
  return (
    <Text style={[styles.cell, wide ? styles.wide : styles.num, bold && styles.bold, muted && styles.muted]} numberOfLines={wide ? 2 : 1}>
      {children}
    </Text>
  );
}

export function InningsScorecard({ state, inn }: { state: MatchState; inn: InningsState }) {
  const atCrease = new Set([inn.strikerId, inn.nonStrikerId]);
  const batted = new Set(inn.batters.map((b) => b.playerId));
  const didNotBat = inn.battingTeam.players.filter((p) => !batted.has(p.playerId));
  const ex = inn.extras;

  return (
    <View style={styles.wrap}>
      <View style={styles.totalRow}>
        <Text style={styles.teamName}>{inn.battingTeam.name}</Text>
        <Text style={styles.total}>
          {scoreText(inn)} <Text style={styles.overs}>({formatOvers(inn.legalBalls)} ov)</Text>
        </Text>
      </View>

      <View style={styles.table}>
        <View style={[styles.row, styles.headRow]}>
          <Cell wide bold>Batter</Cell>
          <Cell bold>R</Cell>
          <Cell bold>B</Cell>
          <Cell bold>4s</Cell>
          <Cell bold>6s</Cell>
          <Cell bold>SR</Cell>
        </View>
        {inn.batters.map((b) => (
          <View key={b.playerId} style={styles.row}>
            <View style={styles.wideBox}>
              <Text style={styles.name}>
                {b.name}
                {roleSuffix(inn.battingTeam, b.playerId)}
                {b.playerId === inn.strikerId && !inn.completed ? ' *' : ''}
              </Text>
              <Text style={styles.how}>
                {b.wicket ? dismissalText(state.setup, b.wicket) : atCrease.has(b.playerId) && !inn.completed ? 'batting' : 'not out'}
              </Text>
            </View>
            <Cell bold>{b.runs}</Cell>
            <Cell>{b.ballsFaced}</Cell>
            <Cell>{b.fours}</Cell>
            <Cell>{b.sixes}</Cell>
            <Cell muted>{strikeRate(b.runs, b.ballsFaced)}</Cell>
          </View>
        ))}
      </View>

      <Text style={styles.line}>
        <Text style={styles.bold}>Extras {extrasTotal(ex)}</Text> (b {ex.byes}, lb {ex.legByes}, w {ex.wides}, nb {ex.noBalls})
      </Text>
      {didNotBat.length ? (
        <Text style={styles.line}>
          <Text style={styles.bold}>{inn.completed ? 'Did not bat: ' : 'Yet to bat: '}</Text>
          {didNotBat.map((p) => p.name + roleSuffix(inn.battingTeam, p.playerId)).join(', ')}
        </Text>
      ) : null}
      {inn.battingTeam.substitutes?.length ? (
        <Text style={styles.line}>
          <Text style={styles.bold}>Substitutes: </Text>
          {inn.battingTeam.substitutes.map((p) => p.name).join(', ')}
        </Text>
      ) : null}
      {inn.fallOfWickets.length ? (
        <Text style={styles.line}>
          <Text style={styles.bold}>Fall of wickets: </Text>
          {inn.fallOfWickets
            .map((f) => `${f.wicketNumber}-${f.teamRuns} (${playerName(state.setup, f.playerOutId)}, ${formatOvers(f.legalBalls)} ov)`)
            .join(', ')}
        </Text>
      ) : null}

      <View style={styles.table}>
        <View style={[styles.row, styles.headRow]}>
          <Cell wide bold>Bowler · {inn.bowlingTeam.name}</Cell>
          <Cell bold>O</Cell>
          <Cell bold>M</Cell>
          <Cell bold>R</Cell>
          <Cell bold>W</Cell>
          <Cell bold>Econ</Cell>
        </View>
        {inn.bowlers.map((b) => (
          <View key={b.playerId} style={styles.row}>
            <View style={styles.wideBox}>
              <Text style={styles.name}>
                {b.name}
                {roleSuffix(inn.bowlingTeam, b.playerId)}
              </Text>
              {b.wideBalls || b.noBallBalls ? (
                <Text style={styles.how}>
                  {b.wideBalls} wd, {b.noBallBalls} nb
                </Text>
              ) : null}
            </View>
            <Cell>{formatOvers(b.legalBalls)}</Cell>
            <Cell>{b.maidens}</Cell>
            <Cell>{b.runsConceded}</Cell>
            <Cell bold>{b.wickets}</Cell>
            <Cell muted>{economy(b.runsConceded, b.legalBalls)}</Cell>
          </View>
        ))}
      </View>

      {inn.partnerships.length ? (
        <View style={styles.table}>
          <View style={[styles.row, styles.headRow]}>
            <Cell wide bold>Partnerships</Cell>
            <Cell bold>Runs</Cell>
            <Cell bold>Balls</Cell>
          </View>
          {inn.partnerships.map((p) => (
            <View key={p.number} style={styles.row}>
              <View style={styles.wideBox}>
                <Text style={styles.name}>
                  {ordinal(p.number)} wkt{p.broken ? '' : ' (unbroken)'}
                </Text>
                <Text style={styles.how}>
                  {playerName(state.setup, p.batterIds[0])} {p.batterRuns[0]}, {playerName(state.setup, p.batterIds[1])}{' '}
                  {p.batterRuns[1]}
                </Text>
              </View>
              <Cell bold>{p.runs}</Cell>
              <Cell>{p.balls}</Cell>
            </View>
          ))}
        </View>
      ) : null}

      {inn.overs.length ? (
        <View style={styles.table}>
          <View style={[styles.row, styles.headRow]}>
            <Cell wide bold>Over by over</Cell>
            <Cell bold>Runs</Cell>
            <Cell bold>Wkts</Cell>
            <Cell bold>Score</Cell>
          </View>
          {inn.overs.map((o) => (
            <View key={o.over} style={styles.row}>
              <View style={styles.wideBox}>
                <Text style={styles.name}>
                  Over {o.over + 1}
                  {o.complete ? '' : ` (${o.legalBalls} ${o.legalBalls === 1 ? 'ball' : 'balls'})`}
                </Text>
                <Text style={styles.how}>{playerName(state.setup, o.bowlerId)}</Text>
              </View>
              <Cell bold>{o.runs}</Cell>
              <Cell>{o.wickets}</Cell>
              <Cell muted>{`${o.totalRuns}/${o.totalWickets}`}</Cell>
            </View>
          ))}
        </View>
      ) : null}
      {inn.endReason === 'abandoned' ? <Text style={styles.line}>Innings ended when the match was abandoned.</Text> : null}
      {inn.partnerships.length ? <Text style={styles.muted}>Partnership balls exclude wides.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  teamName: { fontSize: font.title, fontWeight: '800', color: colors.text, flex: 1 },
  total: { fontSize: font.title, fontWeight: '800', color: colors.text },
  overs: { fontSize: font.body, fontWeight: '600', color: colors.textMuted },
  table: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderTopWidth: 1, borderTopColor: '#E3E9E5' },
  headRow: { backgroundColor: '#E3E9E5', borderTopWidth: 0 },
  cell: { fontSize: font.body, color: colors.text },
  wide: { flex: 1 },
  wideBox: { flex: 1, paddingRight: spacing.xs },
  num: { width: 40, textAlign: 'right' },
  bold: { fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: font.small },
  name: { fontSize: font.body, fontWeight: '700', color: colors.text },
  how: { fontSize: font.small, color: colors.textMuted },
  line: { fontSize: font.body, color: colors.text },
});
