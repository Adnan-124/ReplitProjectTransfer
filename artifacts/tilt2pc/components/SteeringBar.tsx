import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface SteeringBarProps {
  value: number;
}

export function SteeringBar({ value }: SteeringBarProps) {
  const colors = useColors();
  const clampedValue = Math.max(-1, Math.min(1, value));

  const indicatorColor =
    Math.abs(clampedValue) < 0.05
      ? colors.success
      : Math.abs(clampedValue) < 0.5
        ? colors.primary
        : colors.accent;

  const fillWidth = Math.abs(clampedValue) * 50;
  const fillLeft = clampedValue < 0 ? 50 - fillWidth : 50;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.sideLabel, { color: colors.mutedForeground }]}>L</Text>
        <Text style={[styles.valueText, { color: indicatorColor }]}>
          {clampedValue >= 0 ? '+' : ''}{clampedValue.toFixed(3)}
        </Text>
        <Text style={[styles.sideLabel, { color: colors.mutedForeground }]}>R</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: indicatorColor + '55',
              width: `${fillWidth}%`,
              left: `${fillLeft}%`,
            },
          ]}
        />
        <View style={[styles.centerLine, { backgroundColor: colors.border }]} />
        <View
          style={[
            styles.indicator,
            {
              left: `${((clampedValue + 1) / 2) * 100}%`,
              backgroundColor: indicatorColor,
              shadowColor: indicatorColor,
              transform: [{ translateX: -10 }],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 20,
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    width: 20,
    textAlign: 'center',
  },
  valueText: {
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  track: {
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    top: 0,
    height: '100%',
  },
  centerLine: {
    position: 'absolute',
    left: '50%',
    width: 2,
    height: '100%',
    marginLeft: -1,
  },
  indicator: {
    position: 'absolute',
    top: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
});
