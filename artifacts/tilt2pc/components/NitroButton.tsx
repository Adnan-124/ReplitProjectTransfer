/**
 * NitroButton — tap-delta nitro + long-press shockwave.
 *
 * Tap classification:
 *   Δt < 120 ms        → orange   (ultra-fast double tap)
 *   Δt < perfectWindow → perfect  (second tap in blue zone)
 *   else               → yellow   (single / slow tap)
 *   hold ≥ 600 ms      → shockwave
 *
 * Native (Android/iOS): Pressable onPressIn/onPressOut via React responder.
 * Web: document-level capture listeners (fire before React/RNGH can intercept).
 *      Also keeps Pressable callbacks as belt-and-suspenders.
 */

import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type NitroType = 'yellow' | 'perfect' | 'orange' | 'shockwave';

const ORANGE_THRESHOLD  = 120;   // ms
const SHOCKWAVE_HOLD_MS = 600;   // ms
const DISPLAY_MS        = 900;   // ms

type Visual = 'idle' | 'charging' | NitroType;

const PALETTE: Record<Visual, { border: string; bg: string; label: string; hint: string }> = {
  idle:      { border: '#fbbf24', bg: '#120d00', label: 'NITRO',          hint: 'tap · hold 0.6s=⚡⚡' },
  charging:  { border: '#a855f7', bg: '#0d0020', label: 'HOLD…',          hint: 'release=shockwave' },
  yellow:    { border: '#f59e0b', bg: '#1f1400', label: 'YELLOW ⚡',       hint: 'yellow nitro!' },
  perfect:   { border: '#06b6d4', bg: '#001822', label: 'PERFECT!',       hint: '✦ perfect nitro ✦' },
  orange:    { border: '#f97316', bg: '#1a0800', label: 'ORANGE 🔥',      hint: 'orange nitro!' },
  shockwave: { border: '#a855f7', bg: '#0d0020', label: 'SHOCKWAVE ⚡⚡',   hint: 'shockwave nitro!' },
};

interface NitroButtonProps {
  onNitro: (type: NitroType) => void;
  borderColor?: string;
  backgroundColor?: string;
  perfectWindow?: number;
}

export function NitroButton({ onNitro, perfectWindow = 300 }: NitroButtonProps) {
  const [visual, setVisual] = useState<Visual>('idle');

  const perfectWindowRef = useRef(perfectWindow);
  const onNitroRef       = useRef(onNitro);
  useEffect(() => { perfectWindowRef.current = perfectWindow; }, [perfectWindow]);
  useEffect(() => { onNitroRef.current = onNitro; }, [onNitro]);

  const lastTapRef     = useRef<number>(0);
  const pressStartRef  = useRef<number>(0);
  const shockwaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPressedRef   = useRef(false);

  // Ref to the Pressable's underlying DOM element (web only)
  const pressableRef = useRef<View>(null);

  const btnScale    = useRef(new Animated.Value(1)).current;
  const ringScale   = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

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
      Animated.timing(ringScale,   { toValue: to, duration: dur, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(ringOpacity, { toValue: 0,  duration: dur, useNativeDriver: true }),
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
    haptic(type === 'yellow' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
  }, [showFeedback]);

  const fireShockwave = useCallback(() => {
    onNitroRef.current('shockwave');
    showFeedback('shockwave');
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
    lastTapRef.current = 0;
  }, [showFeedback]);

  // ── Core press handlers (used by both native Pressable and web DOM) ─────────
  const handlePressIn = useCallback(() => {
    if (isPressedRef.current) return;
    isPressedRef.current = true;
    const now = Date.now();
    pressStartRef.current = now;
    setVisual('charging');
    if (shockwaveTimer.current) clearTimeout(shockwaveTimer.current);
    shockwaveTimer.current = setTimeout(() => {
      shockwaveTimer.current = null;
      isPressedRef.current = false;
      fireShockwave();
    }, SHOCKWAVE_HOLD_MS);
  }, [fireShockwave]);

  const handlePressOut = useCallback(() => {
    if (!isPressedRef.current) return;
    isPressedRef.current = false;
    if (shockwaveTimer.current) {
      clearTimeout(shockwaveTimer.current);
      shockwaveTimer.current = null;
      fireTap(pressStartRef.current);
    }
  }, [fireTap]);

  // ── Web: document-level CAPTURE listeners ────────────────────────────────────
  // Using capture phase at document root ensures we fire before React's responder
  // system and react-native-gesture-handler, both of which can silently swallow
  // mousedown events in sandboxed iframes.
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onDown = (e: MouseEvent) => {
      const el = pressableRef.current as unknown as HTMLElement | null;
      if (!el) return;
      if (!el.contains(e.target as Node)) return;
      console.log('[NitroButton] ▼ mousedown captured at document level');
      handlePressIn();
    };

    const onUp = (e: MouseEvent) => {
      if (!isPressedRef.current) return;
      console.log('[NitroButton] ▲ mouseup captured at document level');
      handlePressOut();
    };

    const onTouchStart = (e: TouchEvent) => {
      const el = pressableRef.current as unknown as HTMLElement | null;
      if (!el) return;
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!target || !el.contains(target)) return;
      console.log('[NitroButton] ▼ touchstart captured at document level');
      handlePressIn();
    };

    const onTouchEnd = () => {
      if (!isPressedRef.current) return;
      console.log('[NitroButton] ▲ touchend captured at document level');
      handlePressOut();
    };

    document.addEventListener('mousedown',  onDown,      { capture: true });
    document.addEventListener('mouseup',    onUp,        { capture: true });
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend',   onTouchEnd,   { capture: true, passive: true });

    return () => {
      document.removeEventListener('mousedown',  onDown,      true);
      document.removeEventListener('mouseup',    onUp,        true);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchend',   onTouchEnd,   true);
    };
  }, [handlePressIn, handlePressOut]);

  useEffect(() => () => {
    if (shockwaveTimer.current) clearTimeout(shockwaveTimer.current);
    if (displayTimer.current)   clearTimeout(displayTimer.current);
  }, []);

  const pal = PALETTE[visual];
  const shadowRadius =
    visual === 'shockwave' ? 28 :
    visual === 'perfect'   ? 22 :
    visual === 'orange'    ? 18 :
    visual === 'yellow'    ? 12 :
    visual === 'charging'  ? 10 : 4;

  return (
    <View style={styles.wrapper}>
      {/* Ring burst — must not intercept events */}
      <Animated.View
        style={[
          styles.ring,
          { pointerEvents: 'none', borderColor: pal.border, opacity: ringOpacity, transform: [{ scale: ringScale }] },
        ]}
      />

      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        <Pressable
          ref={pressableRef}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[
            styles.button,
            {
              backgroundColor: pal.bg,
              borderColor:     pal.border,
              shadowColor:     pal.border,
              shadowOffset:    { width: 0, height: 0 },
              shadowOpacity:   visual === 'idle' ? 0.18 : 0.90,
              shadowRadius,
              elevation:       visual === 'idle' ? 2 : 10,
            },
          ]}
        >
          <Text style={[styles.icon,  { color: pal.border }]}>⚡</Text>
          <Text style={[styles.label, { color: pal.border }]}>{pal.label}</Text>
        </Pressable>
      </Animated.View>

      {/* Timing bar */}
      <View style={styles.barTrack}>
        <View style={[
          styles.barFill,
          {
            width: visual === 'idle'
              ? `${Math.min(100, Math.round((perfectWindow / 600) * 100))}%`
              : '100%',
            backgroundColor:
              visual === 'charging' ? '#a855f799' :
              visual === 'idle'     ? '#3b82f666' :
              pal.border + '99',
          },
        ]} />
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
    borderWidth: 3, top: -14, zIndex: 20,
  },
  button: {
    width: 106, height: 106, borderRadius: 18,
    borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', gap: 2,
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
  windowLabel: { color: '#fbbf2455', fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  hint: { fontSize: 8, fontWeight: '700', letterSpacing: 1.5, textAlign: 'center' },
});
