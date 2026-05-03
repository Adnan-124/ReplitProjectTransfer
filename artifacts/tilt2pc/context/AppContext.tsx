import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface Settings {
  sensitivity: number;
  alpha: number;
  beta: number;
  deadzone: number;
  invertSteering: boolean;
  sampleRate: number;
}

export interface Profile {
  id: string;
  name: string;
  settings: Settings;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface AppContextValue {
  ip: string;
  port: string;
  pin: string;
  setIp: (v: string) => void;
  setPort: (v: string) => void;
  setPin: (v: string) => void;
  connectionStatus: ConnectionStatus;
  ping: number;
  connect: () => void;
  disconnect: () => void;
  sendMessage: (msg: object) => boolean;
  neutralX: number;
  calibrate: (x: number) => void;
  settings: Settings;
  updateSettings: (partial: Partial<Settings>) => void;
  profiles: Profile[];
  activeProfileId: string;
  saveCurrentProfile: (name: string) => Promise<void>;
  loadProfile: (id: string) => void;
  deleteProfile: (id: string) => Promise<void>;
  steerValue: number;
  setSteerValue: (v: number) => void;
  actualHz: number;
  setActualHz: (v: number) => void;
  lastEvent: string;
  setLastEvent: (v: string) => void;
}

const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1.5,
  alpha: 0.35,
  beta: 0.08,
  deadzone: 0.05,
  invertSteering: false,
  sampleRate: 60,
};

const KEYS = {
  profiles: 'tilt2pc_profiles',
  activeProfile: 'tilt2pc_active',
  settings: 'tilt2pc_settings',
  neutralX: 'tilt2pc_neutral',
  lastIp: 'tilt2pc_ip',
  lastPort: 'tilt2pc_port',
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ip, setIpState] = useState('192.168.1.100');
  const [port, setPortState] = useState('3333');
  const [pin, setPinState] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [ping, setPing] = useState(0);
  const [neutralX, setNeutralXState] = useState(0);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState('default');
  const [steerValue, setSteerValueState] = useState(0);
  const [actualHz, setActualHzState] = useState(0);
  const [lastEvent, setLastEventState] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingMapRef = useRef<Map<number, number>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const [storedIp, storedPort, storedNeutral, storedSettings, storedProfiles, storedActiveId] =
          await Promise.all([
            AsyncStorage.getItem(KEYS.lastIp),
            AsyncStorage.getItem(KEYS.lastPort),
            AsyncStorage.getItem(KEYS.neutralX),
            AsyncStorage.getItem(KEYS.settings),
            AsyncStorage.getItem(KEYS.profiles),
            AsyncStorage.getItem(KEYS.activeProfile),
          ]);
        if (storedIp) setIpState(storedIp);
        if (storedPort) setPortState(storedPort);
        if (storedNeutral) setNeutralXState(parseFloat(storedNeutral));
        if (storedSettings) setSettingsState({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) });
        if (storedProfiles) setProfiles(JSON.parse(storedProfiles));
        if (storedActiveId) setActiveProfileId(storedActiveId);
      } catch {}
    })();
  }, []);

  const setIp = useCallback((v: string) => {
    setIpState(v);
    AsyncStorage.setItem(KEYS.lastIp, v).catch(() => {});
  }, []);

  const setPort = useCallback((v: string) => {
    setPortState(v);
    AsyncStorage.setItem(KEYS.lastPort, v).catch(() => {});
  }, []);

  const setPin = useCallback((v: string) => setPinState(v), []);

  const calibrate = useCallback((x: number) => {
    setNeutralXState(x);
    AsyncStorage.setItem(KEYS.neutralX, x.toString()).catch(() => {});
  }, []);

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...partial };
      AsyncStorage.setItem(KEYS.settings, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const sendMessage = useCallback((msg: object): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatRef.current = setInterval(() => {
      const ts = Date.now();
      pingMapRef.current.set(ts, ts);
      sendMessage({ type: 'heartbeat', ts });
    }, 2000);
  }, [sendMessage, stopHeartbeat]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    stopHeartbeat();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
  }, [stopHeartbeat]);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('connecting');
    shouldReconnectRef.current = true;

    try {
      const ws = new WebSocket(`ws://${ip}:${port}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        ws.send(JSON.stringify({ type: 'config', client: 'tilt2pc-android', ver: '1.0', pin }));
        startHeartbeat();
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string);
          if (data.type === 'pong' || data.type === 'heartbeat') {
            const sentTs: number = data.ts;
            const now = Date.now();
            if (pingMapRef.current.has(sentTs)) {
              setPing(now - sentTs);
              pingMapRef.current.delete(sentTs);
            }
          }
        } catch {}
      };

      ws.onerror = () => setConnectionStatus('error');

      ws.onclose = () => {
        stopHeartbeat();
        if (shouldReconnectRef.current) {
          setConnectionStatus('error');
          reconnectTimerRef.current = setTimeout(() => {
            if (shouldReconnectRef.current) connect();
          }, 3000);
        } else {
          setConnectionStatus('disconnected');
        }
      };
    } catch {
      setConnectionStatus('error');
    }
  }, [ip, port, pin, startHeartbeat, stopHeartbeat]);

  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      stopHeartbeat();
      wsRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [stopHeartbeat]);

  const saveCurrentProfile = useCallback(
    async (name: string) => {
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
      const profile: Profile = { id, name, settings };
      const next = [...profiles.filter((p) => p.name !== name), profile];
      setProfiles(next);
      setActiveProfileId(id);
      await Promise.all([
        AsyncStorage.setItem(KEYS.profiles, JSON.stringify(next)),
        AsyncStorage.setItem(KEYS.activeProfile, id),
      ]);
    },
    [profiles, settings],
  );

  const loadProfile = useCallback(
    (id: string) => {
      const profile = profiles.find((p) => p.id === id);
      if (profile) {
        setSettingsState(profile.settings);
        setActiveProfileId(id);
        AsyncStorage.setItem(KEYS.activeProfile, id).catch(() => {});
      }
    },
    [profiles],
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      const next = profiles.filter((p) => p.id !== id);
      setProfiles(next);
      await AsyncStorage.setItem(KEYS.profiles, JSON.stringify(next));
    },
    [profiles],
  );

  const setSteerValue = useCallback((v: number) => setSteerValueState(v), []);
  const setActualHz = useCallback((v: number) => setActualHzState(v), []);
  const setLastEvent = useCallback((v: string) => setLastEventState(v), []);

  return (
    <AppContext.Provider
      value={{
        ip, port, pin, setIp, setPort, setPin,
        connectionStatus, ping, connect, disconnect, sendMessage,
        neutralX, calibrate,
        settings, updateSettings,
        profiles, activeProfileId, saveCurrentProfile, loadProfile, deleteProfile,
        steerValue, setSteerValue,
        actualHz, setActualHz,
        lastEvent, setLastEvent,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
