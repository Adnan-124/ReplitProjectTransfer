import { Stack } from 'expo-router';
import React from 'react';
import { useColors } from '@/hooks/useColors';

export default function AppLayout() {
  const colors = useColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        contentStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', letterSpacing: 1 },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="control" options={{ headerShown: false }} />
      <Stack.Screen
        name="calibrate"
        options={{ title: 'CALIBRATION', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="settings"
        options={{ title: 'SETTINGS', headerBackTitle: 'Back' }}
      />
    </Stack>
  );
}
