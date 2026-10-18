// The main input controls. One tap records common deliveries; extras and wickets open the
// detailed delivery editor.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BallType, RunsFrom } from '../../domain/match';
import { colors, font, radius, spacing } from '../../theme/theme';

export type EditorPreset =
  | { kind: 'fair' }
  | { kind: 'extra'; ballType: BallType; runsFrom: RunsFrom | null }
  | { kind: 'wicket' };

interface Props {
  disabled: boolean;
  onRuns: (runs: number) => void;
  onBoundary: (boundary: 'four' | 'six') => void;
  onOpenEditor: (preset: EditorPreset) => void;
  onUndo: () => void;
  canUndo: boolean;
}

function PadButton({
  label,
  sub,
  onPress,
  disabled,
  tone = 'plain',
  accessibilityLabel,
}: {
  label: string;
  sub?: string;
  onPress: () => void;
  disabled: boolean;
  tone?: 'plain' | 'boundary' | 'extra' | 'wicket' | 'undo';
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [styles.btn, toneStyles[tone], pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.btnText, (tone === 'boundary' || tone === 'wicket') && styles.lightText]}>{label}</Text>
      {sub ? <Text style={[styles.sub, (tone === 'boundary' || tone === 'wicket') && styles.lightText]}>{sub}</Text> : null}
    </Pressable>
  );
}

export function ScoringPad({ disabled, onRuns, onBoundary, onOpenEditor, onUndo, canUndo }: Props) {
  return (
    <View style={styles.pad}>
      <View style={styles.row}>
        <PadButton label="0" sub="dot" onPress={() => onRuns(0)} disabled={disabled} accessibilityLabel="Dot ball, no run" />
        <PadButton label="1" onPress={() => onRuns(1)} disabled={disabled} accessibilityLabel="1 run" />
        <PadButton label="2" onPress={() => onRuns(2)} disabled={disabled} accessibilityLabel="2 runs" />
        <PadButton label="3" onPress={() => onRuns(3)} disabled={disabled} accessibilityLabel="3 runs" />
      </View>
      <View style={styles.row}>
        <PadButton label="4" sub="boundary" tone="boundary" onPress={() => onBoundary('four')} disabled={disabled} accessibilityLabel="Four, boundary" />
        <PadButton label="6" sub="boundary" tone="boundary" onPress={() => onBoundary('six')} disabled={disabled} accessibilityLabel="Six, boundary" />
        <PadButton label="More" sub="runs" onPress={() => onOpenEditor({ kind: 'fair' })} disabled={disabled} accessibilityLabel="More run options" />
      </View>
      <View style={styles.row}>
        <PadButton label="Wide" tone="extra" onPress={() => onOpenEditor({ kind: 'extra', ballType: 'wide', runsFrom: null })} disabled={disabled} />
        <PadButton label="No ball" tone="extra" onPress={() => onOpenEditor({ kind: 'extra', ballType: 'noBall', runsFrom: 'bat' })} disabled={disabled} />
        <PadButton label="Bye" tone="extra" onPress={() => onOpenEditor({ kind: 'extra', ballType: 'fair', runsFrom: 'byes' })} disabled={disabled} />
        <PadButton label="Leg bye" tone="extra" onPress={() => onOpenEditor({ kind: 'extra', ballType: 'fair', runsFrom: 'legByes' })} disabled={disabled} />
      </View>
      <View style={styles.row}>
        <PadButton label="WICKET" tone="wicket" onPress={() => onOpenEditor({ kind: 'wicket' })} disabled={disabled} />
        <PadButton label="Undo" tone="undo" onPress={onUndo} disabled={disabled || !canUndo} accessibilityLabel="Undo last action" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    paddingHorizontal: 4,
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  btnText: { fontSize: font.title, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  lightText: { color: colors.onPrimary },
});

const toneStyles = StyleSheet.create({
  plain: { backgroundColor: colors.surface, borderColor: colors.border },
  boundary: { backgroundColor: colors.primary, borderColor: colors.primary },
  extra: { backgroundColor: '#FFF4D6', borderColor: '#D9A400' },
  wicket: { backgroundColor: colors.danger, borderColor: colors.danger, flex: 2 },
  undo: { backgroundColor: colors.surface, borderColor: colors.textMuted },
});
