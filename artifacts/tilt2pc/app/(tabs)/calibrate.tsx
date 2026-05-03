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

  // rawTilt is already axis-corrected (same logic as useTilt)
  const [rawTilt, setRawTilt] = useState(0);
  const [axisLabel, setAxisLabel] = useState('x');
  const [calibrated, setCalibrated] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const orientationRef = useRef<ScreenOrientation.Orientation>(
    ScreenOrientation.Orientation.PORTRAIT_UP,
  );
  const subRef = useRef<{ remove: () => void } | null>(null);

  // Lock to landscape (same as control screen) so calibration uses the correct axis
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      }
      return () => {
        if (Platform.OS !== 'web') {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
        }
      };
    }, []),
  );

  // Track orientation for correct axis read
  useEffect(() => {
    if (Platform.OS === 'web') return;

    ScreenOrientation.getOrientationAsync()
      .then((o) => { orientationRef.current = o; })
      .catch(() => {});

    const oriSub = ScreenOrientation.addOrientationChangeListener(({ orientationInfo }) => {
      orientationRef.current = orientationInfo.orientation;
      updateAxisLabel(orientationInfo.orientation);
    });

    return () => ScreenOrientation.removeOrientationChangeListener(oriSub);
  }, []);

  const updateAxisLabel = (o: ScreenOrientation.Orientation) => {
    const Ori = ScreenOrientation.Orientation;
    if (o === Ori.LANDSCAPE_LEFT || o === Ori.LANDSCAPE_RIGHT) {
      setAxisLabel('y');
    } else {
      setAxisLabel('x');
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      let t = 0;
      const id = setInterval(() => {
        t += 0.03;
        setRawTilt(Math.sin(t) * 0.15);
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

      subRef.current = Accelerometer.addListener(({ x, y }) => {
        const o = orientationRef.current;
        const Ori = ScreenOrientation.Orientation;

        // Mirror axis logic from useTilt.ts
        let value: number;
        if (o === Ori.LANDSCAPE_LEFT) {
          value = -y;          // CW rotation: negate y
          setAxisLabel('y (negated)');
        } else if (o === Ori.LANDSCAPE_RIGHT) {
          value = y;            // CCW rotation: use y directly
          setAxisLabel('y');
        } else {
          value = o === Ori.PORTRAIT_DOWN ? -x : x;
          setAxisLabel('x');
        }
        setRawTilt(value);
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

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Axis info banner */}
      <View style={[styles.axisBanner, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}>
        <Feather name="info" size={14} color={colors.primary} />
        <Text style={[styles.axisText, { color: colors.primary }]}>
          Reading axis: <Text style={{ fontWeight: '800' }}>{axisLabel}</Text>
          {'  '}(landscape = y, portrait = x)
        </Text>
      </View>

      {/* Live Tilt Visualizer */}
      <View style={[styles.vizCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.vizTitle, { color: colors.mutedForeground }]}>LIVE STEERING VALUE</Text>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Text style={[styles.rawValue, { color: indicatorColor }]}>
            {steer >= 0 ? '+' : ''}{steer.toFixed(3)}
          </Text>
        </Animated.View>

        {/* Steering track */}
        <View style={[styles.track, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <View style={[styles.centerMark, { backgroundColor: colors.primary + '66' }]} />
          <View
            style={[
              styles.indicator,
              {
                left: `${((steer + 1) / 2) * 100}%` as any,
                backgroundColor: indicatorColor,
                shadowColor: indicatorColor,
                transform: [{ translateX: -10 }],
              },
            ]}
          />
        </View>

        <View style={styles.rawRow}>
          <Text style={[styles.rawLabel, { color: colors.mutedForeground }]}>Raw ({axisLabel}): </Text>
          <Text style={[styles.rawSmall, { color: colors.foreground }]}>{rawTilt.toFixed(4)}</Text>
          <Text style={[styles.rawLabel, { color: colors.mutedForeground }]}>{'  '}Neutral: </Text>
          <Text style={[styles.rawSmall, { color: colors.primary }]}>{neutralTilt.toFixed(4)}</Text>
        </View>
      </View>

      {/* Instructions */}
      <View style={[styles.instructionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.step}>
          <StepNum n={1} colors={colors} />
          <Text style={[styles.stepText, { color: colors.foreground }]}>
            The screen is locked to <Text style={{ color: colors.primary, fontWeight: '700' }}>landscape</Text> — hold the phone as you would during gameplay.
          </Text>
        </View>
        <View style={styles.step}>
          <StepNum n={2} colors={colors} />
          <Text style={[styles.stepText, { color: colors.foreground }]}>
            Hold the phone level in your neutral driving position (slightly angled is fine).
          </Text>
        </View>
        <View style={styles.step}>
          <StepNum n={3} colors={colors} />
          <Text style={[styles.stepText, { color: colors.foreground }]}>
            Tap <Text style={{ color: colors.primary, fontWeight: '700' }}>Calibrate</Text>. The steering value above should read{' '}
            <Text style={{ color: colors.success, fontWeight: '700' }}>+0.000</Text> when centred.
          </Text>
        </View>
        <View style={styles.step}>
          <StepNum n={4} colors={colors} />
          <Text style={[styles.stepText, { color: colors.foreground }]}>
            Verify: tilt{' '}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>LEFT → negative</Text>
            {'  '}tilt{' '}
            <Text style={{ color: colors.accent, fontWeight: '700' }}>RIGHT → positive</Text>
          </Text>
        </View>
      </View>

      {/* Calibrate Button */}
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
            Neutral set to {neutralTilt.toFixed(4)} (axis: {axisLabel})
          </Text>
        </View>
      )}

      {/* Quick sensitivity adjust */}
      <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
          QUICK ADJUST (matches Asphalt 9 scale)
        </Text>
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

function StepNum({ n, colors }: { n: number; colors: ReturnType<typeof useColors> }) {
  return (
    <View
      style={[
        styles.stepNum,
        { backgroundColor: colors.primary + '22', borderColor: colors.primary + '44' },
      ]}
    >
      <Text style={[styles.stepNumText, { color: colors.primary }]}>{n}</Text>
    </View>
  );
}

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
    gap: 12,
  },
  vizTitle: { fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  rawValue: {
    fontSize: 48,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  track: {
    width: '100%',
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  centerMark: {
    position: 'absolute',
    left: '50%',
    width: 2,
    height: '100%',
    marginLeft: -1,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  rawRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  rawLabel: { fontSize: 11 },
  rawSmall: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  instructionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
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
  settingsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
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
