// Choose opening striker, non-striker and bowler. Used in match setup and at the innings break.
// When a lineup still has free places, players from outside it (roster players, or a new name)
// can be chosen too: the caller puts them into the lineup when the innings starts.
import { StyleSheet, Text, View } from 'react-native';

import type { TeamLineup } from '../domain/match';
import { colors, font, spacing } from '../theme/theme';
import { NewPlayerField } from './NewPlayerField';
import { PlayerPicker } from './PlayerPicker';

export interface Openers {
  strikerId: string | null;
  nonStrikerId: string | null;
  bowlerId: string | null;
}

interface Joiner {
  playerId: string;
  name: string;
}

type Side = 'batting' | 'bowling';

interface Props {
  batting: TeamLineup;
  bowling: TeamLineup;
  value: Openers;
  onChange: (value: Openers) => void;
  /** Players who may not be chosen, with the reason (Super Over eligibility). */
  unavailable?: ReadonlyMap<string, string>;
  /** Players outside each lineup who may join it, and the free places in each lineup. */
  joiners?: { batting: Joiner[]; bowling: Joiner[]; battingSlots: number; bowlingSlots: number };
  /** Creates a new player on the team's roster; they are then chosen for that role. */
  onCreatePlayer?: (side: Side, name: string) => Promise<{ ok: true; player: Joiner } | { ok: false; error: string }>;
  disabled?: boolean;
}

export function OpenersPicker({ batting, bowling, value, onChange, unavailable, joiners, onCreatePlayer, disabled }: Props) {
  const team = (side: Side) => (side === 'batting' ? batting : bowling);
  const inLineup = (side: Side, id: string | null) => !!id && team(side).players.some((p) => p.playerId === id);

  const section = (role: keyof Openers, side: Side, title: string, partnerId: string | null) => {
    const selected = value[role];
    // Places left for this role: the free places, less one if the partner also joins from outside.
    const slots = side === 'batting' ? (joiners?.battingSlots ?? 0) : (joiners?.bowlingSlots ?? 0);
    const room = slots - (partnerId && !inLineup(side, partnerId) ? 1 : 0) > 0;
    const outsiders = (joiners?.[side] ?? []).filter((p) => room || p.playerId === selected);
    const reason = (id: string) => unavailable?.get(id) ?? (id === partnerId ? 'Already chosen' : null);
    const players = [
      ...team(side).players.map((p) => ({ ...p, disabledReason: reason(p.playerId) })),
      ...outsiders.map((p) => ({ ...p, detail: 'joins the lineup', disabledReason: reason(p.playerId) })),
    ];
    return (
      <>
        <Text style={styles.heading}>{title}</Text>
        {players.length ? (
          <PlayerPicker players={players} selectedIds={selected ? [selected] : []} onToggle={(id) => onChange({ ...value, [role]: id })} />
        ) : (
          <Text style={styles.help}>No players named yet. Add one below.</Text>
        )}
        {onCreatePlayer && room ? (
          <NewPlayerField
            placeholder={side === 'batting' ? 'New batter’s name' : 'New bowler’s name'}
            disabled={disabled}
            onAdd={async (name) => {
              const r = await onCreatePlayer(side, name);
              if (!r.ok) return r.error;
              onChange({ ...value, [role]: r.player.playerId });
              return null;
            }}
          />
        ) : null}
      </>
    );
  };

  return (
    <View style={styles.wrap}>
      {section('strikerId', 'batting', `Striker (faces the first ball) · ${batting.name}`, value.nonStrikerId)}
      {section('nonStrikerId', 'batting', `Non-striker · ${batting.name}`, value.strikerId)}
      {section('bowlerId', 'bowling', `Opening bowler · ${bowling.name}`, null)}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  heading: { fontSize: font.large, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  help: { fontSize: font.small, color: colors.textMuted },
});
