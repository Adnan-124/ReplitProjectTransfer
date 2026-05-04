import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

interface ControlButtonProps {
  label: string;
  color: string;
  size?: 'small' | 'medium' | 'large';
  icon?: FeatherName;
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

const SIZE_CONFIG = {
  large:  { box: 104, font: 10, icon: 22 },
  medium: { box: 84,  font: 10, icon: 18 },
  small:  { box: 64,  font: 9,  icon: 14 },
};

export function ControlButton({
  label,
  color,
  size = 'medium',
  icon,
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
    if (Platform.OS !== 'web') Haptics.impactAsync(style).catch(() => {});
  };

  const handlePressIn = () => {
    if (disabled) return;
    setPressed(true);
    haptic();
    Animated.spring(scaleAnim, { toValue: 0.88, useNativeDriver: true, speed: 80 }).start();

    onDown?.();

    longPressTimerRef.current = setTimeout(() => {
      onLongPress?.();
      haptic(Haptics.ImpactFeedbackStyle.Heavy);
    }, LONG_PRESS_DELAY);

    if (continuous) {
      continuousTimerRef.current = setInterval(() => onDown?.(), CONTINUOUS_INTERVAL);
    }
  };

  const handlePressOut = () => {
    if (disabled) return;
    setPressed(false);
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 80 }).start();

    onUp?.();

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (continuousTimerRef.current) {
      clearInterval(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }

    if (!onDoubleTap) {
      onPress?.();
      return;
    }

    const now = Date.now();
    const gap = now - lastTapRef.current;

    if (gap < DOUBLE_TAP_WINDOW && lastTapRef.current > 0) {
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
      lastTapRef.current = now;
      doubleTapTimerRef.current = setTimeout(() => {
        onPress?.();
        doubleTapTimerRef.current = null;
      }, DOUBLE_TAP_WINDOW);
    }
  };

  const cfg = SIZE_CONFIG[size];
  const contentColor = pressed ? '#fff' : color;

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
          {
            width: cfg.box,
            height: cfg.box,
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
        {icon && (
          <Feather name={icon} size={cfg.icon} color={contentColor} style={styles.icon} />
        )}
        <Text style={[styles.label, { fontSize: cfg.font, color: contentColor }]}>
          {label}
        </Text>
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
    gap: 3,
  },
  icon: {
    // slight upward nudge when shown with label
  },
  label: {
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
