/**
 * useTilt — Accelerometer-based steering for Tilt2PC
 *
 * AXIS MAPPING (why we switch axes in landscape):
 * ─────────────────────────────────────────────────────────────────
 * The accelerometer axes are FIXED to the phone hardware — they do
 * NOT rotate when the screen orientation changes.
 *
 * Portrait mode:
 *   +x = points RIGHT along short edge  → left/right tilt = x ✓
 *   +y = points UP along long edge      → up/down tilt = y (ignored)
 *
 * Landscape mode (phone rotated 90°):
 *   +x = now points DOWN (was right)    → x measures PITCH (up/down tilt) ✗
 *   +y = now points LEFT or RIGHT       → y measures ROLL  (left/right tilt) ✓
 *
 * Reading x in landscape is WHY "tilting up = turning left" happens.
 * Solution: switch to reading y in landscape mode.
 *
 * Sign of y depends on rotation direction:
 *   LANDSCAPE_LEFT  (home on right, rotated CW):  +y points LEFT  → use -y
 *   LANDSCAPE_RIGHT (home on left,  rotated CCW): +y points RIGHT → use +y
 */

import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useApp } from '@/context/AppContext';

export function useTilt(active: boolean) {
  const { settings, neutralX: neutralTilt, sendMessage, setSteerValue, setActualHz } = useApp();

  const prevSmoothed = useRef(0);
  const prevPrevSmoothed = useRef(0);
  const lastSent = useRef(0);
  const lastSentTime = useRef(0);
  const hzCountRef = useRef(0);
  const hzTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track screen orientation so we pick the correct axis
  const orientationRef = useRef<ScreenOrientation.Orientation>(
    ScreenOrientation.Orientation.PORTRAIT_UP,
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;

    ScreenOrientation.getOrientationAsync()
      .then((o) => { orientationRef.current = o; })
      .catch(() => {});

    const sub = ScreenOrientation.addOrientationChangeListener(({ orientationInfo }) => {
      orientationRef.current = orientationInfo.orientation;
    });

    return () => ScreenOrientation.removeOrientationChangeListener(sub);
  }, []);

  useEffect(() => {
    if (!active || Platform.OS === 'web') return;

    let Accelerometer: {
      setUpdateInterval: (ms: number) => void;
      addListener: (
        cb: (data: { x: number; y: number; z: number }) => void,
      ) => { remove: () => void };
    };
    try {
      Accelerometer = require('expo-sensors').Accelerometer;
    } catch {
      return;
    }

    const { sensitivity, alpha, beta, deadzone, invertSteering, sampleRate } = settings;

    // sensitivity: 0-100 UI scale where 100 = most sensitive
    // Divisor = how many g of tilt produce full steer (±1)
    //   100 → 0.20 (~12° tilt = full steer)
    //    70 → 0.59 (~36° tilt = full steer, default)
    //    50 → 0.85 (~58° tilt = full steer)
    //     0 → 1.50 (~90° tilt = full steer)
    const sensitivityDivisor = Math.max(0.1, 1.5 - (1.3 * sensitivity) / 100);

    Accelerometer.setUpdateInterval(Math.round(1000 / sampleRate));

    hzTimerRef.current = setInterval(() => {
      setActualHz(hzCountRef.current);
      hzCountRef.current = 0;
    }, 1000);

    const subscription = Accelerometer.addListener(
      ({ x, y }: { x: number; y: number; z: number }) => {
        hzCountRef.current += 1;

        // ── AXIS SELECTION ─────────────────────────────────────────
        const o = orientationRef.current;
        const Ori = ScreenOrientation.Orientation;

        let steerAxis: number;
        if (o === Ori.LANDSCAPE_LEFT) {
          // Rotated CW: +y points LEFT → negate so right tilt = positive
          steerAxis = -y;
        } else if (o === Ori.LANDSCAPE_RIGHT) {
          // Rotated CCW: +y points RIGHT → use directly
          steerAxis = y;
        } else {
          // Portrait (up or down): +x is always left/right tilt
          steerAxis = o === Ori.PORTRAIT_DOWN ? -x : x;
        }

        // ── STEERING PIPELINE ──────────────────────────────────────
        const raw = invertSteering ? -steerAxis : steerAxis;

        // 1. Remove calibrated neutral offset, scale to [-1, 1]
        const normalized = (raw - neutralTilt) / sensitivityDivisor;
        const clamped = Math.max(-1, Math.min(1, normalized));

        // 2. Deadzone: ignore small centre wobble
        const dz = deadzone / 100;
        const withDeadzone =
          Math.abs(clamped) < dz
            ? 0
            : clamped > 0
              ? (clamped - dz) / (1 - dz)
              : (clamped + dz) / (1 - dz);

        // 3. Exponential low-pass filter
        //    alpha near 1.0 = raw/instant, near 0.0 = very smooth but laggy
        const smoothed = alpha * withDeadzone + (1 - alpha) * prevSmoothed.current;

        // 4. Predictive delta: compensates for filter-induced lag
        const predicted = smoothed + beta * (smoothed - prevPrevSmoothed.current);
        const finalValue = Math.max(-1, Math.min(1, predicted));

        prevPrevSmoothed.current = prevSmoothed.current;
        prevSmoothed.current = smoothed;

        setSteerValue(finalValue);

        // 5. Send only when value changed enough OR periodic timeout
        const now = Date.now();
        const changed = Math.abs(finalValue - lastSent.current) > 0.004;
        const timedOut = now - lastSentTime.current > 40;

        if (changed || timedOut) {
          sendMessage({
            type: 'steer',
            ts: now,
            value: parseFloat(finalValue.toFixed(4)),
          });
          lastSent.current = finalValue;
          lastSentTime.current = now;
        }
      },
    );

    return () => {
      subscription.remove();
      if (hzTimerRef.current) clearInterval(hzTimerRef.current);
    };
  }, [active, settings, neutralTilt, sendMessage, setSteerValue, setActualHz]);

  // Web: sine-wave simulation so the UI is previewable in browser
  useEffect(() => {
    if (!active || Platform.OS !== 'web') return;
    let t = 0;
    const interval = setInterval(() => {
      t += 0.035;
      setSteerValue(Math.sin(t) * 0.55);
      setActualHz(60);
    }, 16);
    return () => clearInterval(interval);
  }, [active, setSteerValue, setActualHz]);
}
