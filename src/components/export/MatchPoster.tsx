// Upcoming-match posters: original cricket-themed templates drawn with plain views and
// gradients (no external images or fonts), captured to a 1080 x 1350 PNG.
import { forwardRef, type ComponentType } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { TeamLogo } from '../TeamLogo';

export const POSTER_SIZE = { width: 360, height: 450 };
/** Export size in pixels (4:5, a common size for sharing). */
export const POSTER_EXPORT = { width: 1080, height: 1350 };

export type PosterTemplate = 'pitch' | 'floodlights' | 'versus' | 'classic' | 'primetime';
export const POSTER_TEMPLATES: { value: PosterTemplate; label: string }[] = [
  { value: 'pitch', label: 'Pitch green' },
  { value: 'floodlights', label: 'Floodlights' },
  { value: 'versus', label: 'Head to head' },
  { value: 'classic', label: 'Classic' },
  { value: 'primetime', label: 'Prime time' },
];

// Fonts every Android phone has built in; iOS gets its nearest system font.
const CONDENSED = Platform.select({ ios: 'AvenirNextCondensed-Bold', default: 'sans-serif-condensed' });
const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

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

/** Date and time side by side, then the venue: the details block of the newer templates. */
function InfoGrid({ p, label, rule, venue }: { p: PosterProps; label: string; rule: string; venue: string }) {
  return (
    <View>
      <View style={styles.infoRow}>
        <View style={styles.infoCell}>
          <Text style={[styles.infoLabel, { color: label }]}>DATE</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {p.date}
          </Text>
        </View>
        <View style={[styles.infoDivider, { backgroundColor: rule }]} />
        <View style={styles.infoCell}>
          <Text style={[styles.infoLabel, { color: label }]}>TIME</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {p.time}
          </Text>
        </View>
      </View>
      {p.venue ? (
        <>
          <View style={[styles.infoRule, { backgroundColor: rule }]} />
          <View style={styles.infoVenueRow}>
            <Text style={[styles.infoLabel, { color: label }]}>VENUE</Text>
            <Text style={[styles.infoVenueText, { color: venue }]} numberOfLines={1}>
              {p.venue}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function VersusPoster(p: PosterProps) {
  return (
    <View style={[styles.poster, styles.vsPoster]}>
      {/* Blue and red halves split by a white slash through the "VS" */}
      <View style={[styles.vsHalf, styles.vsSlash]} />
      <View style={[styles.vsHalf, styles.vsRed]} />
      <View style={[styles.vsGlow, { left: -1 }]} />
      <View style={[styles.vsGlow, { left: 181 }]} />
      <View style={styles.vsTopBar}>
        <Text style={styles.vsKicker}>UPCOMING MATCH</Text>
        <View style={styles.vsFormatPill}>
          <Text style={styles.vsFormatText} numberOfLines={1}>
            {p.format.toUpperCase()}
          </Text>
        </View>
        <View style={[styles.vsGoldLine, { bottom: 0 }]} />
      </View>
      <View style={styles.vsTeams}>
        <VersusTeam team={p.teamA} initials="#1E3A8A" />
        <VersusTeam team={p.teamB} initials="#991B1B" />
      </View>
      <View style={styles.vsBadge}>
        <Text style={styles.vsBadgeText}>VS</Text>
      </View>
      <View style={styles.vsBottomBar}>
        <View style={[styles.vsGoldLine, { top: 0 }]} />
        <InfoGrid p={p} label="#FACC15" rule="rgba(255,255,255,0.14)" venue="#E5E7EB" />
      </View>
      <Text style={[styles.brand, { color: '#6B7280', bottom: 6 }]}>{p.appName}</Text>
    </View>
  );
}

function VersusTeam({ team, initials }: { team: PosterTeam; initials: string }) {
  return (
    <View style={styles.wideTeam}>
      <View style={styles.vsLogoRing}>
        <TeamLogo name={team.name} logoFile={team.logoFile} size={96} background="#FFFFFF" foreground={initials} />
      </View>
      <Text style={[styles.condensedName, styles.vsName]} numberOfLines={2}>
        {team.name.toUpperCase()}
      </Text>
    </View>
  );
}

function ClassicPoster(p: PosterProps) {
  return (
    <View style={[styles.poster, styles.classicPoster]}>
      <View style={styles.classicOuterFrame} />
      <View style={styles.classicInnerFrame} />
      <View style={[styles.classicDiamond, { left: 13, top: 13 }]} />
      <View style={[styles.classicDiamond, { right: 13, top: 13 }]} />
      <View style={[styles.classicDiamond, { left: 13, bottom: 13 }]} />
      <View style={[styles.classicDiamond, { right: 13, bottom: 13 }]} />
      <View style={styles.classicContent}>
        <View style={styles.centered}>
          <View style={styles.classicOrnament}>
            <View style={[styles.classicRule, { width: 54 }]} />
            <Ball size={18} />
            <View style={[styles.classicRule, { width: 54 }]} />
          </View>
          <Text style={styles.classicKicker}>MATCH DAY</Text>
          <Text style={styles.classicFormat} numberOfLines={1}>
            {p.format}
          </Text>
        </View>
        <View style={styles.classicTeams}>
          <ClassicLogo team={p.teamA} />
          <Text style={styles.classicName} numberOfLines={2}>
            {p.teamA.name}
          </Text>
          <View style={styles.classicOrnament}>
            <View style={[styles.classicRule, { width: 36 }]} />
            <Text style={styles.classicVersus}>versus</Text>
            <View style={[styles.classicRule, { width: 36 }]} />
          </View>
          <Text style={styles.classicName} numberOfLines={2}>
            {p.teamB.name}
          </Text>
          <ClassicLogo team={p.teamB} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.classicWhen} numberOfLines={1}>
            {p.date} · {p.time}
          </Text>
          {p.venue ? (
            <Text style={styles.classicVenue} numberOfLines={1}>
              {p.venue}
            </Text>
          ) : null}
          <Text style={styles.classicBrand}>{p.appName.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

function ClassicLogo({ team }: { team: PosterTeam }) {
  return (
    <View style={styles.classicLogoRing}>
      <TeamLogo name={team.name} logoFile={team.logoFile} size={44} background="#7A1E2B" foreground="#F6F0E1" />
    </View>
  );
}

const RING_SIZES = [200, 290, 380, 470];

function PrimeTimePoster(p: PosterProps) {
  return (
    <View style={[styles.poster, styles.ptPoster]}>
      <View style={styles.ptGlow} />
      {/* Stadium rings around the "VS" */}
      {RING_SIZES.map((size, i) => (
        <View
          key={size}
          style={[
            styles.ptRing,
            { width: size, height: size, borderRadius: size / 2, left: 180 - size / 2, top: 184 - size / 2, borderColor: `rgba(255,255,255,${[0.16, 0.11, 0.08, 0.06][i]})` },
          ]}
        />
      ))}
      <View style={[styles.ptStreak, { top: 36 }]} />
      <View style={[styles.ptStreak, { top: 388 }]} />
      <View style={styles.ptTop}>
        <Text style={styles.ptTitle}>MATCH DAY</Text>
        <View style={styles.ptFormatPill}>
          <Text style={styles.ptFormatText} numberOfLines={1}>
            {p.format.toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.ptTeams}>
        <PrimeTimeTeam team={p.teamA} />
        <PrimeTimeTeam team={p.teamB} />
      </View>
      <View style={styles.ptDiamond}>
        <Text style={styles.ptDiamondText}>VS</Text>
      </View>
      <View style={styles.ptInfoCard}>
        <InfoGrid p={p} label="#F9A8D4" rule="rgba(255,255,255,0.18)" venue="#FFFFFF" />
      </View>
      <Text style={[styles.brand, { color: 'rgba(255,255,255,0.7)', bottom: 12 }]}>{p.appName}</Text>
    </View>
  );
}

function PrimeTimeTeam({ team }: { team: PosterTeam }) {
  return (
    <View style={styles.wideTeam}>
      <View style={styles.ptLogoHalo}>
        <TeamLogo name={team.name} logoFile={team.logoFile} size={92} background="#FFFFFF" foreground="#6D28D9" />
      </View>
      <Text style={[styles.condensedName, styles.ptName]} numberOfLines={2}>
        {team.name.toUpperCase()}
      </Text>
    </View>
  );
}

const RENDERERS: Record<PosterTemplate, ComponentType<PosterProps>> = {
  pitch: PitchPoster,
  floodlights: FloodlightsPoster,
  versus: VersusPoster,
  classic: ClassicPoster,
  primetime: PrimeTimePoster,
};

export const MatchPoster = forwardRef<View, PosterProps>(function MatchPoster(props, ref) {
  const Poster = RENDERERS[props.template];
  return (
    <View ref={ref} collapsable={false} style={POSTER_SIZE}>
      <Poster {...props} />
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

  // Shared by the newer templates
  centered: { alignItems: 'center' },
  wideTeam: { width: 140, alignItems: 'center', gap: 10 },
  condensedName: { fontFamily: CONDENSED, color: '#FFFFFF', fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 },
  infoRow: { flexDirection: 'row' },
  infoCell: { flex: 1 },
  infoLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  infoValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginTop: 2 },
  infoDivider: { width: 1, marginHorizontal: 16 },
  infoRule: { height: 1, marginVertical: 10 },
  infoVenueRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoVenueText: { flex: 1, fontSize: 13, fontWeight: '600' },

  // Head to head: the panels are rotated about their centres so the slash crosses the
  // logos' midline at x = 180, under the "VS" badge.
  vsPoster: { backgroundColor: '#1A3591', experimental_backgroundImage: 'linear-gradient(135deg, #0F1F5C 0%, #2547B8 100%)' },
  vsHalf: { position: 'absolute', top: -150, width: 420, height: 750, transform: [{ rotate: '12deg' }] },
  vsSlash: { left: 167, backgroundColor: '#FFFFFF' },
  vsRed: { left: 173, backgroundColor: '#B91C1C', experimental_backgroundImage: 'linear-gradient(135deg, #E23A3A 0%, #8E1414 100%)' },
  vsGlow: {
    position: 'absolute',
    top: 81,
    width: 180,
    height: 180,
    borderRadius: 90,
    experimental_backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 70%)',
  },
  vsTopBar: { position: 'absolute', left: 0, right: 0, top: 0, height: 76, backgroundColor: '#0B1020', alignItems: 'center', paddingTop: 16, paddingHorizontal: 16 },
  vsGoldLine: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: '#FACC15' },
  vsKicker: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 5 },
  vsFormatPill: { backgroundColor: '#FACC15', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 3, marginTop: 8 },
  vsFormatText: { color: '#0B1020', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  vsTeams: { position: 'absolute', top: 116, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18 },
  vsLogoRing: { borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 999, padding: 4 },
  vsName: { fontSize: 20, lineHeight: 23, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  vsBadge: {
    position: 'absolute',
    top: 141,
    left: 150,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0B1020',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsBadgeText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', fontStyle: 'italic' },
  vsBottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 116, backgroundColor: '#0B1020', paddingTop: 18, paddingHorizontal: 22 },

  // Classic
  classicPoster: { backgroundColor: '#F6F0E1', experimental_backgroundImage: 'linear-gradient(180deg, #FBF7EC 0%, #EFE5CF 100%)' },
  classicOuterFrame: { position: 'absolute', left: 12, top: 12, right: 12, bottom: 12, borderWidth: 1.5, borderColor: '#7A1E2B' },
  classicInnerFrame: { position: 'absolute', left: 17, top: 17, right: 17, bottom: 17, borderWidth: 0.75, borderColor: '#B08D57' },
  classicDiamond: { position: 'absolute', width: 8, height: 8, backgroundColor: '#B08D57', transform: [{ rotate: '45deg' }] },
  classicContent: {
    position: 'absolute',
    left: 17,
    top: 17,
    right: 17,
    bottom: 17,
    paddingTop: 18,
    paddingBottom: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  classicOrnament: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  classicRule: { height: 1, backgroundColor: '#B08D57' },
  classicKicker: { fontFamily: SERIF, color: '#7A1E2B', fontSize: 13, fontWeight: '700', letterSpacing: 6, marginTop: 10 },
  classicFormat: { fontFamily: SERIF, color: '#3B2F25', fontSize: 14, fontStyle: 'italic', marginTop: 2 },
  classicTeams: { alignItems: 'center', gap: 6 },
  classicLogoRing: { borderWidth: 1.5, borderColor: '#7A1E2B', borderRadius: 999, padding: 2 },
  classicName: { fontFamily: SERIF, color: '#2B2118', fontSize: 22, lineHeight: 26, fontWeight: '700', textAlign: 'center', maxWidth: 270 },
  classicVersus: { fontFamily: SERIF, color: '#7A1E2B', fontSize: 15, fontStyle: 'italic' },
  classicWhen: { fontFamily: SERIF, color: '#2B2118', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  classicVenue: { fontFamily: SERIF, color: '#5B4A3A', fontSize: 13, fontStyle: 'italic', marginTop: 2, maxWidth: 290 },
  classicBrand: { color: '#B08D57', fontSize: 8, fontWeight: '700', letterSpacing: 2, marginTop: 8 },

  // Prime time
  ptPoster: {
    backgroundColor: '#4C1D95',
    experimental_backgroundImage: 'linear-gradient(160deg, #1E0B4B 0%, #5B21B6 50%, #C026D3 85%, #DB2777 100%)',
  },
  ptGlow: {
    position: 'absolute',
    left: -60,
    top: 0,
    width: 480,
    height: 380,
    experimental_backgroundImage: 'radial-gradient(circle at 50% 48%, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 55%)',
  },
  ptRing: { position: 'absolute', borderWidth: 1 },
  ptStreak: { position: 'absolute', left: -80, width: 560, height: 2, backgroundColor: 'rgba(255,255,255,0.1)', transform: [{ rotate: '-18deg' }] },
  ptTop: { alignItems: 'center', marginTop: 18, paddingHorizontal: 16 },
  ptTitle: {
    fontFamily: CONDENSED,
    color: '#FFFFFF',
    fontSize: 50,
    lineHeight: 56,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  ptFormatPill: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 3, marginTop: 4 },
  ptFormatText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  ptTeams: { position: 'absolute', top: 128, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  ptLogoHalo: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ptName: { fontSize: 19, lineHeight: 22 },
  ptDiamond: {
    position: 'absolute',
    top: 161,
    left: 157,
    width: 46,
    height: 46,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  ptDiamondText: { color: '#7C3AED', fontSize: 17, fontWeight: '900', fontStyle: 'italic', transform: [{ rotate: '-45deg' }] },
  ptInfoCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 34,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
});
