// A player's batting hand and role, as two rows of chips. Both are optional: tapping the
// selected choice again clears it.
import { StyleSheet, Text, View } from 'react-native';

import {
  BATTING_HAND_LABELS,
  BATTING_HANDS,
  PLAYER_ROLE_LABELS,
  PLAYER_ROLES,
  type PlayerProfile,
} from '../domain/people';
import { colors, font, spacing } from '../theme/theme';
import { Chips } from './Chips';

interface Props {
  value: PlayerProfile;
  onChange: (next: PlayerProfile) => void;
  disabled?: boolean;
}

export function PlayerProfileFields({ value, onChange, disabled }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Batting</Text>
      <Chips
        accessibilityLabel="Batting hand"
        options={BATTING_HANDS.map((h) => ({ value: h, label: BATTING_HAND_LABELS[h], disabled }))}
        value={value.battingHand}
        onChange={(h) => onChange({ ...value, battingHand: value.battingHand === h ? null : h })}
      />
      <Text style={styles.label}>Role</Text>
      <Chips
        accessibilityLabel="Role"
        options={PLAYER_ROLES.map((r) => ({ value: r, label: PLAYER_ROLE_LABELS[r], disabled }))}
        value={value.role}
        onChange={(r) => onChange({ ...value, role: value.role === r ? null : r })}
      />
      <Text style={styles.help}>Optional. Tap a selected choice again to clear it.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { fontSize: font.body, fontWeight: '600', color: colors.text },
  help: { fontSize: font.small, color: colors.textMuted },
});
