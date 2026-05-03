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
    Accelerometer.setUpdateInterval(Math.round(1000 / sampleRate));

    hzTimerRef.current = setInterval(() => {
      setActualHz(hzCountRef.current);
      hzCountRef.current = 0;
    }, 1000);

    const subscription = Accelerometer.addListener(({ x }: { x: number; y: number; z: number }) => {
      hzCountRef.current += 1;

      const raw = invertSteering ? -x : x;
      const normalized = (raw - neutralX) / sensitivity;
      const clamped = Math.max(-1, Math.min(1, normalized));
      const dz = deadzone;
      const withDeadzone =
        Math.abs(clamped) < dz
          ? 0
          : clamped > 0
            ? (clamped - dz) / (1 - dz)
            : (clamped + dz) / (1 - dz);

      const smoothed = alpha * withDeadzone + (1 - alpha) * prevSmoothed.current;
      const predicted = smoothed + beta * (smoothed - prevPrevSmoothed.current);
      const finalValue = Math.max(-1, Math.min(1, predicted));

      prevPrevSmoothed.current = prevSmoothed.current;
      prevSmoothed.current = smoothed;

      setSteerValue(finalValue);

      const now = Date.now();
      const changed = Math.abs(finalValue - lastSent.current) > 0.005;
      const timedOut = now - lastSentTime.current > 50;

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

  useEffect(() => {
    if (!active || Platform.OS !== 'web') return;
    let t = 0;
    const interval = setInterval(() => {
      t += 0.04;
      setSteerValue(Math.sin(t) * 0.4);
      setActualHz(60);
    }, 16);
    return () => clearInterval(interval);
  }, [active, setSteerValue, setActualHz]);
}
