/**
 * useHUDLayout — manages draggable button positions + sizes for the control HUD.
 *
 * Buttons: CAMERA, MENU, HUD_EDIT, NITRO, BRAKE
 * (Shockwave and Drift removed per user request)
 *
 * Each button stores: position { x, y } and scale (0.6 – 1.5).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const STORAGE_KEY = '@tilt2pc_hud_v3';

export type HUDButtonId = 'CAMERA' | 'MENU' | 'HUD_EDIT' | 'NITRO' | 'BRAKE';

/** Base pixel dimensions (at scale 1.0) of each button's bounding box. */
export const BUTTON_BOX: Record<HUDButtonId, { w: number; h: number }> = {
  CAMERA:   { w: 84,  h: 84  },
  MENU:     { w: 64,  h: 64  },
  HUD_EDIT: { w: 64,  h: 64  },
  NITRO:    { w: 130, h: 130 },
  BRAKE:    { w: 84,  h: 84  },
};

/** Default positions as fractions [xFrac, yFrac] of body container. */
const DEFAULTS: Record<HUDButtonId, [number, number]> = {
  CAMERA:   [0.01, 0.04],
  MENU:     [0.01, 0.47],
  HUD_EDIT: [0.01, 0.77],
  NITRO:    [0.76, 0.04],
  BRAKE:    [0.83, 0.65],
};

const DEFAULT_SCALE = 1.0;
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.5;
const SCALE_STEP = 0.1;

export type PosMap   = Record<HUDButtonId, { x: number; y: number }>;
export type ScaleMap = Record<HUDButtonId, number>;

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

export function clampPos(
  x: number,
  y: number,
  id: HUDButtonId,
  scale: number,
  bw: number,
  bh: number,
): { x: number; y: number } {
  const scaledW = BUTTON_BOX[id].w * scale;
  const scaledH = BUTTON_BOX[id].h * scale;
  return {
    x: Math.max(0, Math.min(bw - scaledW, x)),
    y: Math.max(0, Math.min(bh - scaledH, y)),
  };
}

interface StoredLayout {
  positions?: Partial<PosMap>;
  scales?: Partial<ScaleMap>;
}

export function useHUDLayout(bodyW: number, bodyH: number) {
  const [editMode, setEditMode] = useState(false);
  const [positions, setPositions] = useState<Partial<PosMap>>({});
  const [scales, setScales] = useState<Partial<ScaleMap>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed: StoredLayout = JSON.parse(raw);
          if (parsed.positions) setPositions(parsed.positions);
          if (parsed.scales) setScales(parsed.scales);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const _save = (nextPos: Partial<PosMap>, nextScales: Partial<ScaleMap>) => {
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ positions: nextPos, scales: nextScales }),
    ).catch(() => {});
  };

  const getPosition = (id: HUDButtonId): { x: number; y: number } =>
    positions[id] ?? computeDefaults(bodyW, bodyH)[id];

  const getScale = (id: HUDButtonId): number =>
    scales[id] ?? DEFAULT_SCALE;

  const updatePosition = (id: HUDButtonId, pos: { x: number; y: number }) => {
    const clamped = clampPos(pos.x, pos.y, id, getScale(id), bodyW, bodyH);
    const next = { ...positions, [id]: clamped };
    setPositions(next);
    _save(next, scales);
  };

  const updateScale = (id: HUDButtonId, rawScale: number) => {
    const s = parseFloat(
      Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawScale)).toFixed(1),
    );
    const next = { ...scales, [id]: s };
    setScales(next);
    _save(positions, next);
  };

  const decreaseScale = (id: HUDButtonId) =>
    updateScale(id, getScale(id) - SCALE_STEP);

  const increaseScale = (id: HUDButtonId) =>
    updateScale(id, getScale(id) + SCALE_STEP);

  const resetLayout = () => {
    setPositions({});
    setScales({});
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  };

  return {
    editMode,
    setEditMode,
    getPosition,
    getScale,
    updatePosition,
    updateScale,
    decreaseScale,
    increaseScale,
    resetLayout,
    ready,
  };
}
