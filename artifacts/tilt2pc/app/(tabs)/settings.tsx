import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const SAMPLE_RATES = [30, 60, 90, 120];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    settings,
    updateSettings,
    profiles,
    activeProfileId,
    saveCurrentProfile,
    loadProfile,
    deleteProfile,
  } = useApp();
  const [profileName, setProfileName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const handleSaveProfile = async () => {
    if (!profileName.trim()) return;
    await saveCurrentProfile(profileName.trim());
    setProfileName('');
    setShowSaveInput(false);
  };

  const handleDeleteProfile = (id: string, name: string) => {
    if (Platform.OS === 'web') {
      deleteProfile(id);
      return;
    }
    Alert.alert('Delete Profile', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteProfile(id) },
    ]);
  };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 24) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Steering */}
      <Section title="STEERING" colors={colors}>
        <Stepper
          label="Sensitivity"
          description="0 = hard to steer · 100 = very responsive (like Asphalt 9)"
          value={settings.sensitivity}
          min={0}
          max={100}
          step={1}
          decimals={0}
          unit=""
          colors={colors}
          onChange={(v) => updateSettings({ sensitivity: v })}
        />
        <Stepper
          label="Deadzone"
          description="Ignore small tilts near center (0–30%)"
          value={settings.deadzone}
          min={0}
          max={30}
          step={1}
          decimals={0}
          unit="%"
          colors={colors}
          onChange={(v) => updateSettings({ deadzone: v })}
        />
        <ToggleRow
          label="Invert Steering"
          description="Swap left/right tilt direction"
          value={settings.invertSteering}
          colors={colors}
          onChange={(v) => updateSettings({ invertSteering: v })}
        />
      </Section>

      {/* Smoothing */}
      <Section title="SMOOTHING & LATENCY" colors={colors}>
        <Stepper
          label="Alpha"
          description="Filter strength: 0.05 = max smooth (laggy) · 1.0 = raw (instant)"
          value={settings.alpha}
          min={0.05}
          max={1.0}
          step={0.05}
          decimals={2}
          unit=""
          colors={colors}
          onChange={(v) => updateSettings({ alpha: v })}
        />
        <Stepper
          label="Beta (predictive)"
          description="Compensates filter lag. 0 = off · 0.30 = max"
          value={settings.beta}
          min={0}
          max={0.3}
          step={0.01}
          decimals={2}
          unit=""
          colors={colors}
          onChange={(v) => updateSettings({ beta: v })}
        />
      </Section>

      {/* Performance */}
      <Section title="PERFORMANCE" colors={colors}>
        <View style={styles.rateBlock}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Sample Rate</Text>
          <Text style={[styles.fieldDesc, { color: colors.mutedForeground }]}>
            Higher = smoother steering, uses more battery
          </Text>
          <View style={styles.ratePills}>
            {SAMPLE_RATES.map((rate) => (
              <TouchableOpacity
                key={rate}
                style={[
                  styles.ratePill,
                  {
                    backgroundColor:
                      settings.sampleRate === rate ? colors.primary : colors.secondary,
                    borderColor:
                      settings.sampleRate === rate ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => updateSettings({ sampleRate: rate })}
              >
                <Text
                  style={[
                    styles.ratePillText,
                    {
                      color:
                        settings.sampleRate === rate
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                    },
                  ]}
                >
                  {rate}Hz
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Section>

      {/* Profiles */}
      <Section title="PROFILES" colors={colors}>
        {profiles.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No saved profiles yet.
          </Text>
        )}
        {profiles.map((profile) => (
          <View
            key={profile.id}
            style={[
              styles.profileRow,
              {
                backgroundColor:
                  profile.id === activeProfileId ? colors.primary + '18' : colors.secondary,
                borderColor:
                  profile.id === activeProfileId ? colors.primary + '66' : colors.border,
              },
            ]}
          >
            <TouchableOpacity style={styles.profileInfo} onPress={() => loadProfile(profile.id)}>
              {profile.id === activeProfileId && (
                <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />
              )}
              <Text style={[styles.profileName, { color: colors.foreground }]}>
                {profile.name}
              </Text>
              <Text style={[styles.profileMeta, { color: colors.mutedForeground }]}>
                sens={profile.settings.sensitivity} · α={profile.settings.alpha} · {profile.settings.sampleRate}Hz
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteBtn, { backgroundColor: colors.destructive + '22' }]}
              onPress={() => handleDeleteProfile(profile.id, profile.name)}
            >
              <Feather name="trash-2" size={14} color={colors.destructive} />
            </TouchableOpacity>
          </View>
        ))}

        {showSaveInput ? (
          <View style={styles.saveInputRow}>
            <TextInput
              style={[
                styles.saveInput,
                {
                  backgroundColor: colors.secondary,
                  color: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
              value={profileName}
              onChangeText={setProfileName}
              placeholder="Profile name…"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveProfile}
            />
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSaveProfile}
            >
              <Feather name="check" size={16} color={colors.primaryForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={() => {
                setShowSaveInput(false);
                setProfileName('');
              }}
            >
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addProfileBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowSaveInput(true)}
          >
            <Feather name="plus" size={16} color={colors.primary} />
            <Text style={[styles.addProfileText, { color: colors.primary }]}>
              Save Current Settings as Profile
            </Text>
          </TouchableOpacity>
        )}
      </Section>

      {/* About */}
      <View style={[styles.aboutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.aboutTitle, { color: colors.mutedForeground }]}>ABOUT</Text>
        <Text style={[styles.aboutText, { color: colors.mutedForeground }]}>
          Tilt2PC v1.0 — Raw input mapping for Asphalt 9 on Windows.{'\n'}
          Connects via WebSocket over local Wi-Fi (port 3333). Target latency &lt;50ms.{'\n\n'}
          Sensitivity scale matches Asphalt 9 (0–100). No game memory is read.
        </Text>
      </View>
    </ScrollView>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      {children}
    </View>
  );
}

function Stepper({
  label,
  description,
  value,
  min,
  max,
  step,
  decimals,
  unit,
  colors,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  unit: string;
  colors: ReturnType<typeof useColors>;
  onChange: (v: number) => void;
}) {
  const dec = () => onChange(Math.max(min, parseFloat((value - step).toFixed(decimals))));
  const inc = () => onChange(Math.min(max, parseFloat((value + step).toFixed(decimals))));

  return (
    <View style={styles.stepperRow}>
      <View style={styles.stepperInfo}>
        <Text style={[styles.stepperLabel, { color: colors.foreground }]}>{label}</Text>
        {description ? (
          <Text style={[styles.stepperDesc, { color: colors.mutedForeground }]}>{description}</Text>
        ) : null}
      </View>
      <View style={styles.stepperControls}>
        <TouchableOpacity
          style={[styles.stepBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={dec}
        >
          <Feather name="minus" size={13} color={colors.foreground} />
        </TouchableOpacity>
        <View style={[styles.stepValue, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={[styles.stepValueText, { color: colors.primary }]}>
            {value.toFixed(decimals)}{unit}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.stepBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={inc}
        >
          <Feather name="plus" size={13} color={colors.foreground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  description,
  value,
  colors,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  colors: ReturnType<typeof useColors>;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.stepperInfo}>
        <Text style={[styles.stepperLabel, { color: colors.foreground }]}>{label}</Text>
        {description ? (
          <Text style={[styles.stepperDesc, { color: colors.mutedForeground }]}>{description}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary + '88' }}
        thumbColor={value ? colors.primary : colors.mutedForeground}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },
  section: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 14 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stepperInfo: { flex: 1, gap: 2 },
  stepperLabel: { fontSize: 14, fontWeight: '500' },
  stepperDesc: { fontSize: 11, lineHeight: 15 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 64,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  stepValueText: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  fieldLabel: { fontSize: 14, fontWeight: '500' },
  fieldDesc: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  rateBlock: { gap: 8 },
  ratePills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  ratePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  ratePillText: { fontSize: 13, fontWeight: '600' },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  profileInfo: { flex: 1, padding: 12, gap: 2 },
  activeDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 2 },
  profileName: { fontSize: 14, fontWeight: '600' },
  profileMeta: { fontSize: 11 },
  deleteBtn: { width: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  saveInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  saveInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  saveBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  addProfileText: { fontSize: 13, fontWeight: '600' },
  aboutCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  aboutTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  aboutText: { fontSize: 12, lineHeight: 19 },
});
