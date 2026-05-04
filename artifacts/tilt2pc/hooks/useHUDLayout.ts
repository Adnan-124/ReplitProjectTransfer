/**
 * useHUDLayout — manages draggable button positions for the control HUD.
 *
 * Positions are stored in AsyncStorage as pixel coordinates relative to
 * the body container (measured via onLayout in control.tsx).
 *
 * Default positions are expressed as fractions of body dimensions so the
 * layout scales correctly across different phone sizes/orientations.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const STORAGE_KEY = '@tilt2pc_hud_v2';

export type HUDButtonId = 'CAMERA' | 'SHOCK' | 'MENU' | 'NITRO' | 'DRIFT' | 'BRAKE';

/** Pixel dimensions of each button's bounding box (width × height). */
export const BUTTON_BOX: Record<HUDButtonId, { w: number; h: number }> = {
  CAMERA: { w: 84,  h: 84  },
  SHOCK:  { w: 64,  h: 64  },
  MENU:   { w: 64,  h: 64  },
  NITRO:  { w: 130, h: 130 }, // NitroButton wrapper includes bar + hint
  DRIFT:  { w: 84,  h: 84  },
  BRAKE:  { w: 84,  h: 84  },
};

/**
 * Default positions as fractions [xFrac, yFrac] of the body container.
 * Values map to the left-top corner of each button bounding box.
 */
const DEFAULTS: Record<HUDButtonId, [number, number]> = {
  CAMERA: [0.01, 0.04],
  SHOCK:  [0.01, 0.43],
  MENU:   [0.01, 0.78],
  NITRO:  [0.76, 0.04],
  DRIFT:  [0.65, 0.63],
  BRAKE:  [0.83, 0.63],
};

export type PosMap = Record<HUDButtonId, { x: number; y: number }>;

/** Compute pixel defaults from body dimensions. */
function computeDefaults(bw: number, bh: number): PosMap {
  const result = {} as PosMap;
  for (const [id, [xf, yf]] of Object.entries(DEFAULTS) as [HUDButtonId, [number, number]][]) {
    const { w, h } = BUTTON_BOX[id];
    result[id] = {
      x: Math.max(0, Math.min(bw - w, bw * xf)),
      y: Math.max(0, Math.min(bh - h, bh * yf)),
    };
  }
  return result;
}

/** Clamp a position so the button stays within body bounds. */
export function clampPos(
  x: number,
  y: number,
  id: HUDButtonId,
  bw: number,
  bh: number,
): { x: number; y: number } {
  const { w, h } = BUTTON_BOX[id];
  return {
    x: Math.max(0, Math.min(bw - w, x)),
    y: Math.max(0, Math.min(bh - h, y)),
  };
}

export function useHUDLayout(bodyW: number, bodyH: number) {
  const [editMode, setEditMode] = useState(false);
  /** Overrides: only stores buttons the user has explicitly moved. */
  const [overrides, setOverrides] = useState<Partial<PosMap>>({});
  const [ready, setReady] = useState(false);

  // Load saved positions on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setOverrides(JSON.parse(raw) as Partial<PosMap>);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  /** Get the effective position for a button (override or default). */
  const getPosition = (id: HUDButtonId): { x: number; y: number } => {
    return overrides[id] ?? computeDefaults(bodyW, bodyH)[id];
  };

  /** Called when user finishes dragging a button. */
  const updatePosition = (id: HUDButtonId, pos: { x: number; y: number }) => {
    const clamped = clampPos(pos.x, pos.y, id, bodyW, bodyH);
    const next = { ...overrides, [id]: clamped };
    setOverrides(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  /** Restore all buttons to default positions. */
  const resetLayout = () => {
    setOverrides({});
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  };

  return {
    editMode,
    setEditMode,
    getPosition,
    updatePosition,
    resetLayout,
    ready,
  };
}
