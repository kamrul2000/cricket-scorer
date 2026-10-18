// Upcoming-match posters: two original cricket-themed templates drawn with plain views
// (no external images or fonts), captured to a 1080 x 1350 PNG.
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TeamLogo } from '../TeamLogo';

export const POSTER_SIZE = { width: 360, height: 450 };
/** Export size in pixels (4:5, a common size for sharing). */
export const POSTER_EXPORT = { width: 1080, height: 1350 };

export type PosterTemplate = 'pitch' | 'floodlights';
export const POSTER_TEMPLATES: { value: PosterTemplate; label: string }[] = [
  { value: 'pitch', label: 'Pitch green' },
  { value: 'floodlights', label: 'Floodlights' },
];

export interface PosterTeam {
  name: string;
  logoFile: string | null;
}

export interface PosterProps {
  template: PosterTemplate;
  teamA: PosterTeam;
  teamB: PosterTeam;
  date: string; // already formatted
  time: string;
  venue: string;
  format: string;
  appName: string;
}

/** Three stumps with bails, drawn with views. */
function Stumps({ color, height = 46 }: { color: string; height?: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 2 }}>
        <View style={{ width: 12, height: 3, backgroundColor: color, borderRadius: 2 }} />
        <View style={{ width: 12, height: 3, backgroundColor: color, borderRadius: 2 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 4, height, backgroundColor: color, borderRadius: 2 }} />
        ))}
      </View>
    </View>
  );
}

/** A cricket ball: a red circle with a seam. */
function Ball({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#B3261E', overflow: 'hidden', justifyContent: 'center' }}>
      <View style={{ height: 2, backgroundColor: '#F5E6C8', transform: [{ rotate: '-30deg' }] }} />
    </View>
  );
}

function PitchPoster(p: PosterProps) {
  return (
    <View style={[styles.poster, { backgroundColor: '#0B6E4F' }]}>
      {/* Mown-grass stripes */}
      {Array.from({ length: 9 }, (_, i) => (
        <View key={i} style={[styles.stripe, { top: i * 50, backgroundColor: i % 2 ? '#0D7A57' : '#0B6E4F' }]} />
      ))}
      <View style={styles.pitchTop}>
        <Text style={styles.kicker}>MATCH DAY</Text>
        <View style={styles.formatPill}>
          <Text style={styles.formatPillText}>{p.format}</Text>
        </View>
      </View>
      <View style={styles.faceOff}>
        <TeamBlock team={p.teamA} ring="#FFFFFF" text="#FFFFFF" />
        <View style={styles.vsCircle}>
          <Text style={styles.vsText}>VS</Text>
        </View>
        <TeamBlock team={p.teamB} ring="#FFFFFF" text="#FFFFFF" />
      </View>
      <View style={styles.infoCard}>
        <Text style={styles.infoDate}>{p.date}</Text>
        <Text style={styles.infoTime}>{p.time}</Text>
        {p.venue ? (
          <Text style={styles.infoVenue} numberOfLines={1}>
            {p.venue}
          </Text>
        ) : null}
      </View>
      <View style={styles.pitchStumps}>
        <Stumps color="#F5E6C8" />
      </View>
      <View style={styles.pitchBall}>
        <Ball size={26} />
      </View>
      <Text style={[styles.brand, { color: '#CFE3DA' }]}>{p.appName}</Text>
    </View>
  );
}

function FloodlightsPoster(p: PosterProps) {
  return (
    <View style={[styles.poster, { backgroundColor: '#0D1B2A' }]}>
      {/* Floodlight glows */}
      <View style={[styles.glow, { left: -70, top: -70 }]} />
      <View style={[styles.glow, { right: -70, top: -70 }]} />
      {/* Gold diagonal band */}
      <View style={styles.band} />
      <Text style={styles.nightKicker}>UNDER THE LIGHTS</Text>
      <View style={styles.nightTeamA}>
        <TeamBlock team={p.teamA} ring="#F2B705" text="#FFFFFF" />
      </View>
      <View style={styles.nightVs}>
        <Text style={styles.nightVsText}>VS</Text>
      </View>
      <View style={styles.nightTeamB}>
        <TeamBlock team={p.teamB} ring="#F2B705" text="#FFFFFF" />
      </View>
      <View style={styles.nightInfo}>
        <Text style={styles.nightFormat}>{p.format.toUpperCase()}</Text>
        <Text style={styles.nightDate}>{p.date}</Text>
        <Text style={styles.nightDate}>{p.time}</Text>
        {p.venue ? (
          <Text style={styles.nightVenue} numberOfLines={2}>
            {p.venue}
          </Text>
        ) : null}
      </View>
      <View style={styles.nightStumps}>
        <Stumps color="#F2B705" height={36} />
      </View>
      <Text style={[styles.brand, { color: '#8FA3B8' }]}>{p.appName}</Text>
    </View>
  );
}

function TeamBlock({ team, ring, text }: { team: PosterTeam; ring: string; text: string }) {
  return (
    <View style={styles.teamBlock}>
      <View style={[styles.logoRing, { borderColor: ring }]}>
        <TeamLogo name={team.name} logoFile={team.logoFile} size={88} background="#F2B705" foreground="#0D1B2A" />
      </View>
      <Text style={[styles.teamName, { color: text }]} numberOfLines={2}>
        {team.name}
      </Text>
    </View>
  );
}

export const MatchPoster = forwardRef<View, PosterProps>(function MatchPoster(props, ref) {
  return (
    <View ref={ref} collapsable={false} style={POSTER_SIZE}>
      {props.template === 'pitch' ? <PitchPoster {...props} /> : <FloodlightsPoster {...props} />}
    </View>
  );
});

const styles = StyleSheet.create({
  poster: { width: POSTER_SIZE.width, height: POSTER_SIZE.height, overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, right: 0, height: 50 },
  brand: { position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  teamBlock: { alignItems: 'center', width: 120, gap: 8 },
  logoRing: { borderWidth: 4, borderRadius: 52, padding: 4 },
  teamName: { fontSize: 18, fontWeight: '900', textAlign: 'center' },

  // Pitch green
  pitchTop: { alignItems: 'center', marginTop: 26, gap: 8 },
  kicker: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: 6 },
  formatPill: { backgroundColor: '#F2B705', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  formatPillText: { color: '#073D2C', fontWeight: '900', fontSize: 13 },
  faceOff: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 26, gap: 6 },
  vsCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#F2B705', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
  vsText: { color: '#073D2C', fontSize: 20, fontWeight: '900' },
  infoCard: { position: 'absolute', left: 30, right: 30, bottom: 36, backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  infoDate: { color: '#073D2C', fontSize: 18, fontWeight: '900' },
  infoTime: { color: '#0B6E4F', fontSize: 16, fontWeight: '800' },
  infoVenue: { color: '#4F5D56', fontSize: 13, fontWeight: '600', marginTop: 2 },
  pitchStumps: { position: 'absolute', right: 16, top: 18, opacity: 0.9 },
  pitchBall: { position: 'absolute', left: 18, top: 24 },

  // Floodlights
  glow: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#FFE082', opacity: 0.16 },
  band: { position: 'absolute', left: -60, right: -60, top: 196, height: 64, backgroundColor: '#F2B705', transform: [{ rotate: '-12deg' }] },
  nightKicker: { color: '#F2B705', fontSize: 14, fontWeight: '900', letterSpacing: 5, textAlign: 'center', marginTop: 22 },
  // Team A top-left, team B lower-right, with the band and "VS" between them; the details sit
  // bottom-left, kept narrower than the space beside team B so long venue names cannot overlap.
  nightTeamA: { position: 'absolute', left: 28, top: 50 },
  nightTeamB: { position: 'absolute', right: 28, top: 236 },
  nightVs: { position: 'absolute', left: 0, right: 0, top: 204, alignItems: 'center' },
  nightVsText: { color: '#0D1B2A', fontSize: 38, fontWeight: '900', fontStyle: 'italic', transform: [{ rotate: '-12deg' }] },
  nightInfo: { position: 'absolute', left: 24, bottom: 30, width: 176, gap: 2 },
  nightFormat: { color: '#F2B705', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  nightDate: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  nightVenue: { color: '#C9D6E3', fontSize: 13, fontWeight: '600' },
  nightStumps: { position: 'absolute', right: 44, top: 78 },
});
