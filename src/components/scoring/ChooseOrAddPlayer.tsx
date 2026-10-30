// A player choice that can also bring someone new into the lineup: the allowed lineup players,
// then roster players who are not in the match yet, then a box for a new name. Choosing anyone
// from outside the lineup first adds them to it (see useLineupAdder).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { LineupAdder } from '../../hooks/useLineupAdder';
import { colors, font, spacing } from '../../theme/theme';
import { NewPlayerField } from '../NewPlayerField';
import { PlayerPicker, type PickerPlayer } from '../PlayerPicker';
import { ErrorBanner } from '../StateViews';

interface Props {
  teamId: string;
  teamName: string;
  /** Lineup players, with a reason when they may not be chosen. */
  players: PickerPlayer[];
  adder: LineupAdder;
  saving: boolean;
  /** Records the choice (new batter, bowler, ...). Resolves to an error message or null. */
  onChoose: (playerId: string) => Promise<string | null>;
  /** e.g. "New batter's name". */
  newPlaceholder: string;
}

export function ChooseOrAddPlayer({ teamId, teamName, players, adder, saving, onChoose, newPlaceholder }: Props) {
  const [error, setError] = useState<string | null>(null);
  const extras = adder.extras(teamId);
  const slots = adder.slots(teamId);
  const choose = async (playerId: string) => {
    setError(null);
    const extra = extras.find((p) => p.playerId === playerId);
    if (extra) {
      const added = await adder.addExisting(teamId, extra);
      if (!added.ok) return setError(added.error);
    }
    setError(await onChoose(playerId));
  };
  const addNew = async (name: string) => {
    setError(null);
    const added = await adder.addNew(teamId, name);
    if (!added.ok) return added.error;
    return onChoose(added.playerId);
  };
  return (
    <View style={styles.wrap}>
      {error ? <ErrorBanner message={error} /> : null}
      <PlayerPicker
        players={[
          ...players,
          ...extras.map((p) => ({ ...p, detail: 'joins the lineup', disabledReason: saving ? 'Saving…' : null })),
        ]}
        selectedIds={[]}
        onToggle={(id) => void choose(id)}
      />
      {slots > 0 ? (
        <>
          <Text style={styles.help}>
            {slots === 1 ? '1 more player' : `${slots} more players`} can join the {teamName} lineup.
          </Text>
          <NewPlayerField placeholder={newPlaceholder} disabled={saving} onAdd={addNew} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  help: { fontSize: font.small, color: colors.textMuted, marginTop: spacing.xs },
});
