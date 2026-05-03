import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function CalibrateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { calibrate, neutralX: neutralTilt, settings, updateSettings } = useApp();

  const [rawTilt, setRawTilt] = useState(0);
  const [axisLabel, setAxisLabel] = useState('detecting…');
  const [calibrated, setCalibrated] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const subRef = useRef<{ remove: () => void } | null>(null);

  // Lock to landscape — calibration MUST happen in the same orientation as gameplay
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      }
      return () => {
        if (Platform.OS !== 'web') {
          ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP,
          ).catch(() => {});
        }
      };
    }, []),
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      let t = 0;
      setAxisLabel('y (simulated)');
      const id = setInterval(() => {
        t += 0.03;
        setRawTilt(Math.sin(t) * 0.12);
      }, 50);
      return () => clearInterval(id);
    }

    try {
      const { Accelerometer } = require('expo-sensors') as {
        Accelerometer: {
          setUpdateInterval: (ms: number) => void;
          addListener: (
            cb: (d: { x: number; y: number; z: number }) => void,
          ) => { remove: () => void };
        };
      };
      Accelerometer.setUpdateInterval(33);

      // Slow-decaying x tracker — same logic as useTilt.ts (no race condition)
      let smoothX = 0;

      subRef.current = Accelerometer.addListener(({ x, y }) => {
        smoothX = 0.05 * x + 0.95 * smoothX;

        let value: number;
        let label: string;

        if (smoothX < -0.25) {
          value = -y;
          label = '−y  (landscape-left)';
        } else if (smoothX > 0.25) {
          value = y;
          label = '+y  (landscape-right)';
        } else {
          value = x;
          label = 'x  (portrait)';
        }

        setRawTilt(value);
        setAxisLabel(label);
      });
    } catch {}

    return () => subRef.current?.remove();
  }, []);

  const handleCalibrate = () => {
    calibrate(rawTilt);
    setCalibrated(true);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.2, duration: 150, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  };

  const sensitivityDivisor = Math.max(0.1, 1.5 - (1.3 * settings.sensitivity) / 100);
  const steer = Math.max(-1, Math.min(1, (rawTilt - neutralTilt) / sensitivityDivisor));
  const indicatorColor =
    Math.abs(steer) < 0.05
      ? colors.success
      : Math.abs(steer) < 0.4
        ? colors.primary
        : colors.accent;

  // Track dot position (0% = full left, 100% = full right)
  const dotPct = ((steer + 1) / 2) * 100;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Axis indicator */}
      <View
        style={[
          styles.axisBanner,
          { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' },
        ]}
      >
        <Feather name="cpu" size={14} color={colors.primary} />
        <Text style={[styles.axisText, { color: colors.primary }]}>
          Active axis:{' '}
          <Text style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>{axisLabel}</Text>
        </Text>
      </View>

      {/* Live steer visualizer */}
      <View
        style={[styles.vizCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Text style={[styles.vizTitle, { color: colors.mutedForeground }]}>LIVE STEERING</Text>

        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Text style={[styles.rawValue, { color: indicatorColor }]}>
            {steer >= 0 ? '+' : ''}
            {steer.toFixed(3)}
          </Text>
        </Animated.View>

        {/* Track */}
        <View
          style={[styles.track, { backgroundColor: colors.secondary, borderColor: colors.border }]}
        >
          <View style={[styles.centerMark, { backgroundColor: colors.primary + '55' }]} />
          <View
            style={[
              styles.dot,
              {
                left: `${dotPct}%` as any,
                backgroundColor: indicatorColor,
                shadowColor: indicatorColor,
                transform: [{ translateX: -11 }],
              },
            ]}
          />
        </View>

        {/* Direction labels */}
        <View style={styles.dirRow}>
          <Text style={[styles.dirLabel, { color: colors.primary }]}>◀ LEFT</Text>
          <View style={styles.rawRow}>
            <Text style={[styles.rawSmall, { color: colors.mutedForeground }]}>raw: </Text>
            <Text style={[styles.rawSmall, { color: colors.foreground, fontWeight: '700' }]}>
              {rawTilt.toFixed(4)}
            </Text>
            <Text style={[styles.rawSmall, { color: colors.mutedForeground }]}>  neutral: </Text>
            <Text style={[styles.rawSmall, { color: colors.primary, fontWeight: '700' }]}>
              {neutralTilt.toFixed(4)}
            </Text>
          </View>
          <Text style={[styles.dirLabel, { color: colors.accent }]}>RIGHT ▶</Text>
        </View>
      </View>

      {/* Instructions */}
      <View
        style={[
          styles.instructionCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {[
          {
            n: 1,
            text: (
              <Text style={[styles.stepText, { color: colors.foreground }]}>
                Screen is locked to{' '}
                <Text style={{ color: colors.primary, fontWeight: '700' }}>landscape</Text>.
                Hold the phone exactly as you will during gameplay.
              </Text>
            ),
          },
          {
            n: 2,
            text: (
              <Text style={[styles.stepText, { color: colors.foreground }]}>
                Hold the phone{' '}
                <Text style={{ color: colors.primary, fontWeight: '700' }}>level</Text> in your
                natural grip — the steering value above should be near{' '}
                <Text style={{ color: colors.success, fontWeight: '700' }}>0.000</Text>.
              </Text>
            ),
          },
          {
            n: 3,
            text: (
              <Text style={[styles.stepText, { color: colors.foreground }]}>
                Tap <Text style={{ color: colors.primary, fontWeight: '700' }}>Calibrate</Text>.
                Then verify:{' '}
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  right side up = LEFT ◀
                </Text>
                {'  '}
                <Text style={{ color: colors.accent, fontWeight: '700' }}>
                  left side up = RIGHT ▶
                </Text>
              </Text>
            ),
          },
        ].map(({ n, text }) => (
          <View key={n} style={styles.step}>
            <View
              style={[
                styles.stepNum,
                { backgroundColor: colors.primary + '22', borderColor: colors.primary + '44' },
              ]}
            >
              <Text style={[styles.stepNumText, { color: colors.primary }]}>{n}</Text>
            </View>
            {text}
          </View>
        ))}
      </View>

      {/* Calibrate button */}
      <TouchableOpacity
        style={[styles.calibrateBtn, { backgroundColor: colors.primary }]}
        onPress={handleCalibrate}
        activeOpacity={0.8}
      >
        <Feather name="crosshair" size={20} color={colors.primaryForeground} />
        <Text style={[styles.calibrateBtnText, { color: colors.primaryForeground }]}>
          CALIBRATE NEUTRAL
        </Text>
      </TouchableOpacity>

      {calibrated && (
        <View
          style={[
            styles.successBanner,
            { backgroundColor: colors.success + '22', borderColor: colors.success + '44' },
          ]}
        >
          <Feather name="check-circle" size={16} color={colors.success} />
          <Text style={[styles.successText, { color: colors.success }]}>
            Neutral set to {neutralTilt.toFixed(4)} — axis: {axisLabel}
          </Text>
        </View>
      )}

      {/* Quick sensitivity controls */}
      <View
        style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>QUICK ADJUST</Text>
        <Stepper
          label="Sensitivity"
          value={settings.sensitivity}
          min={0}
          max={100}
          step={1}
          decimals={0}
          colors={colors}
          onChange={(v) => updateSettings({ sensitivity: v })}
        />
        <Stepper
          label="Deadzone"
          value={settings.deadzone}
          min={0}
          max={30}
          step={1}
          decimals={0}
          colors={colors}
          onChange={(v) => updateSettings({ deadzone: v })}
        />
      </View>

      <TouchableOpacity
        style={[styles.doneBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Text style={[styles.doneBtnText, { color: colors.foreground }]}>DONE</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── tiny sub-components ────────────────────────────────────────────────────

function Stepper({
  label,
  value,
  min,
  max,
  step,
  decimals,
  colors,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  colors: ReturnType<typeof useColors>;
  onChange: (v: number) => void;
}) {
  const dec = () => onChange(Math.max(min, parseFloat((value - step).toFixed(decimals))));
  const inc = () => onChange(Math.min(max, parseFloat((value + step).toFixed(decimals))));

  return (
    <View style={styles.stepperRow}>
      <Text style={[styles.stepperLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity
          style={[styles.stepBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={dec}
        >
          <Feather name="minus" size={14} color={colors.foreground} />
        </TouchableOpacity>
        <View
          style={[styles.stepValue, { backgroundColor: colors.secondary, borderColor: colors.border }]}
        >
          <Text style={[styles.stepValueText, { color: colors.primary }]}>
            {value.toFixed(decimals)}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.stepBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={inc}
        >
          <Feather name="plus" size={14} color={colors.foreground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 16 },

  axisBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  axisText: { fontSize: 13, flex: 1 },

  vizCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 14,
  },
  vizTitle: { fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  rawValue: { fontSize: 52, fontWeight: '900', fontVariant: ['tabular-nums'] },

  track: {
    width: '100%',
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  centerMark: {
    position: 'absolute',
    left: '50%',
    width: 2,
    height: '100%',
    marginLeft: -1,
  },
  dot: {
    position: 'absolute',
    top: 1,
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },

  dirRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dirLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  rawRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  rawSmall: { fontSize: 11, fontVariant: ['tabular-nums'] },

  instructionCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 14 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumText: { fontSize: 13, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 14, lineHeight: 21 },

  calibrateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
  },
  calibrateBtnText: { fontSize: 16, fontWeight: '800', letterSpacing: 2 },

  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  successText: { fontSize: 13, fontWeight: '600', flex: 1 },

  settingsCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperLabel: { fontSize: 14, fontWeight: '500' },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 64,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  stepValueText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },

  doneBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
  },
  doneBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: 2 },
});
