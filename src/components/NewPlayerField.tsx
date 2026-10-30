// A one-line form for adding a new player by name: a text box and an Add button.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, font, MIN_TOUCH, radius, spacing } from '../theme/theme';

interface Props {
  /** Read out by screen readers and shown as the placeholder. */
  placeholder: string;
  disabled?: boolean;
  /** Resolves to an error message to show, or null when the player was added. */
  onAdd: (name: string) => Promise<string | null>;
}

export function NewPlayerField({ placeholder, disabled, onAdd }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = name.trim().length > 0 && !disabled && !busy;

  const add = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const problem = await onAdd(name.trim());
      if (problem) setError(problem);
      else setName('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder={placeholder}
          accessibilityLabel={placeholder}
          placeholderTextColor={colors.textMuted}
          maxLength={60}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => void add()}
          editable={!disabled && !busy}
          style={[styles.input, !!error && styles.inputError]}
        />
        <Pressable
          onPress={ready ? () => void add() : undefined}
          accessibilityRole="button"
          accessibilityLabel={`Add ${name.trim() || 'player'}`}
          accessibilityState={{ disabled: !ready, busy }}
          style={({ pressed }) => [styles.button, !ready && styles.buttonOff, pressed && styles.pressed]}
        >
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>＋ Add</Text>}
        </Pressable>
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: font.body,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  button: {
    minHeight: MIN_TOUCH,
    minWidth: 84,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOff: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  buttonText: { color: colors.onPrimary, fontSize: font.body, fontWeight: '800' },
  error: { color: colors.danger, fontSize: font.small, fontWeight: '600' },
});
