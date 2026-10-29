// The animated intro: the logo and app name with the developer credit, then our ground.
// Built with React Native's Animated API on the native driver (opacity and transforms only), so
// it stays smooth on low-end phones and needs no extra native library. Skippable at any time
// (Skip button or Android back). With "Remove animations" turned on, a still version is shown.
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_NAME, DEVELOPER } from '../../appInfo';

const LOGO = require('../../../assets/intro/logo.png');
const GLOW = require('../../../assets/intro/glow.png');
const BACKDROP = require('../../../assets/intro/backdrop.jpg');
const SCRIM = require('../../../assets/intro/scrim.png');
const PITCH = require('../../../assets/intro/ground-pitch.jpg');
const MATCH_1 = require('../../../assets/intro/ground-match-1.jpg');
const MATCH_2 = require('../../../assets/intro/ground-match-2.jpg');

/** Same colour as the native splash screen (app.json), so the hand-over is seamless. */
export const INTRO_BACKGROUND = '#073D2C';
const GOLD = '#F2B705';
const LOGO_ASPECT = 516 / 760;
const PANORAMA_ASPECT = 1440 / 596;

/** Timeline in milliseconds. */
const T = {
  ring: 250,
  title: 550,
  line: 800,
  credit: 1050,
  ground: 2600,
  caption: 3100,
  panoramas: 4600,
  exit: 6600,
  exitDuration: 600,
};

interface Props {
  onDone: () => void;
}

export function IntroOverlay({ onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [v] = useState(() => ({
    overlay: new Animated.Value(1),
    glowA: new Animated.Value(0),
    glowS: new Animated.Value(0.6),
    ringA: new Animated.Value(0),
    ringS: new Animated.Value(0.5),
    logoA: new Animated.Value(0),
    logoS: new Animated.Value(0.6),
    logoY: new Animated.Value(24),
    titleA: new Animated.Value(0),
    titleY: new Animated.Value(14),
    line: new Animated.Value(0),
    creditA: new Animated.Value(0),
    creditY: new Animated.Value(14),
    brandA: new Animated.Value(1),
    brandS: new Animated.Value(1),
    groundA: new Animated.Value(0),
    pitchS: new Animated.Value(1.2),
    labelA: new Animated.Value(0),
    labelY: new Animated.Value(12),
    captionA: new Animated.Value(0),
    captionY: new Animated.Value(16),
    panoA: new Animated.Value(0),
    card1X: new Animated.Value(width),
    card2X: new Animated.Value(-width),
    cardZoom: new Animated.Value(1.12),
    skipA: new Animated.Value(0),
  }));
  const main = useRef<Animated.CompositeAnimation | null>(null);
  const finished = useRef(false);
  const started = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  const skip = () => {
    if (finished.current) return;
    main.current?.stop();
    Animated.timing(v.overlay, { toValue: 0, duration: 250, useNativeDriver: true }).start(finish);
  };

  const start = () => {
    if (started.current) return;
    started.current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (finished.current) return;
      if (reduce) {
        // A still title card instead of motion.
        for (const value of [v.logoA, v.logoS, v.titleA, v.line, v.creditA, v.skipA]) value.setValue(1);
        for (const value of [v.logoY, v.titleY, v.creditY]) value.setValue(0);
        main.current = Animated.timing(v.overlay, { toValue: 0, duration: 300, delay: 1800, useNativeDriver: true });
        main.current.start(({ finished: done }) => done && finish());
        return;
      }
      const out = Easing.out(Easing.cubic);
      const t = (value: Animated.Value, toValue: number, duration: number, delay = 0, easing = out) =>
        Animated.timing(value, { toValue, duration, delay, easing, useNativeDriver: true });
      main.current = Animated.parallel([
        t(v.skipA, 1, 400, 600),
        // 1. Logo, glow and ring pulse.
        t(v.glowA, 0.55, 900),
        t(v.glowS, 1.1, 1400),
        t(v.logoA, 1, 500),
        t(v.logoY, 0, 700),
        Animated.spring(v.logoS, { toValue: 1, friction: 6, tension: 50, useNativeDriver: true }),
        t(v.ringS, 2.3, 1200, T.ring),
        Animated.sequence([t(v.ringA, 0.9, 120, T.ring), t(v.ringA, 0, 1080)]),
        // 2. App name, gold line, developer credit.
        t(v.titleA, 1, 450, T.title),
        t(v.titleY, 0, 450, T.title),
        t(v.line, 1, 450, T.line),
        t(v.creditA, 1, 500, T.credit),
        t(v.creditY, 0, 500, T.credit),
        // 3. Cross-fade to the ground with a slow zoom (Ken Burns).
        t(v.brandA, 0, 600, T.ground, Easing.inOut(Easing.quad)),
        t(v.brandS, 1.08, 700, T.ground, Easing.in(Easing.quad)),
        t(v.groundA, 1, 700, T.ground - 50, Easing.inOut(Easing.quad)),
        t(v.pitchS, 1.03, 2600, T.ground - 50, Easing.inOut(Easing.quad)),
        t(v.labelA, 1, 400, T.caption),
        t(v.labelY, 0, 400, T.caption),
        t(v.captionA, 1, 500, T.caption + 150),
        t(v.captionY, 0, 500, T.caption + 150),
        // 4. The match panoramas slide in over a blurred backdrop.
        t(v.panoA, 1, 500, T.panoramas, Easing.inOut(Easing.quad)),
        t(v.card1X, 0, 700, T.panoramas + 100),
        t(v.card2X, 0, 700, T.panoramas + 300),
        t(v.cardZoom, 1, 1900, T.panoramas + 100, Easing.out(Easing.quad)),
        // 5. Fade into the app.
        t(v.overlay, 0, T.exitDuration, T.exit, Easing.inOut(Easing.quad)),
      ]);
      main.current.start(({ finished: done }) => done && finish());
    });
  };

  useEffect(() => {
    // Start even if the logo's load event never arrives.
    const fallback = setTimeout(start, 400);
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      skip();
      return true;
    });
    return () => {
      clearTimeout(fallback);
      back.remove();
      main.current?.stop();
    };
    // start and skip only read refs and stable animated values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoH = Math.min(190, height * 0.22);
  const glowSize = logoH * 2.4;
  const ringSize = logoH * 1.05;
  const cardW = width - 32;
  const cardH = cardW / PANORAMA_ASPECT;

  return (
    <Animated.View
      style={[styles.root, { opacity: v.overlay }]}
      accessible
      accessibilityLabel={`${APP_NAME}. Developed by ${DEVELOPER.name}. Our iconic ground.`}
    >
      {/* Scene 1: brand */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: v.brandA, transform: [{ scale: v.brandS }] }]}>
        <Image source={BACKDROP} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.center}>
          <View style={{ width: glowSize, height: logoH * 1.1, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.Image
              source={GLOW}
              style={{ position: 'absolute', width: glowSize, height: glowSize, opacity: v.glowA, transform: [{ scale: v.glowS }] }}
            />
            <Animated.View
              style={[
                styles.ring,
                { width: ringSize, height: ringSize, borderRadius: ringSize / 2, opacity: v.ringA, transform: [{ scale: v.ringS }] },
              ]}
            />
            <Animated.Image
              source={LOGO}
              onLoadEnd={start}
              style={{
                width: logoH * LOGO_ASPECT,
                height: logoH,
                opacity: v.logoA,
                transform: [{ translateY: v.logoY }, { scale: v.logoS }],
              }}
            />
          </View>
          <Animated.Text style={[styles.title, { opacity: v.titleA, transform: [{ translateY: v.titleY }] }]}>
            {APP_NAME.toUpperCase()}
          </Animated.Text>
          <Animated.View style={[styles.line, { transform: [{ scaleX: v.line }] }]} />
          <Animated.View style={{ alignItems: 'center', opacity: v.creditA, transform: [{ translateY: v.creditY }] }}>
            <Text style={styles.creditLabel}>DEVELOPED BY</Text>
            <Text style={styles.creditName}>{DEVELOPER.name}</Text>
            <Text style={styles.creditRole}>
              {DEVELOPER.role} · {DEVELOPER.company}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>

      {/* Scene 2: the ground */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.clip, { opacity: v.groundA }]}>
        <Animated.Image source={PITCH} style={[StyleSheet.absoluteFill, { transform: [{ scale: v.pitchS }] }]} resizeMode="cover" />
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: v.panoA }]}>
          <Image source={MATCH_2} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={12} />
          <View style={[StyleSheet.absoluteFill, styles.dim]} />
          <View style={[styles.cards, { top: height * 0.17 }]}>
            {[
              { source: MATCH_1, x: v.card1X },
              { source: MATCH_2, x: v.card2X },
            ].map((c, i) => (
              <Animated.View key={i} style={[styles.card, { width: cardW, height: cardH, transform: [{ translateX: c.x }] }]}>
                <Animated.Image
                  source={c.source}
                  style={{ width: cardW, height: cardH, transform: [{ scale: v.cardZoom }] }}
                  resizeMode="cover"
                />
              </Animated.View>
            ))}
          </View>
        </Animated.View>
        <Image source={SCRIM} style={[styles.scrim, { height: height * 0.5 }]} resizeMode="stretch" />
        <View style={[styles.brandTag, { top: insets.top + 14 }]}>
          <Image source={LOGO} style={{ width: 22 * LOGO_ASPECT, height: 22 }} />
          <Text style={styles.brandTagText}>{APP_NAME}</Text>
        </View>
        <View style={[styles.caption, { bottom: insets.bottom + 48 }]}>
          <Animated.Text style={[styles.captionLabel, { opacity: v.labelA, transform: [{ translateY: v.labelY }] }]}>
            WHERE IT ALL HAPPENS
          </Animated.Text>
          <Animated.Text style={[styles.captionTitle, { opacity: v.captionA, transform: [{ translateY: v.captionY }] }]}>
            Our Iconic Ground
          </Animated.Text>
          <Animated.View style={[styles.captionLine, { opacity: v.captionA }]} />
        </View>
      </Animated.View>

      <Animated.View style={[styles.skipWrap, { top: insets.top + 10, opacity: v.skipA }]}>
        <Pressable onPress={skip} accessibilityRole="button" accessibilityLabel="Skip intro" hitSlop={12} style={styles.skip}>
          <Text style={styles.skipText}>Skip ›</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: INTRO_BACKGROUND, zIndex: 100, elevation: 100 },
  clip: { overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 14 },
  ring: { position: 'absolute', borderWidth: 2, borderColor: GOLD },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', letterSpacing: 4, textAlign: 'center', marginTop: 10 },
  line: { width: 72, height: 3, borderRadius: 2, backgroundColor: GOLD },
  creditLabel: { color: '#9FD4BE', fontSize: 11, fontWeight: '800', letterSpacing: 3, marginTop: 6 },
  creditName: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 4, textAlign: 'center' },
  creditRole: { color: '#CFE3DA', fontSize: 13, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  dim: { backgroundColor: 'rgba(2, 22, 15, 0.55)' },
  cards: { position: 'absolute', left: 16, right: 16, gap: 14 },
  card: { borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', backgroundColor: '#0B2A1F' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%' },
  brandTag: { position: 'absolute', left: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandTagText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 1, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  caption: { position: 'absolute', left: 24, right: 24, alignItems: 'flex-start' },
  captionLabel: { color: GOLD, fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  captionTitle: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', marginTop: 4 },
  captionLine: { width: 56, height: 3, borderRadius: 2, backgroundColor: GOLD, marginTop: 10 },
  skipWrap: { position: 'absolute', right: 14 },
  skip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  skipText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
