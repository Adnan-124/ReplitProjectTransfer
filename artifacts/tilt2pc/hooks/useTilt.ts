/**
 * useTilt — Accelerometer steering hook for Tilt2PC
 *
 * ═══════════════════════════════════════════════════════════════
 * AXIS PHYSICS — why we use y (not x) in landscape
 * ═══════════════════════════════════════════════════════════════
 *
 * The accelerometer axes are bolted to the hardware and NEVER rotate
 * when the screen orientation changes.
 *
 * Expo convention: accelerometer = -(gravity projection) in g-units.
 *   Flat on table face-up:  z = -1  (gravity pulls toward -z)
 *   Portrait held upright:  y = -1  (gravity pulls toward -y, which is down)
 *   On left edge (landscape): x = +1 (gravity pulls toward -x, inverted → +1)
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  PORTRAIT               │  LANDSCAPE (phone rotated)        │
 * │  +y = UP                │  x is now gravity axis (≈ ±1)    │
 * │  +x = RIGHT → steering  │  y is now steering axis          │
 * │  Tilt right → x > 0 ✓  │  x in portrait was right,        │
 * │                          │  in landscape it's up/down       │
 * │  Using x in landscape = reading PITCH (up/down), not ROLL  │
 * └─────────────────────────────────────────────────────────────┘
 *
 * ORIENTATION DETECTION (no async, no race conditions):
 *   Read the x value itself — in landscape x ≈ ±1 (it IS gravity).
 *   x < 0 → LANDSCAPE_LEFT (home on left):  steer = −y
 *   x > 0 → LANDSCAPE_RIGHT (home on right): steer = +y
 *
 * Both cases: right side UP → car turns LEFT, left side UP → car turns RIGHT ✓
 */

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

  // Slowly-decaying x average so orientation detection is stable
  // even during extreme banking. Alpha = 0.03 ≈ ~33 samples to settle.
  const smoothXRef = useRef(0);

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

    // sensitivity 0-100 → physical divisor (g-force that = full steer ±1)
    //   100 → 0.20  (~12° tilt = full steer)
    //    70 → 0.59  (~36° tilt, default)
    //    50 → 0.85  (~58° tilt)
    //     0 → 1.50  (~90° tilt)
    const sensitivityDivisor = Math.max(0.1, 1.5 - (1.3 * sensitivity) / 100);

    Accelerometer.setUpdateInterval(Math.round(1000 / sampleRate));

    hzTimerRef.current = setInterval(() => {
      setActualHz(hzCountRef.current);
      hzCountRef.current = 0;
    }, 1000);

    // Seed smoothX with 0 so it converges to the actual x within ~1 second.
    // We don't need it to be accurate immediately — the deadzone handles that.
    smoothXRef.current = 0;

    const subscription = Accelerometer.addListener(
      ({ x, y }: { x: number; y: number; z: number }) => {
        hzCountRef.current += 1;

        // ── ORIENTATION AUTO-DETECTION ───────────────────────────
        // Update the slow x tracker. Alpha=0.03 → very stable sign,
        // won't flip from normal gameplay banking.
        smoothXRef.current = 0.03 * x + 0.97 * smoothXRef.current;

        // In landscape the phone has been rotated 90°, so x is the
        // gravity axis (≈ ±1) and y is the left/right steering axis.
        // We detect which landscape orientation by the sign of x:
        //
        //   smoothX < 0  →  LANDSCAPE_LEFT  (home on left,  rotated CW)
        //                   +y points RIGHT → right side up → y > 0
        //                   → steer = -y   (negative = LEFT steer) ✓
        //
        //   smoothX > 0  →  LANDSCAPE_RIGHT (home on right, rotated CCW)
        //                   +y points LEFT  → right side up → y < 0
        //                   → steer = y    (negative = LEFT steer) ✓
        //
        //   |smoothX| < 0.25  → portrait or phone is nearly vertical
        //                        fallback to x (classic portrait steering)

        let steerAxis: number;
        const sx = smoothXRef.current;

        if (sx < -0.25) {
          // LANDSCAPE_LEFT
          steerAxis = -y;
        } else if (sx > 0.25) {
          // LANDSCAPE_RIGHT
          steerAxis = y;
        } else {
          // Portrait / transitioning
          steerAxis = x;
        }

        // ── STEERING PIPELINE ────────────────────────────────────

        const raw = invertSteering ? -steerAxis : steerAxis;

        // 1. Remove calibrated neutral, scale to [-1, 1]
        const normalized = (raw - neutralTilt) / sensitivityDivisor;
        const clamped = Math.max(-1, Math.min(1, normalized));

        // 2. Deadzone — kill small centre wobble
        const dz = deadzone / 100;
        const withDeadzone =
          Math.abs(clamped) < dz
            ? 0
            : clamped > 0
              ? (clamped - dz) / (1 - dz)
              : (clamped + dz) / (1 - dz);

        // 3. Exponential low-pass (alpha near 1 = raw/instant, near 0 = laggy)
        const smoothed = alpha * withDeadzone + (1 - alpha) * prevSmoothed.current;

        // 4. Predictive delta to cancel filter lag
        const predicted = smoothed + beta * (smoothed - prevPrevSmoothed.current);
        const finalValue = Math.max(-1, Math.min(1, predicted));

        prevPrevSmoothed.current = prevSmoothed.current;
        prevSmoothed.current = smoothed;

        setSteerValue(finalValue);

        // 5. Send if changed enough or timed out
        const now = Date.now();
        if (Math.abs(finalValue - lastSent.current) > 0.004 || now - lastSentTime.current > 40) {
          sendMessage({ type: 'steer', ts: now, value: parseFloat(finalValue.toFixed(4)) });
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

  // Web: sine-wave simulation for browser preview
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
