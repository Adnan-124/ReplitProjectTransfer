import { Feather } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ControlButton } from '@/components/ControlButton';
import { DiagnosticsOverlay } from '@/components/DiagnosticsOverlay';
import { SteeringBar } from '@/components/SteeringBar';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { useTilt } from '@/hooks/useTilt';

type ButtonId = 'NITRO' | 'DRIFT' | 'BRAKE' | 'CAMERA' | 'SHOCKWAVE' | 'MENU' | 'EXTRA1';

export default function ControlScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { sendMessage, setLastEvent, connectionStatus, steerValue } = useApp();
  const [showDiag, setShowDiag] = useState(false);

  const isLandscape = width > height;

  useTilt(true);

  // Lock to landscape on native, restore portrait on leave
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

  const btn = useCallback(
    (id: ButtonId, action: 'down' | 'up' | 'click' | 'double' | 'long') => {
      sendMessage({ type: 'button', ts: Date.now(), id, action });
      setLastEvent(`${id}:${action}`);
    },
    [sendMessage, setLastEvent],
  );

  const connected = connectionStatus === 'connected';
  const steerPct = Math.abs(steerValue * 100).toFixed(0);
  const steerDir = steerValue > 0.05 ? '→' : steerValue < -0.05 ? '←' : '●';
  const steerColor =
    steerValue > 0.05 ? colors.primary : steerValue < -0.05 ? colors.accent : colors.success;

  const lPad = Math.max(insets.left, Platform.OS === 'web' ? 8 : 12);
  const rPad = Math.max(insets.right, Platform.OS === 'web' ? 8 : 12);
  const tPad = insets.top + (Platform.OS === 'web' ? (isLandscape ? 0 : 67) : 4);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── TOP BAR ────────────────────────────────────────── */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: tPad,
            paddingLeft: lPad,
            paddingRight: rPad,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={16} color={colors.foreground} />
        </TouchableOpacity>

        <View
          style={[
            styles.livePill,
            {
              backgroundColor: connected ? colors.success + '22' : colors.destructive + '22',
              borderColor: connected ? colors.success + '55' : colors.destructive + '55',
            },
          ]}
        >
          <View style={[styles.liveDot, { backgroundColor: connected ? colors.success : colors.destructive }]} />
          <Text style={[styles.liveText, { color: connected ? colors.success : colors.destructive }]}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </Text>
        </View>

        <View style={styles.topCenter}>
          <Text style={[styles.steerPct, { color: steerColor }]}>
            {steerDir}{'  '}{steerPct}%
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.iconBtn,
            {
              backgroundColor: showDiag ? colors.primary + '22' : colors.card,
              borderColor: showDiag ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setShowDiag((v) => !v)}
        >
          <Feather name="activity" size={16} color={showDiag ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* ── DIAG OVERLAY ───────────────────────────────────── */}
      {showDiag && (
        <View style={[styles.diagRow, { paddingHorizontal: lPad }]}>
          <DiagnosticsOverlay />
        </View>
      )}

      {/* ── MAIN BODY (landscape row) ──────────────────────── */}
      <View style={[styles.body, { paddingLeft: lPad, paddingRight: rPad }]}>

        {/* LEFT PAD — left thumb */}
        <View style={styles.leftPad}>
          <ControlButton
            label="CAMERA"
            color={colors.camera}
            size="medium"
            onDown={() => btn('CAMERA', 'down')}
            onUp={() => btn('CAMERA', 'up')}
            onPress={() => btn('CAMERA', 'click')}
          />
          <ControlButton
            label="SHOCK"
            color={colors.shockwave}
            size="small"
            onDown={() => btn('SHOCKWAVE', 'down')}
            onUp={() => btn('SHOCKWAVE', 'up')}
            onPress={() => btn('SHOCKWAVE', 'click')}
          />
          <ControlButton
            label="MENU"
            color={colors.mutedForeground}
            size="small"
            onDown={() => btn('MENU', 'down')}
            onUp={() => btn('MENU', 'up')}
            onPress={() => btn('MENU', 'click')}
          />
        </View>

        {/* CENTER — steering indicator */}
        <View style={styles.center}>
          <SteeringBar value={steerValue} />
          <View style={styles.tiltHint}>
            <Feather name="navigation" size={20} color={colors.primary + '55'} />
            <Text style={[styles.tiltLabel, { color: colors.mutedForeground }]}>
              TILT TO STEER
            </Text>
          </View>
        </View>

        {/* RIGHT PAD — right thumb */}
        <View style={styles.rightPad}>
          <ControlButton
            label="NITRO"
            color={colors.nitro}
            size="large"
            onDown={() => btn('NITRO', 'down')}
            onUp={() => btn('NITRO', 'up')}
            onPress={() => btn('NITRO', 'click')}
            onDoubleTap={() => btn('NITRO', 'double')}
          />
          <View style={styles.rightRow}>
            <ControlButton
              label="DRIFT"
              color={colors.drift}
              size="medium"
              continuous
              onDown={() => btn('DRIFT', 'down')}
              onUp={() => btn('DRIFT', 'up')}
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
      </View>

      {/* ── BOTTOM SAFE AREA ───────────────────────────────── */}
      <View style={{ height: Math.max(insets.bottom, 4) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  topCenter: { flex: 1, alignItems: 'center' },
  steerPct: {
    fontSize: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },

  diagRow: {
    paddingVertical: 6,
    alignItems: 'center',
  },

  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },

  leftPad: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    alignSelf: 'stretch',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  tiltHint: {
    alignItems: 'center',
    gap: 6,
  },
  tiltLabel: {
    fontSize: 9,
    letterSpacing: 2.5,
    fontWeight: '700',
  },

  rightPad: {
    width: 200,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    alignSelf: 'stretch',
    gap: 8,
  },
  rightRow: {
    flexDirection: 'row',
    gap: 10,
  },
});
