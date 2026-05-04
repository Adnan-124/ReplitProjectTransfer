/**
 * NitroButton — Tap-delta nitro system with long-press shockwave.
 *
 * SHORT PRESS (< 600 ms hold) — tap-delta classification:
 *   delta = time between current pressIn and previous pressIn
 *   delta < 120 ms        → Orange   (ultra-fast double tap)
 *   delta < perfectWindow → Perfect  (second tap in blue zone)
 *   else                  → Yellow   (single tap / slow second tap)
 *
 * LONG PRESS (≥ 600 ms hold) → Shockwave (activated when nitro bar is full)
 *
 * Per-car timing:
 *   C/D class  → 500 ms  (easy)
 *   B class    → 380 ms
 *   A class    → 300 ms  (default)
 *   S class    → 220 ms
 *   S+ Hypercar → 150 ms (tight)
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

export type NitroType = 'yellow' | 'perfect' | 'orange' | 'shockwave';

/** ms — taps faster than this → orange */
const ORANGE_THRESHOLD = 120;

/** ms — hold longer than this → shockwave */
const SHOCKWAVE_HOLD_MS = 600;

/** ms — how long to show the result badge */
const DISPLAY_MS = 900;

type Visual = 'idle' | 'charging' | NitroType;

const PALETTE: Record<Visual, { border: string; bg: string; label: string; hint: string }> = {
  idle:      { border: '#fbbf24', bg: '#120d00',  label: 'NITRO',        hint: 'tap · hold for ⚡⚡' },
  charging:  { border: '#a855f7', bg: '#0d0020',  label: 'HOLD…',        hint: 'release for shockwave' },
  yellow:    { border: '#f59e0b', bg: '#1f1400',  label: 'YELLOW ⚡',     hint: 'yellow nitro!' },
  perfect:   { border: '#06b6d4', bg: '#001822',  label: 'PERFECT!',     hint: '✦ perfect nitro ✦' },
  orange:    { border: '#f97316', bg: '#1a0800',  label: 'ORANGE 🔥',    hint: 'orange nitro!' },
  shockwave: { border: '#a855f7', bg: '#0d0020',  label: 'SHOCKWAVE ⚡⚡', hint: 'shockwave nitro!' },
};

interface NitroButtonProps {
  onNitro: (type: NitroType) => void;
  borderColor?: string;
  backgroundColor?: string;
  /** ms — second tap within this window = Perfect. Per-car, default 300 ms (A class). */
  perfectWindow?: number;
}

export function NitroButton({
  onNitro,
  perfectWindow = 300,
}: NitroButtonProps) {
  const [visual, setVisual] = useState<Visual>('idle');

  const lastTapRef        = useRef<number>(0);
  const pressStartRef     = useRef<number>(0);
  const shockwaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnScale          = useRef(new Animated.Value(1)).current;
  const ringScale         = useRef(new Animated.Value(1)).current;
  const ringOpacity       = useRef(new Animated.Value(0)).current;

  const haptic = (style: Haptics.ImpactFeedbackStyle) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(style).catch(() => {});
  };

  const showFeedback = (type: NitroType) => {
    setVisual(type);
    if (displayTimerRef.current) clearTimeout(displayTimerRef.current);
    displayTimerRef.current = setTimeout(() => setVisual('idle'), DISPLAY_MS);

    const scaleTarget = type === 'perfect' || type === 'orange' || type === 'shockwave' ? 1.12 : 0.88;
    Animated.sequence([
      Animated.timing(btnScale, { toValue: scaleTarget, duration: 55, useNativeDriver: true }),
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 70, bounciness: 8 }),
    ]).start();

    ringScale.setValue(1);
    const ringOpVal = type === 'perfect' ? 1 : type === 'shockwave' ? 1 : 0.75;
    ringOpacity.setValue(ringOpVal);
    Animated.parallel([
      Animated.timing(ringScale, {
        toValue: type === 'perfect' ? 2.6 : type === 'shockwave' ? 3.0 : 1.8,
        duration: type === 'perfect' ? 550 : type === 'shockwave' ? 700 : 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(ringOpacity, {
        toValue: 0,
        duration: type === 'perfect' ? 550 : type === 'shockwave' ? 700 : 380,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const fireTap = (pressStartTime: number) => {
    const prevTap = lastTapRef.current;
    lastTapRef.current = pressStartTime;

    const delta = prevTap === 0 ? Infinity : pressStartTime - prevTap;

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

  const fireShockwave = () => {
    onNitro('shockwave');
    showFeedback('shockwave');
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    // Reset tap delta so next tap is treated as fresh yellow
    lastTapRef.current = 0;
  };

  const handlePressIn = () => {
    const now = Date.now();
    pressStartRef.current = now;

    // Show charging state after 200 ms so user gets feedback that hold is registering
    setVisual('charging');

    // After SHOCKWAVE_HOLD_MS, fire shockwave
    shockwaveTimerRef.current = setTimeout(() => {
      shockwaveTimerRef.current = null;
      fireShockwave();
    }, SHOCKWAVE_HOLD_MS);
  };

  const handlePressOut = () => {
    if (shockwaveTimerRef.current) {
      // Held < SHOCKWAVE_HOLD_MS → short tap
      clearTimeout(shockwaveTimerRef.current);
      shockwaveTimerRef.current = null;
      fireTap(pressStartRef.current);
    }
    // If timer already fired → shockwave already dispatched, nothing to do
  };

  useEffect(() => () => {
    if (shockwaveTimerRef.current) clearTimeout(shockwaveTimerRef.current);
    if (displayTimerRef.current)   clearTimeout(displayTimerRef.current);
  }, []);

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

      {/* Main button */}
      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        <TouchableOpacity
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.82}
          style={[
            styles.button,
            {
              backgroundColor: pal.bg,
              borderColor: pal.border,
              shadowColor: pal.border,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: visual === 'idle' ? 0.18 : 0.90,
              shadowRadius:
                visual === 'perfect'   ? 22
                : visual === 'shockwave' ? 28
                : visual === 'orange'   ? 18
                : visual === 'yellow'   ? 12
                : visual === 'charging' ? 10 : 4,
              elevation: visual === 'idle' ? 2 : 10,
            },
          ]}
        >
          <Text style={[styles.icon, { color: pal.border }]}>⚡</Text>
          <Text style={[styles.label, { color: pal.border }]}>{pal.label}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Window size bar */}
      <View style={styles.barTrack}>
        {visual === 'idle' || visual === 'charging' ? (
          <View
            style={[
              styles.barFill,
              {
                width: visual === 'charging' ? '100%' : `${Math.min(100, Math.round((perfectWindow / 600) * 100))}%`,
                backgroundColor: visual === 'charging' ? '#a855f799' : '#3b82f666',
              },
            ]}
          />
        ) : (
          <View style={[styles.barFill, { width: '100%', backgroundColor: pal.border + '99' }]} />
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
