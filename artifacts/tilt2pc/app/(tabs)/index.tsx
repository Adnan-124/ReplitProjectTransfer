import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, type ConnectionStatus } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const STATUS_CONFIG: Record<ConnectionStatus, { color: string; label: string; icon: keyof typeof Feather.glyphMap }> = {
  disconnected: { color: '#6b7280', label: 'Disconnected', icon: 'wifi-off' },
  connecting: { color: '#fbbf24', label: 'Connecting…', icon: 'loader' },
  connected: { color: '#22c55e', label: 'Connected', icon: 'wifi' },
  error: { color: '#ef4444', label: 'Connection Failed', icon: 'alert-circle' },
};

export default function PairingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ip, port, pin, setIp, setPort, setPin, connectionStatus, ping, connect, disconnect } = useApp();
  const [saveNameInput] = useState('');

  const statusCfg = STATUS_CONFIG[connectionStatus];
  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  const handleConnect = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (isConnected || isConnecting) {
      disconnect();
    } else {
      connect();
    }
  };

  const handleGoControl = () => {
    if (!isConnected) return;
    router.push('/(tabs)/control');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 20),
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.logoContainer, { borderColor: colors.primary + '44' }]}>
            <Feather name="navigation" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>TILT2PC</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Asphalt 9 Tilt Controller
          </Text>
        </View>

        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusCfg.color + '18', borderColor: statusCfg.color + '44' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
          <Feather name={statusCfg.icon} size={14} color={statusCfg.color} />
          <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          {isConnected && ping > 0 && (
            <Text style={[styles.pingText, { color: colors.mutedForeground }]}>
              {ping}ms
            </Text>
          )}
        </View>

        {/* Connection Form */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>WINDOWS PC</Text>

          <View style={styles.row}>
            <View style={styles.ipField}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>IP ADDRESS</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                value={ip}
                onChangeText={setIp}
                placeholder="192.168.1.100"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isConnected && !isConnecting}
              />
            </View>
            <View style={styles.portField}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>PORT</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                value={port}
                onChangeText={setPort}
                placeholder="3333"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                editable={!isConnected && !isConnecting}
              />
            </View>
          </View>

          <View style={styles.pinRow}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>PIN (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
              value={pin}
              onChangeText={setPin}
              placeholder="Leave empty if not set"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              secureTextEntry
              editable={!isConnected && !isConnecting}
            />
          </View>
        </View>

        {/* Connect Button */}
        <TouchableOpacity
          style={[
            styles.connectButton,
            {
              backgroundColor: isConnected
                ? colors.destructive + '22'
                : isConnecting
                  ? colors.muted
                  : colors.primary,
              borderColor: isConnected ? colors.destructive : isConnecting ? colors.border : colors.primary,
            },
          ]}
          onPress={handleConnect}
          activeOpacity={0.8}
        >
          <Feather
            name={isConnected ? 'x-circle' : isConnecting ? 'loader' : 'zap'}
            size={20}
            color={isConnected ? colors.destructive : isConnecting ? colors.mutedForeground : colors.primaryForeground}
          />
          <Text
            style={[
              styles.connectButtonText,
              {
                color: isConnected
                  ? colors.destructive
                  : isConnecting
                    ? colors.mutedForeground
                    : colors.primaryForeground,
              },
            ]}
          >
            {isConnected ? 'DISCONNECT' : isConnecting ? 'CONNECTING…' : 'CONNECT'}
          </Text>
        </TouchableOpacity>

        {/* Drive Button */}
        {isConnected && (
          <TouchableOpacity
            style={[styles.driveButton, { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={handleGoControl}
            activeOpacity={0.8}
          >
            <Feather name="navigation-2" size={20} color="#fff" />
            <Text style={styles.driveButtonText}>START DRIVING</Text>
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <QuickAction
            icon="crosshair"
            label="Calibrate"
            colors={colors}
            onPress={() => router.push('/(tabs)/calibrate')}
          />
          <QuickAction
            icon="sliders"
            label="Settings"
            colors={colors}
            onPress={() => router.push('/(tabs)/settings')}
          />
        </View>

        {/* Protocol info */}
        <View style={[styles.infoBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Feather name="info" size={12} color={colors.mutedForeground} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            Install the Tilt2PC Windows companion and ensure both devices are on the same Wi-Fi network.
          </Text>
        </View>

        <Text style={[styles.disclaimer, { color: colors.mutedForeground + '88' }]}>
          Tilt2PC maps raw inputs only. It does not automate gameplay or read game memory.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function QuickAction({
  icon,
  label,
  colors,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.quickBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Feather name={icon} size={22} color={colors.primary} />
      <Text style={[styles.quickBtnLabel, { color: colors.foreground }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20, gap: 16 },
  header: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00d4ff11',
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 6,
  },
  subtitle: {
    fontSize: 13,
    letterSpacing: 2,
    fontWeight: '500',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: { fontSize: 13, fontWeight: '600', flex: 1 },
  pingText: { fontSize: 12 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  row: { flexDirection: 'row', gap: 10 },
  ipField: { flex: 1, gap: 4 },
  portField: { width: 90, gap: 4 },
  pinRow: { gap: 4 },
  fieldLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1.5 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 2,
    paddingVertical: 16,
  },
  connectButtonText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  driveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 2,
    paddingVertical: 16,
  },
  driveButtonText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#fff',
  },
  quickActions: { flexDirection: 'row', gap: 12 },
  quickBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  quickBtnLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  infoText: { fontSize: 12, lineHeight: 18, flex: 1 },
  disclaimer: { fontSize: 10, textAlign: 'center', lineHeight: 15 },
});
