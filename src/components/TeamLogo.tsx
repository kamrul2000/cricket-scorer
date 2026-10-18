// A team's logo in a circle, or the team's initials when it has no logo.
import { Image, StyleSheet, Text, View } from 'react-native';

import { logoUri } from '../files/logoFiles';
import { colors } from '../theme/theme';

export function teamInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

interface Props {
  name: string;
  logoFile: string | null | undefined;
  size?: number;
  /** Colours for the initials circle (posters use their own palette). */
  background?: string;
  foreground?: string;
}

export function TeamLogo({ name, logoFile, size = 48, background = colors.primary, foreground = colors.onPrimary }: Props) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (logoFile) {
    return (
      <Image
        source={{ uri: logoUri(logoFile) }}
        style={[styles.image, box]}
        resizeMode="contain"
        accessibilityLabel={`${name} logo`}
      />
    );
  }
  return (
    <View style={[styles.initials, box, { backgroundColor: background }]} accessibilityLabel={`${name} (no logo)`}>
      <Text style={{ color: foreground, fontWeight: '800', fontSize: size * 0.38 }}>{teamInitials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surface },
  initials: { alignItems: 'center', justifyContent: 'center' },
});
