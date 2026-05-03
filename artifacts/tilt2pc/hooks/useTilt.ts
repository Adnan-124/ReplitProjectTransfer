import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useApp } from '@/context/AppContext';

export function useTilt(active: boolean) {
  const { settings, neutralX, sendMessage, setSteerValue, setActualHz } = useApp();

  const prevSmoothed = useRef(0);
  const prevPrevSmoothed = useRef(0);
  const lastSent = useRef(0);
  const lastSentTime = useRef(0);
  const hzCountRef = useRef(0);
  const hzTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || Platform.OS === 'web') return;

    let Accelerometer: {
      setUpdateInterval: (ms: number) => void;
      addListener: (cb: (data: { x: number; y: number; z: number }) => void) => { remove: () => void };
    };
    try {
      Accelerometer = require('expo-sensors').Accelerometer;
    } catch {
      return;
    }

    const { sensitivity, alpha, beta, deadzone, invertSteering, sampleRate } = settings;

    // sensitivity: 0-100 UI scale where 100 = most sensitive
    // Map to physical divisor: how many g-force units of tilt = full steer (±1)
    // At 100 (most sensitive): ~12° tilt = full steer (divisor ≈ 0.20)
    // At 70 (default):         ~36° tilt = full steer (divisor ≈ 0.59)
    // At 50:                   ~48° tilt = full steer (divisor ≈ 0.85)
    // At 0 (least sensitive):  ~87° tilt = full steer (divisor ≈ 1.50)
    const sensitivityDivisor = Math.max(0.1, 1.5 - (1.3 * sensitivity / 100));

    Accelerometer.setUpdateInterval(Math.round(1000 / sampleRate));

    // Hz counter
    hzTimerRef.current = setInterval(() => {
      setActualHz(hzCountRef.current);
      hzCountRef.current = 0;
    }, 1000);

    const subscription = Accelerometer.addListener(({ x }: { x: number; y: number; z: number }) => {
      hzCountRef.current += 1;

      const raw = invertSteering ? -x : x;

      // 1. Normalize: map physical tilt to [-1, 1] using calibrated neutral + divisor
      const normalized = (raw - neutralX) / sensitivityDivisor;
      const clamped = Math.max(-1, Math.min(1, normalized));

      // 2. Deadzone: remove noise around center
      const dz = deadzone / 100; // deadzone is also 0-100, convert to 0-1
      const withDeadzone =
        Math.abs(clamped) < dz
          ? 0
          : clamped > 0
            ? (clamped - dz) / (1 - dz)
            : (clamped + dz) / (1 - dz);

      // 3. Exponential low-pass filter (reduces jitter, smooths input)
      //    alpha: 0.1 (very smooth/laggy) → 1.0 (raw/instant)
      const smoothed = alpha * withDeadzone + (1 - alpha) * prevSmoothed.current;

      // 4. Predictive component: compensates for filter lag
      //    predicted = smoothed + beta * velocity estimate
      const predicted = smoothed + beta * (smoothed - prevPrevSmoothed.current);
      const finalValue = Math.max(-1, Math.min(1, predicted));

      prevPrevSmoothed.current = prevSmoothed.current;
      prevSmoothed.current = smoothed;

      setSteerValue(finalValue);

      // 5. Send only if changed enough OR timeout (keeps Windows server updated)
      const now = Date.now();
      const changed = Math.abs(finalValue - lastSent.current) > 0.004;
      const timedOut = now - lastSentTime.current > 40;

      if (changed || timedOut) {
        sendMessage({ type: 'steer', ts: now, value: parseFloat(finalValue.toFixed(4)) });
        lastSent.current = finalValue;
        lastSentTime.current = now;
      }
    });

    return () => {
      subscription.remove();
      if (hzTimerRef.current) clearInterval(hzTimerRef.current);
    };
  }, [active, settings, neutralX, sendMessage, setSteerValue, setActualHz]);

  // Web: simulate tilt with a sine wave for previewing the UI
  useEffect(() => {
    if (!active || Platform.OS !== 'web') return;
    let t = 0;
    const interval = setInterval(() => {
      t += 0.035;
      const sim = Math.sin(t) * 0.55;
      setSteerValue(sim);
      setActualHz(60);
    }, 16);
    return () => clearInterval(interval);
  }, [active, setSteerValue, setActualHz]);
}
