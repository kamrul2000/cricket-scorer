// Full-screen list of every delivery in the match, by innings and over, to choose one to edit.
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { inningsLabel } from '../../domain/format';
import type { MatchState } from '../../domain/scoring';
import { colors, font, spacing } from '../../theme/theme';
import { Button } from '../Button';
import { Chips } from '../Chips';
import { BallByBall } from '../scorecard/BallByBall';

interface Props {
  state: MatchState;
  onSelect: (eventIndex: number) => void;
  onClose: () => void;
}

export function BallPicker({ state, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(Math.max(0, state.innings.length - 1));
  const inn = state.innings[index];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: spacing.md + insets.top }]}>
          <Text style={styles.title}>Choose a ball to edit</Text>
          <Text style={styles.subtitle}>Later balls are kept and the score is worked out again.</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {state.innings.length > 1 ? (
            <Chips
              options={state.innings.map((i) => ({ value: i.index, label: `${i.battingTeam.name} · ${inningsLabel(i)}` }))}
              value={index}
              onChange={setIndex}
              accessibilityLabel="Choose innings"
            />
          ) : null}
          {inn ? <BallByBall state={state} inn={inn} onSelectBall={onSelect} /> : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}>
          <Button title="Close" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primary, padding: spacing.md, gap: 2 },
  title: { color: colors.onPrimary, fontSize: font.title, fontWeight: '800' },
  subtitle: { color: '#D5E8DF', fontSize: font.body, fontWeight: '600' },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
