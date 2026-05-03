import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export function DiagnosticsOverlay() {
  const colors = useColors();
  const { ping, steerValue, actualHz, lastEvent, connectionStatus } = useApp();

  const pingColor = ping === 0 ? colors.mutedForeground : ping < 20 ? colors.success : ping < 50 ? colors.primary : colors.accent;
  const connected = connectionStatus === 'connected';

  return (
    <View style={[styles.container, { backgroundColor: colors.card + 'dd', borderColor: colors.border }]}>
      <DiagItem label="STEER" value={steerValue.toFixed(3)} color={colors.foreground} />
      <Divider colors={colors} />
      <DiagItem label="HZ" value={`${actualHz}`} color={colors.foreground} />
      <Divider colors={colors} />
      <DiagItem label="PING" value={connected ? `${ping}ms` : '---'} color={pingColor} />
      {lastEvent ? (
        <>
          <Divider colors={colors} />
          <DiagItem label="EVT" value={lastEvent} color={colors.mutedForeground} />
        </>
      ) : null}
    </View>
  );
}

function DiagItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.item}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }]}>{value}</Text>
    </View>
  );
}

function Divider({ colors }: { colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  item: { alignItems: 'center', gap: 2 },
  label: {
    fontSize: 9,
    color: '#6b7280',
    letterSpacing: 1.2,
    fontWeight: '600',
  },
  value: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  divider: { width: 1, height: 28 },
});
