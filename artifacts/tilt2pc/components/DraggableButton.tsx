/**
 * DraggableButton — wraps any button with drag-to-reposition + resize capability.
 *
 * Edit mode OFF  → transparent wrapper; children work normally
 * Edit mode ON   → PanResponder captures drags; children pointerEvents="none"
 *                  A resize strip ([-][scale][+]) appears above the button
 *
 * Scale is applied via CSS transform on the inner View. The outer Animated.View
 * is explicitly sized at (btnW × scale, btnH × scale) so the drag footprint
 * matches the visual footprint.
 *
 * NOTE: The resize [-][+] TouchableOpacity buttons have their own responders
 * which take priority over PanResponder in the bubble phase (PanResponder uses
 * onStartShouldSetPanResponder, not the capture variant). A small movement
 * threshold prevents accidental dragging when tapping the resize buttons.
 */

import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface DraggableButtonProps {
  id: string;
  position: { x: number; y: number };
  scale: number;
  editMode: boolean;
  onDrop: (pos: { x: number; y: number }) => void;
  onDecreaseScale: () => void;
  onIncreaseScale: () => void;
  bodyW: number;
  bodyH: number;
  btnW: number;
  btnH: number;
  children: React.ReactNode;
}

const DRAG_THRESHOLD = 5; // pixels — below this, treat as a tap (not a drag)

export function DraggableButton({
  id,
  position,
  scale,
  editMode,
  onDrop,
  onDecreaseScale,
  onIncreaseScale,
  bodyW,
  bodyH,
  btnW,
  btnH,
  children,
}: DraggableButtonProps) {
  const pan = useRef(new Animated.ValueXY(position)).current;
  const committed = useRef({ x: position.x, y: position.y });

  // Sync external position changes (after AsyncStorage load or scale change)
  const prevPos = useRef(position);
  useEffect(() => {
    if (prevPos.current.x !== position.x || prevPos.current.y !== position.y) {
      pan.setValue(position);
      committed.current = { x: position.x, y: position.y };
      prevPos.current = position;
    }
  }, [position.x, position.y]);

  const scaledW = btnW * scale;
  const scaledH = btnH * scale;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => editMode,
        onMoveShouldSetPanResponder: (_, gs) =>
          editMode && (Math.abs(gs.dx) > DRAG_THRESHOLD || Math.abs(gs.dy) > DRAG_THRESHOLD),

        onPanResponderGrant: () => {
          pan.setOffset({ x: committed.current.x, y: committed.current.y });
          pan.setValue({ x: 0, y: 0 });
        },

        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),

        onPanResponderRelease: (_, gs) => {
          pan.flattenOffset();
          if (Math.abs(gs.dx) + Math.abs(gs.dy) < DRAG_THRESHOLD) {
            // Treated as tap on edit handle — restore position
            pan.setValue({ x: committed.current.x, y: committed.current.y });
            return;
          }
          const x = Math.max(0, Math.min(bodyW - scaledW, committed.current.x + gs.dx));
          const y = Math.max(0, Math.min(bodyH - scaledH, committed.current.y + gs.dy));
          pan.setValue({ x, y });
          committed.current = { x, y };
          onDrop({ x, y });
        },

        onPanResponderTerminate: (_, gs) => {
          pan.flattenOffset();
          const x = Math.max(0, Math.min(bodyW - scaledW, committed.current.x + gs.dx));
          const y = Math.max(0, Math.min(bodyH - scaledH, committed.current.y + gs.dy));
          pan.setValue({ x, y });
          committed.current = { x, y };
          onDrop({ x, y });
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editMode, bodyW, bodyH, scaledW, scaledH],
  );

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: pan.x,
          top: pan.y,
          width: scaledW,
          height: scaledH,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        },
        editMode && styles.editOutline,
      ]}
      {...panResponder.panHandlers}
    >
      {/* ── Resize + drag handle (shown above button in edit mode) ── */}
      {editMode && (
        <View style={styles.handle} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.scaleBtn}
            onPress={onDecreaseScale}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.scaleBtnTxt}>−</Text>
          </TouchableOpacity>

          <View style={styles.scaleLabelWrap}>
            <Feather name="move" size={8} color="#000" />
            <Text style={styles.scaleLabel}>{scale.toFixed(1)}×</Text>
          </View>

          <TouchableOpacity
            style={styles.scaleBtn}
            onPress={onIncreaseScale}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.scaleBtnTxt}>+</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Button content (scaled) ── */}
      <View
        style={{ width: btnW, height: btnH, transform: [{ scale }] }}
        pointerEvents={editMode ? 'none' : 'auto'}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  editOutline: {
    borderWidth: 1.5,
    borderColor: '#06b6d4',
    borderRadius: 16,
    backgroundColor: '#06b6d408',
  },

  handle: {
    position: 'absolute',
    top: -24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#06b6d4',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 30,
    elevation: 8,
    alignSelf: 'center',
  },
  scaleBtn: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#00000030',
  },
  scaleBtnTxt: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17,
  },
  scaleLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 2,
  },
  scaleLabel: {
    color: '#000',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
