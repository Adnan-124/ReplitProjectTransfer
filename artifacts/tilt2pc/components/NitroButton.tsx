/**
 * NitroButton — Asphalt 9 nitro state machine with per-car timing.
 *
 * Props:
 *   perfectWindowStart — ms after first tap: perfect window opens  (default 320)
 *   perfectWindowEnd   — ms after first tap: perfect window closes  (default 600)
 *
 * These map to car classes in CAR_PROFILES (AppContext):
 *   C/D class:   320–950 ms   (very easy)
 *   B class:     320–750 ms
 *   A class:     320–600 ms   (default)
 *   S class:     320–480 ms   (narrow)
 *   S+ Hypercar: 320–390 ms   (~70ms window — very precise)
 *
 * State machine:
 *   idle → [tap] → yellow (0–perfectWindowStart)
 *                     │
 *         [start] ──► perfect_window ──[tap]──► perfect
 *                     │
 *           [end] ──► window_missed (yellow winding down)
 *
 * Visual:
 *   idle           — amber dim
 *   yellow         — amber glow, "window coming…"
 *   perfect_window — blue pulsing ring + countdown bar + "TAP NOW!"
 *   perfect        — cyan burst + "PERFECT!"
 *   window_missed  — muted grey
 */

import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type NitroType = 'yellow' | 'perfect';

type Phase = 'idle' | 'yellow' | 'perfect_window' | 'perfect' | 'window_missed';

interface NitroButtonProps {
  onNitro: (type: NitroType) => void;
  borderColor: string;
  backgroundColor: string;
  /** ms after first tap that the blue zone opens (default 320) */
  perfectWindowStart?: number;
  /** ms after first tap that the blue zone closes (default 600) */
  perfectWindowEnd?: number;
}

const YELLOW_DURATION = 2800;
const PERFECT_DURATION = 3500;

const PHASE_PALETTE: Record<Phase, { border: string; bg: string; label: string; hint: string }> = {
  idle:           { border: '#fbbf24', bg: '#120d00', label: 'NITRO',    hint: 'tap = yellow' },
  yellow:         { border: '#f59e0b', bg: '#1f1400', label: 'YELLOW',   hint: 'window coming…' },
  perfect_window: { border: '#3b82f6', bg: '#00102a', label: '▶ TAP ◀', hint: 'tap for PERFECT!' },
  perfect:        { border: '#06b6d4', bg: '#001822', label: 'PERFECT!', hint: '✦ perfect nitro ✦' },
  window_missed:  { border: '#78716c', bg: '#0f0f0f', label: 'NITRO',   hint: 'window missed' },
};

export function NitroButton({
  onNitro,
  perfectWindowStart = 320,
  perfectWindowEnd = 600,
}: NitroButtonProps) {
  const windowDuration = Math.max(1, perfectWindowEnd - perfectWindowStart);

  const [phase, setPhase] = useState<Phase>('idle');
  const [windowPct, setWindowPct] = useState(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const windowInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const windowStartRef = useRef(0);

  const btnScale  = useRef(new Animated.Value(1)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;

  const haptic = (style = Haptics.ImpactFeedbackStyle.Medium) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(style).catch(() => {});
  };

  const clearAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (windowInterval.current) {
      clearInterval(windowInterval.current);
      windowInterval.current = null;
    }
  };

  const resetIdle = () => {
    clearAll();
    setPhase('idle');
    setWindowPct(0);
    Animated.timing(glowAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start();
    Animated.timing(ringOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  };

  const openPerfectWindow = () => {
    setPhase('perfect_window');
    windowStartRef.current = Date.now();
    haptic(Haptics.ImpactFeedbackStyle.Light);

    if (windowInterval.current) clearInterval(windowInterval.current);
    windowInterval.current = setInterval(() => {
      const pct = Math.min(1, (Date.now() - windowStartRef.current) / windowDuration);
      setWindowPct(pct);
      if (pct >= 1 && windowInterval.current) {
        clearInterval(windowInterval.current);
        windowInterval.current = null;
      }
    }, 16);

    const pulse = () => {
      ringScale.setValue(1);
      ringOpacity.setValue(0.85);
      Animated.parallel([
        Animated.timing(ringScale, {
          toValue: 1.65,
          duration: Math.min(300, windowDuration / 2),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity, {
          toValue: 0,
          duration: Math.min(300, windowDuration / 2),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (timers.current.length > 0) {
          const t = setTimeout(pulse, 80);
          timers.current.push(t);
        }
      });
    };
    pulse();
  };

  const startYellow = () => {
    clearAll();
    setPhase('yellow');
    setWindowPct(0);
    onNitro('yellow');
    haptic(Haptics.ImpactFeedbackStyle.Heavy);

    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.86, duration: 70, useNativeDriver: true }),
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 60 }),
    ]).start();
    Animated.timing(glowAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();

    const t1 = setTimeout(openPerfectWindow, perfectWindowStart);
    const t2 = setTimeout(() => {
      setPhase('window_missed');
      if (windowInterval.current) { clearInterval(windowInterval.current); windowInterval.current = null; }
      setWindowPct(0);
      Animated.timing(glowAnim, { toValue: 0.3, duration: 300, useNativeDriver: true }).start();
    }, perfectWindowEnd);
    const t3 = setTimeout(resetIdle, YELLOW_DURATION);
    timers.current = [t1, t2, t3];
  };

  const firePerfect = () => {
    clearAll();
    setPhase('perfect');
    setWindowPct(0);
    onNitro('perfect');

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    ringScale.setValue(1);
    ringOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(ringScale, { toValue: 2.2, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(ringOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 1.08, duration: 100, useNativeDriver: true }),
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
    Animated.timing(glowAnim, { toValue: 1, duration: 100, useNativeDriver: true }).start();

    const t = setTimeout(resetIdle, PERFECT_DURATION);
    timers.current = [t];
  };

  const handleTap = () => {
    switch (phase) {
      case 'idle':
        startYellow();
        break;
      case 'yellow':
        // Too early — perfect window not open yet; ignore
        break;
      case 'perfect_window':
        firePerfect();
        break;
      case 'window_missed':
        resetIdle();
        { const t = setTimeout(startYellow, 80); timers.current = [t]; }
        break;
      case 'perfect':
        break;
    }
  };

  useEffect(() => () => clearAll(), []);

  const pal = PHASE_PALETTE[phase];

  return (
    <View style={styles.wrapper}>
      {/* Expanding ring */}
      <Animated.View
        style={[
          styles.ring,
          {
            borderColor: phase === 'perfect' ? '#06b6d4' : '#3b82f6',
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
        pointerEvents="none"
      />

      {/* Main button */}
      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        <TouchableOpacity
          onPress={handleTap}
          activeOpacity={0.88}
          style={[
            styles.button,
            {
              backgroundColor: pal.bg,
              borderColor: pal.border,
              shadowColor: pal.border,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: phase === 'idle' || phase === 'window_missed' ? 0.15 : 0.85,
              shadowRadius: phase === 'perfect' ? 22 : phase === 'yellow' || phase === 'perfect_window' ? 14 : 4,
              elevation: phase === 'idle' || phase === 'window_missed' ? 2 : 10,
            },
          ]}
        >
          {/* Lightning bolt icon */}
          <Text style={[styles.nitroIcon, { color: pal.border }]}>⚡</Text>
          <Text style={[styles.label, { color: pal.border }]}>{pal.label}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Perfect window countdown bar */}
      <View style={styles.barTrack}>
        {phase === 'perfect_window' ? (
          <View style={[styles.barFill, { width: `${(1 - windowPct) * 100}%`, backgroundColor: '#3b82f6' }]} />
        ) : phase === 'yellow' ? (
          <View style={[styles.barFill, { width: '100%', backgroundColor: '#f59e0baa' }]} />
        ) : null}
      </View>

      {/* Window size indicator (shown in idle so user knows timing) */}
      {phase === 'idle' && (
        <Text style={styles.windowLabel}>
          window: {windowDuration}ms
        </Text>
      )}

      {/* Phase hint */}
      <Text style={[styles.hint, { color: pal.border + 'aa' }]}>{pal.hint}</Text>
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
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    top: -10,
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
  nitroIcon: {
    fontSize: 22,
    lineHeight: 26,
  },
  label: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
    textAlign: 'center',
  },
  barTrack: {
    width: 106,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff18',
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
    color: '#fbbf2466',
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
