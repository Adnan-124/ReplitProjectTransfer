/**
 * NitroButton — tap-delta nitro (yellow / perfect / orange) + long-press shockwave.
 *
 * Platform strategy:
 *   Native (Android/iOS): TouchableOpacity with onPressIn + onPressOut — proven to work.
 *   Web: bare View with native DOM mousedown/mouseup/touchstart/touchend attached via
 *        a ref in useEffect — bypasses React Native Web's broken event handling
 *        inside the Replit iframe sandbox.
 *
 * SHORT PRESS (<600 ms hold):
 *   delta = pressIn-time − previous-pressIn-time
 *   delta < 120 ms        → orange   (ultra-fast double tap)
 *   delta < perfectWindow → perfect  (second tap in blue zone)
 *   else                  → yellow   (single / slow tap)
 *
 * LONG PRESS (≥600 ms hold) → shockwave
 */

import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const ORANGE_THRESHOLD  = 120;   // ms
const SHOCKWAVE_HOLD_MS = 600;   // ms
const DISPLAY_MS        = 900;   // ms

type Visual = 'idle' | 'charging' | NitroType;

const PALETTE: Record<Visual, { border: string; bg: string; label: string; hint: string }> = {
  idle:      { border: '#fbbf24', bg: '#120d00', label: 'NITRO',         hint: 'tap · hold 0.6s=⚡⚡' },
  charging:  { border: '#a855f7', bg: '#0d0020', label: 'HOLD…',         hint: 'release = shockwave' },
  yellow:    { border: '#f59e0b', bg: '#1f1400', label: 'YELLOW ⚡',      hint: 'yellow nitro!' },
  perfect:   { border: '#06b6d4', bg: '#001822', label: 'PERFECT!',      hint: '✦ perfect nitro ✦' },
  orange:    { border: '#f97316', bg: '#1a0800', label: 'ORANGE 🔥',     hint: 'orange nitro!' },
  shockwave: { border: '#a855f7', bg: '#0d0020', label: 'SHOCKWAVE ⚡⚡',  hint: 'shockwave nitro!' },
};

interface NitroButtonProps {
  onNitro: (type: NitroType) => void;
  borderColor?: string;
  backgroundColor?: string;
  /** ms — second tap in this window → perfect. Per-car, default 300 ms (A class). */
  perfectWindow?: number;
}

export function NitroButton({ onNitro, perfectWindow = 300 }: NitroButtonProps) {
  const [visual, setVisual] = useState<Visual>('idle');

  // Refs so DOM event handlers (captured in closure) always see current values
  const perfectWindowRef = useRef(perfectWindow);
  const onNitroRef       = useRef(onNitro);
  useEffect(() => { perfectWindowRef.current = perfectWindow; }, [perfectWindow]);
  useEffect(() => { onNitroRef.current = onNitro; }, [onNitro]);

  const lastTapRef     = useRef<number>(0);
  const pressStartRef  = useRef<number>(0);
  const shockwaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewRef     = useRef<View>(null);

  const btnScale   = useRef(new Animated.Value(1)).current;
  const ringScale  = useRef(new Animated.Value(1)).current;
  const ringOpacity= useRef(new Animated.Value(0)).current;

  const haptic = (style: Haptics.ImpactFeedbackStyle) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(style).catch(() => {});
  };

  const showFeedback = useCallback((type: NitroType) => {
    setVisual(type);
    if (displayTimer.current) clearTimeout(displayTimer.current);
    displayTimer.current = setTimeout(() => setVisual('idle'), DISPLAY_MS);

    const big = type === 'perfect' || type === 'orange' || type === 'shockwave';
    Animated.sequence([
      Animated.timing(btnScale, { toValue: big ? 1.12 : 0.88, duration: 55, useNativeDriver: true }),
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 70, bounciness: 8 }),
    ]).start();

    ringScale.setValue(1);
    ringOpacity.setValue(type === 'perfect' || type === 'shockwave' ? 1 : 0.75);
    const dur = type === 'shockwave' ? 700 : type === 'perfect' ? 550 : 380;
    const to  = type === 'shockwave' ? 3.0 : type === 'perfect' ? 2.6 : 1.8;
    Animated.parallel([
      Animated.timing(ringScale,    { toValue: to,  duration: dur, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(ringOpacity,  { toValue: 0,   duration: dur, useNativeDriver: true }),
    ]).start();
  }, [btnScale, ringScale, ringOpacity]);

  const fireTap = useCallback((pressStartTime: number) => {
    const prev = lastTapRef.current;
    lastTapRef.current = pressStartTime;
    const delta = prev === 0 ? Infinity : pressStartTime - prev;

    let type: NitroType;
    if      (delta < ORANGE_THRESHOLD)          type = 'orange';
    else if (delta < perfectWindowRef.current)  type = 'perfect';
    else                                        type = 'yellow';

    onNitroRef.current(type);
    showFeedback(type);

    if (type === 'orange') {
      haptic(Haptics.ImpactFeedbackStyle.Heavy);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else if (type === 'perfect') {
      haptic(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      haptic(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [showFeedback]);

  const fireShockwave = useCallback(() => {
    onNitroRef.current('shockwave');
    showFeedback('shockwave');
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    lastTapRef.current = 0;
  }, [showFeedback]);

  const handlePressIn = useCallback(() => {
    const now = Date.now();
    pressStartRef.current = now;
    setVisual('charging');
    if (shockwaveTimer.current) clearTimeout(shockwaveTimer.current);
    shockwaveTimer.current = setTimeout(() => {
      shockwaveTimer.current = null;
      fireShockwave();
    }, SHOCKWAVE_HOLD_MS);
  }, [fireShockwave]);

  const handlePressOut = useCallback(() => {
    if (shockwaveTimer.current) {
      clearTimeout(shockwaveTimer.current);
      shockwaveTimer.current = null;
      fireTap(pressStartRef.current);
    }
    // If timer already fired → shockwave dispatched, nothing to do
  }, [fireTap]);

  // ── Web: raw DOM events (bypasses RN Web's broken iframe event handling) ──
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = webViewRef.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== 'function') return;

    const onDown = (e: Event) => { e.preventDefault(); handlePressIn(); };
    const onUp   = (e: Event) => { e.preventDefault(); handlePressOut(); };

    el.addEventListener('mousedown',  onDown);
    el.addEventListener('mouseup',    onUp);
    el.addEventListener('touchstart', onDown, { passive: false });
    el.addEventListener('touchend',   onUp,   { passive: false });

    return () => {
      el.removeEventListener('mousedown',  onDown);
      el.removeEventListener('mouseup',    onUp);
      el.removeEventListener('touchstart', onDown);
      el.removeEventListener('touchend',   onUp);
    };
  }, [handlePressIn, handlePressOut]);

  useEffect(() => () => {
    if (shockwaveTimer.current) clearTimeout(shockwaveTimer.current);
    if (displayTimer.current)   clearTimeout(displayTimer.current);
  }, []);

  const pal = PALETTE[visual];

  const buttonStyle = [
    styles.button,
    {
      backgroundColor: pal.bg,
      borderColor:     pal.border,
      shadowColor:     pal.border,
      shadowOffset:    { width: 0, height: 0 } as const,
      shadowOpacity:   visual === 'idle' ? 0.18 : 0.90,
      shadowRadius:    visual === 'shockwave' ? 28 : visual === 'perfect' ? 22 : visual === 'orange' ? 18 : visual === 'yellow' ? 12 : visual === 'charging' ? 10 : 4,
      elevation:       visual === 'idle' ? 2 : 10,
    },
  ];

  const buttonContent = (
    <>
      <Text style={[styles.icon,  { color: pal.border }]}>⚡</Text>
      <Text style={[styles.label, { color: pal.border }]}>{pal.label}</Text>
    </>
  );

  return (
    <View style={styles.wrapper}>
      {/* Ring burst */}
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { borderColor: pal.border, opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
      />

      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        {Platform.OS === 'web' ? (
          // Web: bare View with DOM events wired in useEffect
          <View
            ref={webViewRef}
            style={[...buttonStyle, styles.webButton]}
          >
            {buttonContent}
          </View>
        ) : (
          // Native: TouchableOpacity (proven reliable on Android/iOS)
          <TouchableOpacity
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={0.82}
            style={buttonStyle}
          >
            {buttonContent}
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* Timing bar */}
      <View style={styles.barTrack}>
        {visual === 'idle' || visual === 'charging' ? (
          <View style={[styles.barFill, {
            width: visual === 'charging'
              ? '100%'
              : `${Math.min(100, Math.round((perfectWindow / 600) * 100))}%`,
            backgroundColor: visual === 'charging' ? '#a855f799' : '#3b82f666',
          }]} />
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
  wrapper: { alignItems: 'center', gap: 4, width: 130 },
  ring: {
    position: 'absolute',
    width: 134, height: 134, borderRadius: 67,
    borderWidth: 3, top: -14, zIndex: 20, pointerEvents: 'none',
  },
  button: {
    width: 106, height: 106, borderRadius: 18,
    borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  webButton: {
    cursor: 'pointer' as any,
    userSelect: 'none' as any,
  },
  icon:  { fontSize: 22, lineHeight: 26 },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  barTrack: {
    width: 106, height: 4, borderRadius: 2,
    backgroundColor: '#ffffff14', overflow: 'hidden',
  },
  barFill: {
    height: '100%', borderRadius: 2, position: 'absolute', left: 0, top: 0,
  },
  windowLabel: { color: '#fbbf2455', fontSize: 8, fontWeight: '700', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 8, fontWeight: '700', letterSpacing: 1.5, textAlign: 'center' },
});
