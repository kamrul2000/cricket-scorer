// A vertical list of players as large tappable rows. Supports single or multiple selection,
// and disabled rows with a reason (e.g. "Bowled the previous over").
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, MIN_TOUCH, radius, spacing } from '../theme/theme';

export interface PickerPlayer {
  playerId: string;
  name: string;
  disabledReason?: string | null;
  /** Small text on the right, e.g. bowling figures. */
  detail?: string;
}

interface Props {
  players: PickerPlayer[];
  selectedIds: readonly string[];
  onToggle: (playerId: string) => void;
  multiple?: boolean;
}

export function PlayerPicker({ players, selectedIds, onToggle, multiple }: Props) {
  return (
    <View style={styles.list}>
      {players.map((p) => {
        const on = selectedIds.includes(p.playerId);
        const disabled = !!p.disabledReason;
        return (
          <Pressable
            key={p.playerId}
            onPress={disabled ? undefined : () => onToggle(p.playerId)}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: on, disabled }}
            accessibilityHint={p.disabledReason ?? undefined}
            style={[styles.row, on && styles.rowOn, disabled && styles.rowDisabled]}
          >
            <View style={[styles.mark, multiple ? styles.square : styles.round, on && styles.markOn]}>
              {on ? <Text style={styles.tick}>✓</Text> : null}
            </View>
            <View style={styles.texts}>
              <Text style={styles.name}>{p.name}</Text>
              {p.disabledReason ? <Text style={styles.reason}>{p.disabledReason}</Text> : null}
            </View>
            {p.detail ? <Text style={styles.detail}>{p.detail}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    minHeight: MIN_TOUCH + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowOn: { borderColor: colors.primary, backgroundColor: '#E6F2EC' },
  rowDisabled: { opacity: 0.55 },
  mark: { width: 28, height: 28, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  square: { borderRadius: 6 },
  round: { borderRadius: 14 },
  markOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.onPrimary, fontWeight: '800', fontSize: font.body },
  texts: { flex: 1 },
  name: { fontSize: font.large, color: colors.text, fontWeight: '600' },
  reason: { fontSize: font.small, color: colors.textMuted },
  detail: { fontSize: font.small, color: colors.textMuted, fontWeight: '600' },
});
