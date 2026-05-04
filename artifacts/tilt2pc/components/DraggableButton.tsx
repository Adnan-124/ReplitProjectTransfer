/**
 * DraggableButton — wraps any button with drag-to-reposition capability.
 *
 * Behaviour:
 *   • editMode OFF  → transparent wrapper; children receive all touches normally
 *   • editMode ON   → PanResponder captures touches; button is draggable;
 *                     children rendered with pointerEvents="none" so buttons
 *                     don't fire while being repositioned
 *
 * The animated position is driven by PanResponder during drag (JS thread,
 * useNativeDriver: false required because we affect layout).  On release the
 * final clamped position is committed back to the parent via onDrop.
 */

import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

interface DraggableButtonProps {
  /** Stable id — used only for debugging. */
  id: string;
  /** Current position (can update from parent, e.g. after load from storage). */
  position: { x: number; y: number };
  editMode: boolean;
  /** Called with the final clamped position on finger-up. */
  onDrop: (pos: { x: number; y: number }) => void;
  /** Body container size, used for clamping. */
  bodyW: number;
  bodyH: number;
  /** Bounding box of the button, used for clamping. */
  btnW: number;
  btnH: number;
  children: React.ReactNode;
}

export function DraggableButton({
  id,
  position,
  editMode,
  onDrop,
  bodyW,
  bodyH,
  btnW,
  btnH,
  children,
}: DraggableButtonProps) {
  const pan = useRef(new Animated.ValueXY(position)).current;
  // Track the committed position so we can set the offset on drag-start.
  const committed = useRef({ x: position.x, y: position.y });

  // Sync when parent changes position externally (e.g. AsyncStorage load).
  const prevPos = useRef(position);
  useEffect(() => {
    if (prevPos.current.x !== position.x || prevPos.current.y !== position.y) {
      pan.setValue(position);
      committed.current = { x: position.x, y: position.y };
      prevPos.current = position;
    }
  }, [position.x, position.y]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Only capture in edit mode
        onStartShouldSetPanResponder: () => editMode,
        onMoveShouldSetPanResponder: () => editMode,

        onPanResponderGrant: () => {
          // Start offset from current committed position
          pan.setOffset({ x: committed.current.x, y: committed.current.y });
          pan.setValue({ x: 0, y: 0 });
        },

        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),

        onPanResponderRelease: (_, gs) => {
          pan.flattenOffset();

          // Clamp within body bounds
          const rawX = committed.current.x + gs.dx;
          const rawY = committed.current.y + gs.dy;
          const x = Math.max(0, Math.min(bodyW - btnW, rawX));
          const y = Math.max(0, Math.min(bodyH - btnH, rawY));

          pan.setValue({ x, y });
          committed.current = { x, y };
          onDrop({ x, y });
        },

        onPanResponderTerminate: (_, gs) => {
          pan.flattenOffset();
          const rawX = committed.current.x + gs.dx;
          const rawY = committed.current.y + gs.dy;
          const x = Math.max(0, Math.min(bodyW - btnW, rawX));
          const y = Math.max(0, Math.min(bodyH - btnH, rawY));
          pan.setValue({ x, y });
          committed.current = { x, y };
          onDrop({ x, y });
        },
      }),
    // Recreate whenever edit mode or bounds change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editMode, bodyW, bodyH, btnW, btnH],
  );

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { left: pan.x, top: pan.y },
        editMode && styles.editOutline,
      ]}
      {...panResponder.panHandlers}
    >
      {/* Move-handle chip — only visible in edit mode */}
      {editMode && (
        <View style={styles.handle} pointerEvents="none">
          <Feather name="move" size={9} color="#000" />
        </View>
      )}

      {/* In edit mode: disable child touch so buttons don't fire while dragging */}
      <View pointerEvents={editMode ? 'none' : 'auto'}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    zIndex: 10,
  },
  editOutline: {
    borderWidth: 1.5,
    borderColor: '#06b6d4',
    borderRadius: 16,
    padding: 3,
    backgroundColor: '#06b6d410',
  },
  handle: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#06b6d4',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 6,
  },
});
