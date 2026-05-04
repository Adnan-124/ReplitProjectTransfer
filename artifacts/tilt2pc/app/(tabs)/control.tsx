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
import { CAR_PROFILES, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { BUTTON_BOX, type HUDButtonId, useHUDLayout } from '@/hooks/useHUDLayout';
import { useTilt } from '@/hooks/useTilt';

type BtnId = 'BRAKE' | 'CAMERA' | 'MENU';

export default function ControlScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { sendMessage, setLastEvent, connectionStatus, steerValue, settings } = useApp();
  const [showDiag, setShowDiag] = useState(false);

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
    (id: BtnId, action: 'down' | 'up' | 'click') => {
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

  // Get per-car timing from active car profile
  const carProfile = CAR_PROFILES.find((c) => c.id === settings.carId) ?? CAR_PROFILES[2];

  const connected = connectionStatus === 'connected';
  const steerPct = Math.abs(steerValue * 100).toFixed(0);
  const steerDir = steerValue > 0.05 ? '→' : steerValue < -0.05 ? '←' : '●';
  const steerColor =
    steerValue > 0.05 ? colors.primary : steerValue < -0.05 ? colors.accent : colors.success;

  const lPad = Math.max(insets.left, Platform.OS === 'web' ? 8 : 12);
  const rPad = Math.max(insets.right, Platform.OS === 'web' ? 8 : 12);
  const tPad = insets.top + (Platform.OS === 'web' ? (isLandscape ? 0 : 67) : 4);

  // ── DraggableButton helper ─────────────────────────────────────────────────
  const drag = (id: HUDButtonId, children: React.ReactNode) => (
    <DraggableButton
      key={id}
      id={id}
      position={hud.getPosition(id)}
      scale={hud.getScale(id)}
      editMode={hud.editMode}
      onDrop={(pos) => hud.updatePosition(id, pos)}
      onDecreaseScale={() => hud.decreaseScale(id)}
      onIncreaseScale={() => hud.increaseScale(id)}
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
      {/* ── TOP BAR ────────────────────────────────────────────────── */}
      <View
        style={[
          styles.topBar,
          { paddingTop: tPad, paddingLeft: lPad, paddingRight: rPad, borderBottomColor: colors.border },
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
          {/* Active car class pill */}
          <View style={[styles.carPill, { borderColor: colors.primary + '44' }]}>
            <Text style={[styles.carPillText, { color: colors.primary }]}>
              {carProfile.name} · {carProfile.perfectWindow}ms
            </Text>
          </View>
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

      {/* ── DIAG OVERLAY ───────────────────────────────────────────── */}
      {showDiag && (
        <View style={[styles.diagRow, { paddingHorizontal: lPad }]}>
          <DiagnosticsOverlay />
        </View>
      )}

      {/* ── MAIN BODY ──────────────────────────────────────────────── */}
      <View
        style={[styles.body, { paddingLeft: lPad, paddingRight: rPad }]}
        onLayout={(e) => {
          setBodyW(e.nativeEvent.layout.width);
          setBodyH(e.nativeEvent.layout.height);
        }}
      >
        {/* Fixed center: SteeringBar. pointerEvents=none so tilt works everywhere */}
        <View style={styles.centerFixed} pointerEvents="none">
          <SteeringBar value={steerValue} />
          <View style={styles.tiltHint}>
            <Feather name="navigation" size={18} color={colors.primary + '55'} />
            <Text style={[styles.tiltLabel, { color: colors.mutedForeground }]}>
              TILT TO STEER
            </Text>
          </View>
          {/* Nitro legend */}
          <View style={styles.nitroLegend}>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={[styles.legendText, { color: colors.mutedForeground }]}>single tap = yellow</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#06b6d4' }]} />
              <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                &lt;{carProfile.perfectWindow}ms = perfect
              </Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#f97316' }]} />
              <Text style={[styles.legendText, { color: colors.mutedForeground }]}>&lt;120ms = orange</Text>
            </View>
          </View>
        </View>

        {/* Edit mode banner */}
        {hud.editMode && (
          <View style={styles.editBanner} pointerEvents="box-none">
            <Text style={styles.editBannerText}>DRAG · RESIZE WITH [-][+]</Text>
            <TouchableOpacity style={styles.resetBtn} onPress={hud.resetLayout}>
              <Feather name="refresh-cw" size={10} color="#06b6d4" />
              <Text style={styles.resetText}>RESET</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Draggable HUD buttons ─────────────────────────────── */}
        {bodyW > 0 && (
          <>
            {/* CAMERA */}
            {drag(
              'CAMERA',
              <ControlButton
                label="CAMERA"
                color={colors.camera}
                size="medium"
                icon="camera"
                onDown={() => btn('CAMERA', 'down')}
                onUp={() => btn('CAMERA', 'up')}
                onPress={() => btn('CAMERA', 'click')}
              />,
            )}

            {/* MENU */}
            {drag(
              'MENU',
              <ControlButton
                label="MENU"
                color={colors.mutedForeground}
                size="small"
                icon="menu"
                onDown={() => btn('MENU', 'down')}
                onUp={() => btn('MENU', 'up')}
                onPress={() => btn('MENU', 'click')}
              />,
            )}

            {/* HUD_EDIT — tap toggles edit mode from within the HUD */}
            {drag(
              'HUD_EDIT',
              <ControlButton
                label="HUD"
                color="#06b6d4"
                size="small"
                icon="sliders"
                onPress={() => hud.setEditMode((v) => !v)}
              />,
            )}

            {/* NITRO — tap-delta system with per-car perfect window */}
            {drag(
              'NITRO',
              <NitroButton
                onNitro={handleNitro}
                borderColor={colors.nitro}
                backgroundColor={colors.background}
                perfectWindow={carProfile.perfectWindow}
              />,
            )}

            {/* BRAKE */}
            {drag(
              'BRAKE',
              <ControlButton
                label="BRAKE"
                color={colors.brake}
                size="medium"
                icon="arrow-down"
                continuous
                onDown={() => btn('BRAKE', 'down')}
                onUp={() => btn('BRAKE', 'up')}
              />,
            )}
          </>
        )}
      </View>

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

  topCenter: { flex: 1, alignItems: 'center', gap: 2 },
  steerPct: {
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  carPill: {
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 10,
    borderWidth: 1,
  },
  carPillText: { fontSize: 8, fontWeight: '700', letterSpacing: 1 },

  diagRow: { paddingVertical: 6, alignItems: 'center' },

  body: {
    flex: 1,
    position: 'relative',
  },

  centerFixed: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  tiltHint: { alignItems: 'center', gap: 4 },
  tiltLabel: { fontSize: 9, letterSpacing: 2.5, fontWeight: '700' },
  nitroLegend: { gap: 3, alignItems: 'flex-start', marginTop: 2 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },

  editBanner: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
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
  resetText: { color: '#06b6d4', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
});
