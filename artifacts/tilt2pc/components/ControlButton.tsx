import * as Haptics from 'expo-haptics';
import React, { useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ControlButtonProps {
  label: string;
  color: string;
  size?: 'small' | 'medium' | 'large';
  onDown?: () => void;
  onUp?: () => void;
  onPress?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  continuous?: boolean;
  disabled?: boolean;
}

const DOUBLE_TAP_WINDOW = 280;
const LONG_PRESS_DELAY = 500;
const CONTINUOUS_INTERVAL = 80;

export function ControlButton({
  label,
  color,
  size = 'medium',
  onDown,
  onUp,
  onPress,
  onDoubleTap,
  onLongPress,
  continuous = false,
  disabled = false,
}: ControlButtonProps) {
  const [pressed, setPressed] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const lastTapRef = useRef(0);
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const continuousTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const haptic = (style = Haptics.ImpactFeedbackStyle.Medium) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(style).catch(() => {});
    }
  };

  const handlePressIn = () => {
    if (disabled) return;
    setPressed(true);
    haptic();
    Animated.spring(scaleAnim, { toValue: 0.88, useNativeDriver: true, speed: 80 }).start();

    // Fire down immediately — zero delay
    onDown?.();

    // Long press detection
    longPressTimerRef.current = setTimeout(() => {
      onLongPress?.();
      haptic(Haptics.ImpactFeedbackStyle.Heavy);
    }, LONG_PRESS_DELAY);

    // Continuous hold mode (DRIFT, BRAKE)
    if (continuous) {
      continuousTimerRef.current = setInterval(() => onDown?.(), CONTINUOUS_INTERVAL);
    }
  };

  const handlePressOut = () => {
    if (disabled) return;
    setPressed(false);
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 80 }).start();

    // Fire up immediately — zero delay
    onUp?.();

    // Clear hold timers
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (continuousTimerRef.current) {
      clearInterval(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }

    // If no double-tap handler: fire onPress IMMEDIATELY, no delay at all
    if (!onDoubleTap) {
      onPress?.();
      return;
    }

    // Double-tap detection only for buttons that need it (NITRO → Shockwave)
    const now = Date.now();
    const gap = now - lastTapRef.current;

    if (gap < DOUBLE_TAP_WINDOW && lastTapRef.current > 0) {
      // Double tap confirmed
      if (doubleTapTimerRef.current) {
        clearTimeout(doubleTapTimerRef.current);
        doubleTapTimerRef.current = null;
      }
      onDoubleTap();
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      lastTapRef.current = 0;
    } else {
      // Wait briefly to see if second tap comes
      lastTapRef.current = now;
      doubleTapTimerRef.current = setTimeout(() => {
        onPress?.();
        doubleTapTimerRef.current = null;
      }, DOUBLE_TAP_WINDOW);
    }
  };

  const sizeStyle = size === 'large' ? styles.large : size === 'small' ? styles.small : styles.medium;

  return (
    <TouchableOpacity
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      disabled={disabled}
    >
      <Animated.View
        style={[
          styles.button,
          sizeStyle,
          {
            backgroundColor: pressed ? color + 'ee' : color + '1a',
            borderColor: pressed ? color : color + '88',
            transform: [{ scale: scaleAnim }],
            opacity: disabled ? 0.3 : 1,
            shadowColor: pressed ? color : 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: pressed ? 0.9 : 0,
            shadowRadius: 10,
            elevation: pressed ? 8 : 2,
          },
        ]}
      >
        {pressed && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: color + '22', borderRadius: 14 }]} />
        )}
        <Text style={[styles.label, { color: pressed ? '#fff' : color }]}>{label}</Text>
        {pressed && <View style={[styles.glow, { backgroundColor: color + '44' }]} />}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  small: { width: 64, height: 64 },
  medium: { width: 84, height: 84 },
  large: { width: 104, height: 104 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  glow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
});
