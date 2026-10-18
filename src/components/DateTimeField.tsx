// Date and time chooser using Android's own date and time dialogs.
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { StyleSheet, Text, View } from 'react-native';

import { formatMatchDate, formatMatchTime } from '../domain/schedule';
import { colors, font, spacing } from '../theme/theme';
import { Button } from './Button';

interface Props {
  label: string;
  /** ISO timestamp. */
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
}

export function DateTimeField({ label, value, onChange, disabled }: Props) {
  const open = (mode: 'date' | 'time') =>
    DateTimePickerAndroid.open({
      value: new Date(value),
      mode,
      is24Hour: false,
      onValueChange: (_event, picked) => {
        // Keep the part that was not being edited.
        const next = new Date(value);
        if (mode === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
        else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
        onChange(next.toISOString());
      },
    });

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button title={formatMatchDate(value)} variant="secondary" onPress={() => open('date')} disabled={disabled} />
        </View>
        <View style={styles.flex}>
          <Button title={formatMatchTime(value)} variant="secondary" onPress={() => open('time')} disabled={disabled} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: font.body, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
