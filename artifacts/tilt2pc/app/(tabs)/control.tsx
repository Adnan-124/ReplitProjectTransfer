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
import { DraggableButton } from '@/components/DraggableButton';
import { NitroButton, type NitroType } from '@/components/NitroButton';
import { SteeringBar } from '@/components/SteeringBar';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { BUTTON_BOX, type HUDButtonId, useHUDLayout } from '@/hooks/useHUDLayout';
import { useTilt } from '@/hooks/useTilt';

type SimpleButtonId = 'DRIFT' | 'BRAKE' | 'CAMERA' | 'SHOCKWAVE' | 'MENU';

export default function ControlScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { sendMessage, setLastEvent, connectionStatus, steerValue } = useApp();
  const [showDiag, setShowDiag] = useState(false);

  // Body dimensions — filled by onLayout so DraggableButton can clamp correctly
  const [bodyW, setBodyW] = useState(0);
  const [bodyH, setBodyH] = useState(0);

  const hud = useHUDLayout(bodyW, bodyH);

  const isLandscape = width > height;

  useTilt(true);

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

  const btn = useCallback(
    (id: SimpleButtonId, action: 'down' | 'up' | 'click') => {
      sendMessage({ type: 'button', ts: Date.now(), id, action });
      setLastEvent(`${id}:${action}`);
    },
    [sendMessage, setLastEvent],
  );

  const handleNitro = useCallback(
    (nitroType: NitroType) => {
      sendMessage({ type: 'nitro', ts: Date.now(), nitroType });
      setLastEvent(`NITRO:${nitroType}`);
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

  // ── Draggable button config ──────────────────────────────────────────────
  const draggable = (id: HUDButtonId, children: React.ReactNode) => (
    <DraggableButton
      key={id}
      id={id}
      position={hud.getPosition(id)}
      editMode={hud.editMode}
      onDrop={(pos) => hud.updatePosition(id, pos)}
      bodyW={bodyW}
      bodyH={bodyH}
      btnW={BUTTON_BOX[id].w}
      btnH={BUTTON_BOX[id].h}
    >
      {children}
    </DraggableButton>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── TOP BAR ──────────────────────────────────────────────────── */}
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
          <View
            style={[styles.liveDot, { backgroundColor: connected ? colors.success : colors.destructive }]}
          />
          <Text
            style={[
              styles.liveText,
              { color: connected ? colors.success : colors.destructive },
            ]}
          >
            {connected ? 'LIVE' : 'OFFLINE'}
          </Text>
        </View>

        <View style={styles.topCenter}>
          <Text style={[styles.steerPct, { color: steerColor }]}>
            {steerDir}
            {'  '}
            {steerPct}%
          </Text>
        </View>

        {/* HUD edit mode toggle */}
        <TouchableOpacity
          style={[
            styles.iconBtn,
            {
              backgroundColor: hud.editMode ? '#06b6d422' : colors.card,
              borderColor: hud.editMode ? '#06b6d4' : colors.border,
            },
          ]}
          onPress={() => hud.setEditMode((v) => !v)}
        >
          <Feather
            name={hud.editMode ? 'check' : 'layout'}
            size={16}
            color={hud.editMode ? '#06b6d4' : colors.mutedForeground}
          />
        </TouchableOpacity>

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
          <Feather
            name="activity"
            size={16}
            color={showDiag ? colors.primary : colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>

      {/* ── DIAG OVERLAY ─────────────────────────────────────────────── */}
      {showDiag && (
        <View style={[styles.diagRow, { paddingHorizontal: lPad }]}>
          <DiagnosticsOverlay />
        </View>
      )}

      {/* ── MAIN BODY ────────────────────────────────────────────────── */}
      <View
        style={[styles.body, { paddingLeft: lPad, paddingRight: rPad }]}
        onLayout={(e) => {
          setBodyW(e.nativeEvent.layout.width);
          setBodyH(e.nativeEvent.layout.height);
        }}
      >
        {/* Fixed center: SteeringBar + tilt hint. pointerEvents=none so tilt works everywhere */}
        <View style={styles.centerFixed} pointerEvents="none">
          <SteeringBar value={steerValue} />
          <View style={styles.tiltHint}>
            <Feather name="navigation" size={20} color={colors.primary + '55'} />
            <Text style={[styles.tiltLabel, { color: colors.mutedForeground }]}>
              TILT TO STEER
            </Text>
          </View>
          {/* Nitro legend (small, centre) */}
          <View style={styles.nitroLegend}>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                tap = yellow nitro
              </Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
              <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                tap again in window = perfect
              </Text>
            </View>
          </View>
        </View>

        {/* ── Edit mode: floating instructions + reset ─────────────── */}
        {hud.editMode && (
          <View style={styles.editBanner} pointerEvents="box-none">
            <Text style={styles.editBannerText}>DRAG BUTTONS TO REPOSITION</Text>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={hud.resetLayout}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="refresh-cw" size={11} color="#06b6d4" />
              <Text style={styles.resetText}>RESET</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Draggable HUD buttons (render only after body is measured) */}
        {bodyW > 0 && (
          <>
            {draggable(
              'CAMERA',
              <ControlButton
                label="CAMERA"
                color={colors.camera}
                size="medium"
                onDown={() => btn('CAMERA', 'down')}
                onUp={() => btn('CAMERA', 'up')}
                onPress={() => btn('CAMERA', 'click')}
              />,
            )}

            {draggable(
              'SHOCK',
              <ControlButton
                label="SHOCK"
                color={colors.shockwave}
                size="small"
                onDown={() => btn('SHOCKWAVE', 'down')}
                onUp={() => btn('SHOCKWAVE', 'up')}
                onPress={() => btn('SHOCKWAVE', 'click')}
              />,
            )}

            {draggable(
              'MENU',
              <ControlButton
                label="MENU"
                color={colors.mutedForeground}
                size="small"
                onDown={() => btn('MENU', 'down')}
                onUp={() => btn('MENU', 'up')}
                onPress={() => btn('MENU', 'click')}
              />,
            )}

            {draggable(
              'NITRO',
              <NitroButton
                onNitro={handleNitro}
                borderColor={colors.nitro}
                backgroundColor={colors.background}
              />,
            )}

            {draggable(
              'DRIFT',
              <ControlButton
                label="DRIFT"
                color={colors.drift}
                size="medium"
                continuous
                onDown={() => btn('DRIFT', 'down')}
                onUp={() => btn('DRIFT', 'up')}
              />,
            )}

            {draggable(
              'BRAKE',
              <ControlButton
                label="BRAKE"
                color={colors.brake}
                size="medium"
                continuous
                onDown={() => btn('BRAKE', 'down')}
                onUp={() => btn('BRAKE', 'up')}
              />,
            )}
          </>
        )}
      </View>

      {/* ── BOTTOM SAFE AREA ─────────────────────────────────────────── */}
      <View style={{ height: Math.max(insets.bottom, 4) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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

  diagRow: { paddingVertical: 6, alignItems: 'center' },

  body: {
    flex: 1,
    position: 'relative', // establishes containing block for absolute buttons
  },

  // ── Center content (steering + hint) — fills body, flex-centered ──
  centerFixed: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  tiltHint: { alignItems: 'center', gap: 6 },
  tiltLabel: { fontSize: 9, letterSpacing: 2.5, fontWeight: '700' },
  nitroLegend: { gap: 4, alignItems: 'flex-start', marginTop: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },

  // ── Edit mode overlay ─────────────────────────────────────────────
  editBanner: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    zIndex: 50,
    pointerEvents: 'box-none',
  },
  editBannerText: {
    color: '#06b6d4',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#06b6d455',
    backgroundColor: '#06b6d410',
  },
  resetText: {
    color: '#06b6d4',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
