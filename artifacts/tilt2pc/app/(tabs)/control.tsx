import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ControlButton } from '@/components/ControlButton';
import { DiagnosticsOverlay } from '@/components/DiagnosticsOverlay';
import { SteeringBar } from '@/components/SteeringBar';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { useTilt } from '@/hooks/useTilt';

type ButtonId = 'NITRO' | 'DRIFT' | 'BRAKE' | 'CAMERA' | 'SHOCKWAVE' | 'MENU' | 'EXTRA1' | 'EXTRA2';

export default function ControlScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { sendMessage, setLastEvent, connectionStatus, steerValue } = useApp();
  const [showDiag, setShowDiag] = useState(false);

  useTilt(true);

  const btn = useCallback(
    (id: ButtonId, action: 'down' | 'up' | 'click' | 'double' | 'long') => {
      sendMessage({ type: 'button', ts: Date.now(), id, action });
      setLastEvent(`${id}:${action}`);
    },
    [sendMessage, setLastEvent],
  );

  const connected = connectionStatus === 'connected';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Grid overlay for racing feel */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.gridLine, { top: '33%', backgroundColor: colors.border + '33' }]} />
        <View style={[styles.gridLine, { top: '66%', backgroundColor: colors.border + '22' }]} />
      </View>

      {/* Top Bar */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 8),
            paddingHorizontal: 16,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </TouchableOpacity>

        <View style={[styles.connectionPill, { backgroundColor: connected ? colors.success + '22' : colors.destructive + '22', borderColor: connected ? colors.success + '66' : colors.destructive + '66' }]}>
          <View style={[styles.dot, { backgroundColor: connected ? colors.success : colors.destructive }]} />
          <Text style={[styles.connectionText, { color: connected ? colors.success : colors.destructive }]}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowDiag((v) => !v)}
        >
          <Feather name="activity" size={18} color={showDiag ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Steering Section */}
      <View style={styles.steeringSection}>
        <SteeringBar value={steerValue} />
        {showDiag && (
          <View style={styles.diagContainer}>
            <DiagnosticsOverlay />
          </View>
        )}
      </View>

      {/* Button Grid */}
      <View style={styles.buttonGrid}>
        {/* Left Column */}
        <View style={styles.column}>
          <ControlButton
            label="CAMERA"
            color={colors.camera}
            size="medium"
            onPress={() => btn('CAMERA', 'click')}
            onDown={() => btn('CAMERA', 'down')}
            onUp={() => btn('CAMERA', 'up')}
          />
          <ControlButton
            label="MENU"
            color={colors.mutedForeground}
            size="small"
            onPress={() => btn('MENU', 'click')}
            onDown={() => btn('MENU', 'down')}
            onUp={() => btn('MENU', 'up')}
          />
        </View>

        {/* Center — tilt label */}
        <View style={styles.centerCol}>
          <View style={[styles.tiltGuide, { borderColor: colors.border }]}>
            <Feather name="smartphone" size={28} color={colors.primary + '88'} />
            <Text style={[styles.tiltLabel, { color: colors.mutedForeground }]}>TILT TO STEER</Text>
          </View>
        </View>

        {/* Right Column */}
        <View style={styles.column}>
          <ControlButton
            label="NITRO"
            color={colors.nitro}
            size="large"
            onDown={() => btn('NITRO', 'down')}
            onUp={() => btn('NITRO', 'up')}
            onPress={() => btn('NITRO', 'click')}
            onDoubleTap={() => btn('NITRO', 'double')}
          />
          <ControlButton
            label="DRIFT"
            color={colors.drift}
            size="medium"
            continuous
            onDown={() => btn('DRIFT', 'down')}
            onUp={() => btn('DRIFT', 'up')}
            onPress={() => btn('DRIFT', 'click')}
          />
          <ControlButton
            label="BRAKE"
            color={colors.brake}
            size="medium"
            continuous
            onDown={() => btn('BRAKE', 'down')}
            onUp={() => btn('BRAKE', 'up')}
          />
        </View>
      </View>

      {/* Bottom Row */}
      <View
        style={[
          styles.bottomRow,
          { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 12) },
        ]}
      >
        <ControlButton
          label="SHOCKWAVE"
          color={colors.shockwave}
          size="small"
          onPress={() => btn('SHOCKWAVE', 'click')}
          onDown={() => btn('SHOCKWAVE', 'down')}
          onUp={() => btn('SHOCKWAVE', 'up')}
        />
        <View style={[styles.steerReadout, { backgroundColor: colors.card + 'aa', borderColor: colors.border }]}>
          <Text style={[styles.steerNum, { color: steerValue >= 0 ? colors.primary : colors.accent }]}>
            {steerValue >= 0 ? '→' : '←'}
            {' '}{Math.abs(steerValue * 100).toFixed(0)}%
          </Text>
        </View>
        <ControlButton
          label="EXTRA"
          color={colors.secondary}
          size="small"
          onPress={() => btn('EXTRA1', 'click')}
          onDown={() => btn('EXTRA1', 'down')}
          onUp={() => btn('EXTRA1', 'up')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  connectionText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  steeringSection: {
    paddingVertical: 16,
    gap: 10,
    alignItems: 'center',
  },
  diagContainer: { alignItems: 'center' },
  buttonGrid: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  column: {
    alignItems: 'center',
    gap: 12,
    flex: 0,
  },
  centerCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiltGuide: {
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    borderStyle: 'dashed',
  },
  tiltLabel: {
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  steerReadout: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  steerNum: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
});
