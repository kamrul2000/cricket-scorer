// A search box for filtering a list as you type, with a button that clears it.
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, font, MIN_TOUCH, radius, spacing } from '../theme/theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
}

export function SearchField({ value, onChangeText, placeholder, accessibilityLabel }: Props) {
  return (
    <View style={styles.box}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        accessibilityLabel={accessibilityLabel}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear}>
          <Text style={styles.clearText}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, minHeight: MIN_TOUCH, paddingHorizontal: spacing.md, fontSize: font.body, color: colors.text },
  clear: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  clearText: { fontSize: font.body, fontWeight: '700', color: colors.textMuted },
});
