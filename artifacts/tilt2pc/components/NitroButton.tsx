import * as Haptics from 'expo-haptics';
import React, { useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export type NitroType = 'yellow' | 'perfect' | 'orange' | 'shockwave';

interface NitroButtonProps {
  onNitro: (type: NitroType) => void;
  borderColor?: string;
  backgroundColor?: string;
  perfectWindow?: number;
}

export function NitroButton({ onNitro }: NitroButtonProps) {
  const [active, setActive] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const fire = () => {
    onNitro('yellow');
    setActive(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 80, bounciness: 6 }),
    ]).start();

    setTimeout(() => setActive(false), 300);
  };

  return (
    <View style={styles.wrapper}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={fire}
          style={[
            styles.button,
            active && styles.buttonActive,
          ]}
        >
          <Text style={[styles.icon, active && styles.iconActive]}>⚡</Text>
          <Text style={[styles.label, active && styles.labelActive]}>NITRO</Text>
        </Pressable>
      </Animated.View>
      <Text style={styles.hint}>tap</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 4 },
  button: {
    width: 100,
    height: 100,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fbbf24',
    backgroundColor: '#120d00',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  buttonActive: {
    borderColor: '#f59e0b',
    backgroundColor: '#1f1400',
  },
  icon: { fontSize: 22, color: '#fbbf24' },
  iconActive: { color: '#f59e0b' },
  label: { fontSize: 10, fontWeight: 'bold', color: '#fbbf24', letterSpacing: 1.5 },
  labelActive: { color: '#f59e0b' },
  hint: { fontSize: 10, color: '#fbbf2466', marginTop: 2 },
});
