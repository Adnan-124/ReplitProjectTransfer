import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
  const { calibrate, neutralX, settings, updateSettings } = useApp();
  const [rawX, setRawX] = useState(0);
  const [calibrated, setCalibrated] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const subRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      let t = 0;
      const id = setInterval(() => {
        t += 0.03;
        setRawX(Math.sin(t) * 0.15);
      }, 50);
      return () => clearInterval(id);
    }
    try {
      const { Accelerometer } = require('expo-sensors') as {
        Accelerometer: {
          setUpdateInterval: (ms: number) => void;
          addListener: (cb: (d: { x: number; y: number; z: number }) => void) => { remove: () => void };
        };
      };
      Accelerometer.setUpdateInterval(50);
      subRef.current = Accelerometer.addListener(({ x }) => setRawX(x));
    } catch {}
    return () => subRef.current?.remove();
  }, []);

  const handleCalibrate = () => {
    calibrate(rawX);
    setCalibrated(true);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.2, duration: 150, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  };

  const steer = Math.max(-1, Math.min(1, (rawX - neutralX) / settings.sensitivity));
  const indicatorColor = Math.abs(steer) < 0.05 ? colors.success : Math.abs(steer) < 0.4 ? colors.primary : colors.accent;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Live Tilt Visualizer */}
      <View style={[styles.vizCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.vizTitle, { color: colors.mutedForeground }]}>LIVE TILT</Text>
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
                left: `${((steer + 1) / 2) * 100}%`,
                backgroundColor: indicatorColor,
                shadowColor: indicatorColor,
                transform: [{ translateX: -10 }],
              },
            ]}
          />
        </View>

        <View style={styles.rawRow}>
          <Text style={[styles.rawLabel, { color: colors.mutedForeground }]}>Raw X: </Text>
          <Text style={[styles.rawSmall, { color: colors.foreground }]}>{rawX.toFixed(4)}</Text>
          <Text style={[styles.rawLabel, { color: colors.mutedForeground }]}>  Neutral: </Text>
          <Text style={[styles.rawSmall, { color: colors.primary }]}>{neutralX.toFixed(4)}</Text>
        </View>
      </View>

      {/* Instructions */}
      <View style={[styles.instructionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.step}>
          <View style={[styles.stepNum, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '44' }]}>
            <Text style={[styles.stepNumText, { color: colors.primary }]}>1</Text>
          </View>
          <Text style={[styles.stepText, { color: colors.foreground }]}>
            Hold your phone in the position you'll use as neutral (e.g., slightly tilted forward).
          </Text>
        </View>
        <View style={styles.step}>
          <View style={[styles.stepNum, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '44' }]}>
            <Text style={[styles.stepNumText, { color: colors.primary }]}>2</Text>
          </View>
          <Text style={[styles.stepText, { color: colors.foreground }]}>
            Keep the phone steady, then tap <Text style={{ color: colors.primary, fontWeight: '700' }}>Calibrate</Text>.
          </Text>
        </View>
        <View style={styles.step}>
          <View style={[styles.stepNum, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '44' }]}>
            <Text style={[styles.stepNumText, { color: colors.primary }]}>3</Text>
          </View>
          <Text style={[styles.stepText, { color: colors.foreground }]}>
            Tilt left/right — the steering indicator above should track your motion.
          </Text>
        </View>
      </View>

      {/* Calibrate Button */}
      <TouchableOpacity
        style={[styles.calibrateBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
        onPress={handleCalibrate}
        activeOpacity={0.8}
      >
        <Feather name="crosshair" size={20} color={colors.primaryForeground} />
        <Text style={[styles.calibrateBtnText, { color: colors.primaryForeground }]}>CALIBRATE NEUTRAL</Text>
      </TouchableOpacity>

      {calibrated && (
        <View style={[styles.successBanner, { backgroundColor: colors.success + '22', borderColor: colors.success + '44' }]}>
          <Feather name="check-circle" size={16} color={colors.success} />
          <Text style={[styles.successText, { color: colors.success }]}>
            Neutral set to {neutralX.toFixed(4)}
          </Text>
        </View>
      )}

      {/* Sensitivity */}
      <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SENSITIVITY</Text>
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
        <TouchableOpacity style={[styles.stepBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]} onPress={dec}>
          <Feather name="minus" size={14} color={colors.foreground} />
        </TouchableOpacity>
        <View style={[styles.stepValue, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={[styles.stepValueText, { color: colors.primary }]}>{value.toFixed(decimals)}</Text>
        </View>
        <TouchableOpacity style={[styles.stepBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]} onPress={inc}>
          <Feather name="plus" size={14} color={colors.foreground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 16 },
  vizCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  vizTitle: { fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  rawValue: { fontSize: 48, fontWeight: '900', fontVariant: ['tabular-nums'] },
  track: {
    width: '100%',
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  centerMark: { position: 'absolute', left: '50%', width: 2, height: '100%', marginLeft: -1 },
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
  rawRow: { flexDirection: 'row', alignItems: 'center' },
  rawLabel: { fontSize: 11 },
  rawSmall: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  instructionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumText: { fontSize: 13, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 14, lineHeight: 21 },
  calibrateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 2,
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
  successText: { fontSize: 13, fontWeight: '600' },
  settingsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperLabel: { fontSize: 14, fontWeight: '500' },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 64, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
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
