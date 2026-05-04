/**
 * NitroButton — Reliable tap-delta nitro system with per-car timing.
 *
 * How it works:
 *   Every tap measures the delta since the previous tap:
 *
 *     delta = now - lastTapTime
 *     delta < ORANGE_THRESHOLD  → Orange Nitro  (rapid double tap, ~<120 ms)
 *     delta < perfectWindow     → Perfect Nitro (second tap within car window)
 *     else                      → Yellow Nitro  (first tap / slow second tap)
 *
 * Why Pressable + onPressIn instead of TouchableOpacity + onPress?
 *   - onPressIn fires on finger-DOWN, not finger-UP (~80-120 ms earlier).
 *   - TouchableOpacity swallows rapid second taps on Android; Pressable does not.
 *   - Result: near-zero missed inputs even at 120+ ms round-trip Wi-Fi latency.
 *
 * Per-car timing (why it matters):
 *   Slow cars have long nitro animations → generous perfect window.
 *   Hypercars animate faster → the blue zone is tiny. Using one global window
 *   makes slow cars feel impossible and fast cars feel trivially easy.
 *   Setting perfectWindow per car matches the in-game blue zone duration.
 *
 * NitroType guide:
 *   yellow  — standard nitro burst (single tap)
 *   perfect — activated in the timing window (cyan flash)
 *   orange  — ultra-fast double tap (<120 ms), triggers orange boost in-game
 */

import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export type NitroType = 'yellow' | 'perfect' | 'orange';

/** ms — taps faster than this are classified as orange (rapid double tap) */
const ORANGE_THRESHOLD = 120;

/** ms — how long to display the result badge before resetting */
const DISPLAY_MS = 900;

type Visual = 'idle' | NitroType;

const PALETTE: Record<Visual, { border: string; bg: string; label: string; hint: string }> = {
  idle:    { border: '#fbbf24', bg: '#120d00', label: 'NITRO',     hint: 'tap = yellow' },
  yellow:  { border: '#f59e0b', bg: '#1f1400', label: 'YELLOW ⚡',  hint: 'yellow nitro!' },
  perfect: { border: '#06b6d4', bg: '#001822', label: 'PERFECT!',  hint: '✦ perfect nitro ✦' },
  orange:  { border: '#f97316', bg: '#1a0800', label: 'ORANGE 🔥', hint: 'orange nitro!' },
};

interface NitroButtonProps {
  onNitro: (type: NitroType) => void;
  borderColor?: string;
  backgroundColor?: string;
  /**
   * ms — second tap within this window triggers Perfect Nitro.
   * Per-car: slow cars ~500 ms, hypercars ~150 ms.
   * Default 300 ms (A class).
   */
  perfectWindow?: number;
}

export function NitroButton({
  onNitro,
  perfectWindow = 300,
}: NitroButtonProps) {
  const [visual, setVisual] = useState<Visual>('idle');

  const lastTapRef    = useRef<number>(0);
  const resetTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnScale      = useRef(new Animated.Value(1)).current;
  const ringScale     = useRef(new Animated.Value(1)).current;
  const ringOpacity   = useRef(new Animated.Value(0)).current;

  const haptic = (style: Haptics.ImpactFeedbackStyle) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(style).catch(() => {});
  };

  const showFeedback = (type: NitroType) => {
    setVisual(type);

    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setVisual('idle'), DISPLAY_MS);

    const scaleTarget = type === 'perfect' || type === 'orange' ? 1.10 : 0.88;
    Animated.sequence([
      Animated.timing(btnScale, {
        toValue: scaleTarget,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.spring(btnScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 70,
        bounciness: 8,
      }),
    ]).start();

    ringScale.setValue(1);
    ringOpacity.setValue(type === 'perfect' ? 1 : 0.75);
    Animated.parallel([
      Animated.timing(ringScale, {
        toValue: type === 'perfect' ? 2.4 : 1.8,
        duration: type === 'perfect' ? 500 : 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(ringOpacity, {
        toValue: 0,
        duration: type === 'perfect' ? 500 : 380,
        useNativeDriver: true,
      }),
    ]).start();
  };

  /**
   * Core tap handler — fires on finger-DOWN (onPressIn) for minimum latency.
   * Also wired to onPress as a web fallback; the dedup guard prevents double-fire.
   *
   * Timeline example (A class, perfectWindow=300 ms):
   *   t=0    tap 1 → delta=∞  → Yellow
   *   t=80   tap 2 → delta=80  → Orange  (< 120 ms)
   *   t=500  tap 1 → delta=∞  → Yellow
   *   t=720  tap 2 → delta=220 → Perfect (< 300 ms)
   *   t=1200 tap 1 → delta=∞  → Yellow
   *   t=1900 tap 2 → delta=700 → Yellow  (≥ 300 ms, new cycle)
   */
  const lastFiredRef = useRef<number>(0);

  const fire = () => {
    const now = Date.now();

    // Dedup: if already fired within 80ms (onPressIn fired and onPress also fires), skip
    if (now - lastFiredRef.current < 80) return;
    lastFiredRef.current = now;

    const prevTap = lastTapRef.current;
    lastTapRef.current = now;

    const delta = prevTap === 0 ? Infinity : now - prevTap;

    let type: NitroType;
    if (delta < ORANGE_THRESHOLD) {
      type = 'orange';
    } else if (delta < perfectWindow) {
      type = 'perfect';
    } else {
      type = 'yellow';
    }

    onNitro(type);
    showFeedback(type);

    switch (type) {
      case 'orange':
        haptic(Haptics.ImpactFeedbackStyle.Heavy);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        break;
      case 'perfect':
        haptic(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      default:
        haptic(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);

  const pal = PALETTE[visual];

  return (
    <View style={styles.wrapper}>
      {/* Expanding ring burst */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            borderColor: pal.border,
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
      />

      {/* Main button — onPressIn fires on finger-DOWN (instant); onPress is web fallback */}
      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        <TouchableOpacity
          onPressIn={fire}
          onPress={fire}
          activeOpacity={0.82}
          style={[
            styles.button,
            {
              backgroundColor: pal.bg,
              borderColor: pal.border,
              shadowColor: pal.border,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: visual === 'idle' ? 0.18 : 0.90,
              shadowRadius: visual === 'perfect' ? 22 : visual === 'orange' ? 18 : visual === 'yellow' ? 12 : 4,
              elevation: visual === 'idle' ? 2 : 10,
            },
          ]}
        >
          <Text style={[styles.icon, { color: pal.border }]}>⚡</Text>
          <Text style={[styles.label, { color: pal.border }]}>{pal.label}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Window size bar (visible in idle so user knows their timing) */}
      <View style={styles.barTrack}>
        {visual === 'idle' ? (
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.min(100, Math.round((perfectWindow / 600) * 100))}%`,
                backgroundColor: '#3b82f666',
              },
            ]}
          />
        ) : (
          <View
            style={[
              styles.barFill,
              { width: '100%', backgroundColor: pal.border + '99' },
            ]}
          />
        )}
      </View>

      {visual === 'idle' && (
        <Text style={styles.windowLabel}>window {perfectWindow} ms</Text>
      )}

      <Text style={[styles.hint, { color: pal.border + 'bb' }]}>{pal.hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 4,
    width: 130,
  },
  ring: {
    position: 'absolute',
    width: 134,
    height: 134,
    borderRadius: 67,
    borderWidth: 3,
    top: -14,
    zIndex: 20,
    pointerEvents: 'none',
  },
  button: {
    width: 106,
    height: 106,
    borderRadius: 18,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  icon: {
    fontSize: 22,
    lineHeight: 26,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  barTrack: {
    width: 106,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff14',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  windowLabel: {
    color: '#fbbf2455',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
});
