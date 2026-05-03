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

const DOUBLE_TAP_DELAY = 250;
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
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const continuousTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const haptic = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  };

  const handlePressIn = () => {
    if (disabled) return;
    setPressed(true);
    haptic();
    Animated.spring(scaleAnim, { toValue: 0.9, useNativeDriver: true, speed: 60 }).start();
    onDown?.();
    longPressTimerRef.current = setTimeout(() => {
      onLongPress?.();
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    }, LONG_PRESS_DELAY);
    if (continuous) {
      continuousTimerRef.current = setInterval(() => onDown?.(), CONTINUOUS_INTERVAL);
    }
  };

  const handlePressOut = () => {
    if (disabled) return;
    setPressed(false);
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 60 }).start();
    onUp?.();
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (continuousTimerRef.current) {
      clearInterval(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }

    const now = Date.now();
    const timeSinceLast = now - lastTapRef.current;

    if (timeSinceLast < DOUBLE_TAP_DELAY && lastTapRef.current > 0) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      onDoubleTap?.();
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      singleTapTimerRef.current = setTimeout(() => {
        onPress?.();
        singleTapTimerRef.current = null;
      }, DOUBLE_TAP_DELAY);
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
            backgroundColor: pressed ? color + 'ee' : color + '22',
            borderColor: color,
            transform: [{ scale: scaleAnim }],
            opacity: disabled ? 0.35 : 1,
            shadowColor: pressed ? color : 'transparent',
          },
        ]}
      >
        {pressed && <View style={[StyleSheet.absoluteFill, { backgroundColor: color + '33', borderRadius: 14 }]} />}
        <Text style={[styles.label, { color: pressed ? '#fff' : color }]}>{label}</Text>
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
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 6,
  },
  small: { width: 68, height: 68 },
  medium: { width: 88, height: 88 },
  large: { width: 108, height: 108 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
});
