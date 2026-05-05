/**
 * NitroButton
 *
 * WEB (Replit / sandboxed iframe):
 *   Pressable.onPress == React onClick — the same proven path used by every
 *   other button in the app (TouchableOpacity home-screen buttons).
 *   onPressIn / onPressOut / onLongPress all go through the Responder system
 *   which is silently broken in sandboxed iframes — they are NOT used on web.
 *   A document-level mousedown capture listener runs in parallel to show the
 *   charging state and fire shockwave on long hold.
 *
 * NATIVE (iOS / Android):
 *   Pressable.onPressIn + onPressOut for precise timing.
 *   600 ms hold fires shockwave via setTimeout.
 *
 * 'use no memo' — disables the React Compiler for this component so that
 * state updates inside event callbacks always trigger a re-render.
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
const NITRO_ID          = 'tilt2pc-nitro-btn'; // nativeID → HTML id on web

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
  perfectWindow?: number;
}

export function NitroButton({ onNitro, perfectWindow = 300 }: NitroButtonProps) {
  'use no memo';

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

  const classify = useCallback((tapTime: number): NitroType => {
    const prev = lastTapRef.current;
    lastTapRef.current = tapTime;
    const delta = prev === 0 ? Infinity : tapTime - prev;
    if (delta < ORANGE_THRESHOLD)          return 'orange';
    if (delta < perfectWindowRef.current)  return 'perfect';
    return 'yellow';
  }, []);

  const fireTap = useCallback((tapTime: number) => {
    const type = classify(tapTime);
    onNitroRef.current(type);
    showFeedback(type);
    haptic(type === 'yellow' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
  }, [classify, showFeedback]);

  const fireShockwave = useCallback(() => {
    onNitroRef.current('shockwave');
    showFeedback('shockwave');
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
    lastTapRef.current = 0;
  }, [showFeedback]);

  // ── NATIVE: onPressIn / onPressOut ──────────────────────────────────────────
  const handleNativePressIn = useCallback(() => {
    const now = Date.now();
    pressStartRef.current = now;
    setVisual('charging');
    if (shockwaveTimer.current) clearTimeout(shockwaveTimer.current);
    shockwaveTimer.current = setTimeout(() => {
      shockwaveTimer.current = null;
      fireShockwave();
    }, SHOCKWAVE_HOLD_MS);
  }, [fireShockwave]);

  const handleNativePressOut = useCallback(() => {
    if (shockwaveTimer.current) {
      clearTimeout(shockwaveTimer.current);
      shockwaveTimer.current = null;
      fireTap(pressStartRef.current);
    }
  }, [fireTap]);

  // ── WEB: onPress (= React onClick, always works) ────────────────────────────
  // Fires after each click release. Delta between consecutive calls is used for
  // orange / perfect / yellow classification (equivalent to press-start delta
  // for normal game tapping speeds).
  const handleWebPress = useCallback(() => {
    const now = Date.now();
    console.log('[NitroButton] onPress fired', now);

    // Cancel any pending shockwave (started by the document mousedown listener)
    if (shockwaveTimer.current) {
      clearTimeout(shockwaveTimer.current);
      shockwaveTimer.current = null;
    }
    isPressedRef.current = false;
    setVisual('idle');

    fireTap(now);
  }, [fireTap]);

  // ── WEB: document-level mousedown capture (charging + shockwave) ────────────
  // Attaches at the document capture phase — fires before React's Responder
  // system and before react-native-gesture-handler can intercept it.
  // This provides the "charging" visual and shockwave on long hold.
  // If mousedown is blocked (very restricted sandbox), onPress above still
  // correctly classifies all taps without charging feedback.
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onDown = (e: MouseEvent) => {
      const el = document.getElementById(NITRO_ID);
      if (!el || !el.contains(e.target as Node)) return;
      if (isPressedRef.current) return;
      isPressedRef.current = true;

      console.log('[NitroButton] mousedown captured');
      setVisual('charging');

      if (shockwaveTimer.current) clearTimeout(shockwaveTimer.current);
      shockwaveTimer.current = setTimeout(() => {
        shockwaveTimer.current = null;
        isPressedRef.current = false;
        console.log('[NitroButton] shockwave fired');
        fireShockwave();
      }, SHOCKWAVE_HOLD_MS);
    };

    const onUp = () => { isPressedRef.current = false; };

    document.addEventListener('mousedown', onDown, { capture: true });
    document.addEventListener('mouseup',   onUp,   { capture: true });
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('mouseup',   onUp,   true);
    };
  }, [fireShockwave]);

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
      <Animated.View
        style={[
          styles.ring,
          {
            pointerEvents: 'none',
            borderColor:   pal.border,
            opacity:       ringOpacity,
            transform:     [{ scale: ringScale }],
          },
        ]}
      />

      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        <Pressable
          nativeID={NITRO_ID}
          onPressIn={Platform.OS !== 'web' ? handleNativePressIn  : undefined}
          onPressOut={Platform.OS !== 'web' ? handleNativePressOut : undefined}
          onPress={Platform.OS === 'web'    ? handleWebPress       : undefined}
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
