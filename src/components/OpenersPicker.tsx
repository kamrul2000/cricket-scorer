// Choose opening striker, non-striker and bowler. Used in match setup and at the innings break.
import { StyleSheet, Text, View } from 'react-native';

import type { TeamLineup } from '../domain/match';
import { colors, font, spacing } from '../theme/theme';
import { PlayerPicker } from './PlayerPicker';

export interface Openers {
  strikerId: string | null;
  nonStrikerId: string | null;
  bowlerId: string | null;
}

interface Props {
  batting: TeamLineup;
  bowling: TeamLineup;
  value: Openers;
  onChange: (value: Openers) => void;
}

export function OpenersPicker({ batting, bowling, value, onChange }: Props) {
  const batters = (other: string | null) =>
    batting.players.map((p) => ({ ...p, disabledReason: p.playerId === other ? 'Already chosen' : null }));
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Striker (faces the first ball) · {batting.name}</Text>
      <PlayerPicker
        players={batters(value.nonStrikerId)}
        selectedIds={value.strikerId ? [value.strikerId] : []}
        onToggle={(id) => onChange({ ...value, strikerId: id })}
      />
      <Text style={styles.heading}>Non-striker · {batting.name}</Text>
      <PlayerPicker
        players={batters(value.strikerId)}
        selectedIds={value.nonStrikerId ? [value.nonStrikerId] : []}
        onToggle={(id) => onChange({ ...value, nonStrikerId: id })}
      />
      <Text style={styles.heading}>Opening bowler · {bowling.name}</Text>
      <PlayerPicker
        players={bowling.players}
        selectedIds={value.bowlerId ? [value.bowlerId] : []}
        onToggle={(id) => onChange({ ...value, bowlerId: id })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  heading: { fontSize: font.large, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
});
