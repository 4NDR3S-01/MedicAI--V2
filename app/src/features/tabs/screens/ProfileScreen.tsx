import { useCallback, useEffect, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Alert, Animated, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppTheme, ThemePreference } from '../../../shared/theme';
import { getThemePreference, onThemePreference, setThemePreference } from '../../../shared/theme';
import { AppButton, PressableScale, useEnterAnimation } from '../../../shared/ui';
import {
  getAppointmentReminderLeadMinutes,
  getMedicationReminderLeadMinutes,
} from '../../../shared/services/notifications.service';
import { fetchProfileFromBackend, requestPasswordReset, type ProfileUser } from '../../auth/services/auth.service';
import { formatPhone, parseMedicalSelection } from '../../auth/utils/register.utils';
import { SPECIAL_CONDITIONS } from '../../auth/config/register.constants';
import { PermissionHistorySheet } from '../../circle/components/PermissionHistorySheet';
import { DeleteAccountSheet } from '../components/DeleteAccountSheet';
import { SessionsSheet } from '../components/SessionsSheet';
import { AlarmStatusCard } from '../components/profile/AlarmStatusCard';
import { AvatarSheet } from '../components/profile/AvatarSheet';
import { initialsOf, parseAvatar } from '../components/profile/avatar';
import { EditProfileSheet } from '../components/profile/EditProfileSheet';
import { HelpSheet } from '../components/profile/HelpSheet';
import { PrivacySheet } from '../components/profile/PrivacySheet';
import { SettingsGroup, SettingsItem } from '../components/profile/ProfileParts';
import { formatLead, RemindersSheet } from '../components/profile/RemindersSheet';

export type ProfileScreenProps = {
  theme: AppTheme;
  userFullName: string | null;
  userEmail: string | null;
  avatarData?: string | null;
  onSetAvatar?: (data: string) => void;
  onProfileUpdated?: (user: ProfileUser) => void;
  contentBottomInset: number;
  isSigningOut: boolean;
  onSignOut: () => void;
  /** Tras eliminar la cuenta: limpiar el teléfono y volver al inicio. */
  onAccountDeleted?: () => void;
};

type Sheet = 'avatar' | 'edit' | 'reminders' | 'sessions' | 'privacy' | 'history' | 'help' | 'delete' | null;

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { value: 'system', label: 'Sistema', icon: 'theme-light-dark' },
  { value: 'light', label: 'Claro', icon: 'white-balance-sunny' },
  { value: 'dark', label: 'Oscuro', icon: 'weather-night' },
];

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

function nameFromEmail(email: string | null): string {
  const local = email?.split('@')[0] ?? '';
  if (!local) return 'Tu perfil';
  return local.replace(/[._-]+/g, ' ').trim().replace(/\b\w/g, (char) => char.toUpperCase());
}

function ageOf(birthDate?: string | null): number | null {
  const match = birthDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate) : null;
  if (!match) return null;
  const today = new Date();
  let age = today.getFullYear() - Number(match[1]);
  const month = today.getMonth() + 1;
  if (month < Number(match[2]) || (month === Number(match[2]) && today.getDate() < Number(match[3]))) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function ProfileScreen({
  theme,
  userFullName,
  userEmail,
  avatarData,
  onSetAvatar,
  onProfileUpdated,
  contentBottomInset,
  isSigningOut,
  onSignOut,
  onAccountDeleted,
}: Readonly<ProfileScreenProps>) {
  const [profile, setProfile] = useState<Partial<ProfileUser>>({
    fullName: userFullName,
    email: userEmail ?? undefined,
    avatar: avatarData,
  });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lead, setLead] = useState<{ medication: number; appointment: number } | null>(null);
  const [appearance, setAppearance] = useState<ThemePreference>(getThemePreference);
  const [alarmIssue, setAlarmIssue] = useState(false);
  const enter = useEnterAnimation(true);

  const applyUser = useCallback((user: ProfileUser) => {
    setProfile(user);
    onProfileUpdated?.(user);
  }, [onProfileUpdated]);

  const loadProfile = useCallback(async (showErrors: boolean) => {
    try {
      const response = await fetchProfileFromBackend();
      if (response.user) applyUser(response.user);
    } catch (error) {
      if (showErrors) {
        Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : 'Revisa tu conexión e inténtalo de nuevo.');
      }
    }
  }, [applyUser]);

  const loadLead = useCallback(async () => {
    const [medication, appointment] = await Promise.all([getMedicationReminderLeadMinutes(), getAppointmentReminderLeadMinutes()]);
    setLead({ medication, appointment });
  }, []);

  useEffect(() => {
    void loadProfile(false);
    void loadLead();
    return onThemePreference(setAppearance);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setProfile((current) => ({
      ...current,
      fullName: current.fullName ?? userFullName,
      email: current.email ?? userEmail ?? undefined,
      avatar: avatarData ?? current.avatar,
    }));
  }, [avatarData, userEmail, userFullName]);

  const email = profile.email ?? userEmail;
  const name = profile.fullName?.trim() || userFullName?.trim() || nameFromEmail(email ?? null);
  const avatar = parseAvatar(profile.avatar ?? avatarData);
  const age = ageOf(profile.birthDate);
  const phone = formatPhone(profile.phone);
  const conditions = parseMedicalSelection(profile.conditions);
  const allergies = parseMedicalSelection(profile.allergies);
  const special = SPECIAL_CONDITIONS.filter((item) => Boolean(profile[item.key]));
  const healthEmpty = !conditions.none && !conditions.items.length && !allergies.none && !allergies.items.length && !special.length;

  const close = () => setSheet(null);

  const changePassword = () => {
    if (!email) {
      Alert.alert('Correo no disponible', 'No encontramos el correo de esta cuenta.');
      return;
    }
    Alert.alert('Cambiar contraseña', `Te enviaremos un enlace seguro a ${email} para crear una contraseña nueva.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Enviar enlace',
        onPress: () => {
          void requestPasswordReset(email)
            .then(() => Alert.alert('Revisa tu correo', 'Abre el enlace para crear tu contraseña nueva. Si no lo ves, busca en spam.'))
            .catch((error: unknown) =>
              Alert.alert('No se pudo enviar', error instanceof Error ? error.message : 'Inténtalo más tarde.'));
        },
      },
    ]);
  };

  const confirmSignOut = () => {
    Alert.alert('¿Cerrar sesión?', 'En este teléfono dejarán de sonar tus alarmas hasta que vuelvas a entrar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: onSignOut },
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Animated.View style={[styles.screen, enter.style]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: contentBottomInset + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void Promise.all([loadProfile(true), loadLead()]).finally(() => setRefreshing(false));
              }}
              tintColor={theme.colors.accentPrimary}
              colors={[theme.colors.accentPrimary]}
            />
          }
        >
          {/* Identidad */}
          <View style={[styles.heroCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
            <View style={styles.heroTopRow}>
              <PressableScale
                onPress={() => setSheet('avatar')}
                accessibilityRole="button"
                accessibilityLabel="Cambiar foto de perfil"
                style={[styles.avatar, { backgroundColor: theme.colors.background, borderColor: theme.colors.surfaceBorder }]}
              >
                {avatar ? (
                  <Image source={{ uri: avatar.url }} style={styles.avatarImage} accessibilityIgnoresInvertColors />
                ) : (
                  <Text style={[styles.avatarLetter, { color: theme.colors.accentPrimary }]}>{initialsOf(name)}</Text>
                )}
                <View style={[styles.editBadge, { backgroundColor: theme.colors.accentPrimary, borderColor: theme.colors.surface }]}>
                  <MaterialCommunityIcons name="camera-outline" size={14} color="#fff" />
                </View>
              </PressableScale>
              <View style={styles.heroIdentity}>
                <Text
                  style={[styles.name, name.length > 22 && styles.nameLong, { color: theme.colors.textPrimary }]}
                  numberOfLines={2}
                >
                  {name}
                </Text>
                {email ? <Text style={[styles.email, { color: theme.colors.textMuted }]} numberOfLines={1}>{email}</Text> : null}
                <View style={styles.heroPills}>
                  {phone ? (
                    <View style={[styles.statusPill, { backgroundColor: `${theme.colors.accentPrimary}14` }]} accessibilityLabel={`Teléfono ${phone}`}>
                      <Text style={[styles.statusPillText, { color: theme.colors.accentPrimary }]}>{phone}</Text>
                    </View>
                  ) : (
                    <PressableScale
                      onPress={() => setSheet('edit')}
                      accessibilityRole="button"
                      style={[styles.statusPill, { backgroundColor: `${theme.colors.textMuted}14` }]}
                    >
                      <MaterialCommunityIcons name="phone-plus-outline" size={14} color={theme.colors.textSecondary} />
                      <Text style={[styles.statusPillText, { color: theme.colors.textSecondary }]}>Agregar teléfono</Text>
                    </PressableScale>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.metricsRow}>
              <ProfileMetric theme={theme} icon="calendar-account-outline" label="Edad" value={age !== null ? `${age} años` : 'Sin dato'} />
              <ProfileMetric theme={theme} icon="alert-decagram-outline" label="Alertas" value={special.length ? String(special.length) : 'Ninguna'} />
              <ProfileMetric
                theme={theme}
                icon="bell-ring-outline"
                label="Aviso meds"
                value={lead ? formatLead(lead.medication).replace(' antes', '') : '—'}
              />
            </View>
          </View>

          <AppButton theme={theme} label="Editar datos personales" variant="secondary" icon="create-outline" iconPosition="left" onPress={() => setSheet('edit')} />

          {/* Salud */}
          <PressableScale
            onPress={() => setSheet('edit')}
            pressedScale={0.99}
            accessibilityRole="button"
            accessibilityLabel="Información de salud. Toca para editar."
            style={[styles.health, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}
          >
            <View style={styles.healthHeader}>
              <MaterialCommunityIcons name="clipboard-pulse-outline" size={20} color={theme.colors.accentPrimary} />
              <Text style={[styles.healthTitle, { color: theme.colors.textPrimary }]}>Información de salud</Text>
              <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textMuted} />
            </View>
            {healthEmpty ? (
              <Text style={[styles.healthEmpty, { color: theme.colors.textSecondary }]}>
                Agrega tus condiciones y alergias: ayudan a tus cuidadores y al asistente a darte información segura.
              </Text>
            ) : (
              <>
                <HealthRow theme={theme} label="Alergias" selection={allergies} noneLabel="Ninguna conocida" color={theme.colors.accentTertiary} />
                <HealthRow theme={theme} label="Condiciones" selection={conditions} noneLabel="Ninguna" color={theme.colors.accentSecondary} />
                {special.length ? (
                  <HealthRow theme={theme} label="Situaciones" selection={{ none: false, items: special.map((item) => item.label) }} noneLabel="" color={theme.colors.accentPrimary} />
                ) : null}
              </>
            )}
          </PressableScale>

          <AlarmStatusCard theme={theme} onIssueChange={setAlarmIssue} />

          <SettingsGroup theme={theme} title="Preferencias">
            <SettingsItem
              theme={theme}
              icon="bell-ring-outline"
              title="Recordatorios"
              subtitle={lead ? `Medicamentos: ${formatLead(lead.medication).toLowerCase()} · Citas: ${formatLead(lead.appointment).toLowerCase()}` : undefined}
              color="#F59E0B"
              badge={alarmIssue}
              onPress={() => setSheet('reminders')}
            />
            <View style={styles.appearance}>
              <View style={styles.appearanceHeader}>
                <View style={[styles.appearanceIcon, { backgroundColor: `${theme.colors.accentSecondary}18` }]}>
                  <MaterialCommunityIcons name="palette-outline" size={20} color={theme.colors.accentSecondary} />
                </View>
                <Text style={[styles.appearanceTitle, { color: theme.colors.textPrimary }]}>Apariencia</Text>
              </View>
              <View style={[styles.segment, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]} accessibilityRole="radiogroup">
                {APPEARANCE_OPTIONS.map((option) => {
                  const selected = appearance === option.value;
                  return (
                    <PressableScale
                      key={option.value}
                      onPress={() => setThemePreference(option.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Apariencia: ${option.label}`}
                      style={[styles.segmentItem, selected && { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}
                    >
                      <MaterialCommunityIcons name={option.icon} size={16} color={selected ? theme.colors.accentPrimary : theme.colors.textMuted} />
                      <Text style={[styles.segmentText, { color: selected ? theme.colors.textPrimary : theme.colors.textMuted }]}>{option.label}</Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          </SettingsGroup>

          <SettingsGroup theme={theme} title="Cuenta y seguridad">
            <SettingsItem
              theme={theme}
              icon="lock-reset"
              title="Cambiar contraseña"
              subtitle="Te enviamos un enlace seguro a tu correo"
              color={theme.colors.accentSecondary}
              onPress={changePassword}
            />
            <SettingsItem
              theme={theme}
              icon="cellphone-key"
              title="Dispositivos con sesión"
              subtitle="Dónde está abierta tu cuenta"
              color="#0EA5E9"
              onPress={() => setSheet('sessions')}
            />
          </SettingsGroup>

          <SettingsGroup theme={theme} title="Privacidad y ayuda">
            <SettingsItem
              theme={theme}
              icon="shield-lock-outline"
              title="Privacidad"
              subtitle="Asistente de IA, historial de accesos y tus datos"
              color="#8B5CF6"
              onPress={() => setSheet('privacy')}
            />
            <SettingsItem
              theme={theme}
              icon="lifebuoy"
              title="Ayuda y soporte"
              subtitle="Preguntas frecuentes y contacto"
              color={theme.colors.success}
              onPress={() => setSheet('help')}
            />
          </SettingsGroup>

          <AppButton
            theme={theme}
            label={isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            variant="secondary"
            icon="log-out-outline"
            iconPosition="left"
            onPress={confirmSignOut}
            loading={isSigningOut}
          />

          <PressableScale onPress={() => setSheet('delete')} accessibilityRole="button" style={styles.deleteLink}>
            <Text style={[styles.deleteText, { color: theme.colors.accentTertiary }]}>Eliminar mi cuenta</Text>
          </PressableScale>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>MedicAI {APP_VERSION}</Text>
            <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
              MedicAI te ayuda a organizar tu tratamiento, pero no reemplaza la atención médica profesional. En una emergencia, llama al 911.
            </Text>
          </View>
        </ScrollView>
      </Animated.View>

      <AvatarSheet
        theme={theme}
        visible={sheet === 'avatar'}
        name={name}
        avatarData={profile.avatar ?? avatarData}
        onClose={close}
        onSaved={(data) => {
          setProfile((current) => ({ ...current, avatar: data }));
          onSetAvatar?.(data);
        }}
      />

      <EditProfileSheet
        theme={theme}
        visible={sheet === 'edit'}
        profile={profile}
        onClose={close}
        onSaved={(user, payload) => {
          if (user) applyUser(user);
          else setProfile((current) => ({ ...current, ...payload }));
        }}
      />

      <RemindersSheet
        theme={theme}
        visible={sheet === 'reminders'}
        onClose={close}
        onSaved={(next, user) => {
          setLead(next);
          if (user) applyUser(user);
        }}
      />

      <SessionsSheet theme={theme} visible={sheet === 'sessions'} onClose={close} />

      <PrivacySheet
        theme={theme}
        visible={sheet === 'privacy'}
        email={email ?? null}
        aiConsent={Boolean(profile.aiHealthContextConsent)}
        onClose={close}
        onConsentChanged={(value, user) => {
          if (user) applyUser(user);
          else setProfile((current) => ({ ...current, aiHealthContextConsent: value }));
        }}
        onOpenHistory={() => setSheet('history')}
      />

      {/* Al cerrar el historial se vuelve a Privacidad, de donde se abrió. */}
      <PermissionHistorySheet theme={theme} visible={sheet === 'history'} onClose={() => setSheet('privacy')} />

      <HelpSheet theme={theme} visible={sheet === 'help'} onClose={close} />

      <DeleteAccountSheet
        theme={theme}
        visible={sheet === 'delete'}
        onClose={close}
        onDeleted={() => {
          close();
          (onAccountDeleted ?? onSignOut)();
          Alert.alert('Cuenta eliminada', 'Tu cuenta y todos tus datos fueron eliminados.');
        }}
      />
    </View>
  );
}

function ProfileMetric({
  theme,
  icon,
  label,
  value,
}: Readonly<{ theme: AppTheme; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }>) {
  return (
    <View style={[styles.metricCard, { backgroundColor: theme.colors.background, borderColor: theme.colors.surfaceBorder }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <MaterialCommunityIcons name={icon} size={18} color={theme.colors.accentPrimary} />
      <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

/** Fila de la tarjeta de salud: chips con lo registrado, o "Ninguna". */
function HealthRow({
  theme,
  label,
  selection,
  noneLabel,
  color,
}: Readonly<{ theme: AppTheme; label: string; selection: { none: boolean; items: string[] }; noneLabel: string; color: string }>) {
  const MAX = 4;
  const shown = selection.items.slice(0, MAX);
  const hidden = selection.items.length - shown.length;
  return (
    <View style={styles.healthRow}>
      <Text style={[styles.healthLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <View style={styles.chips}>
        {shown.length ? (
          shown.map((item) => (
            <View key={item} style={[styles.chip, { backgroundColor: `${color}14`, borderColor: `${color}30` }]}>
              <Text style={[styles.chipText, { color: theme.colors.textPrimary }]} numberOfLines={1}>{item}</Text>
            </View>
          ))
        ) : (
          <Text style={[styles.healthValue, { color: theme.colors.textSecondary }]}>{selection.none ? noneLabel : 'Sin indicar'}</Text>
        )}
        {hidden > 0 ? <Text style={[styles.healthValue, { color: theme.colors.textMuted }]}>+{hidden}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 24, gap: 16 },
  heroCard: { borderRadius: 32, borderWidth: 1, padding: 18, gap: 18 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 86, height: 86, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 84, height: 84, borderRadius: 27 },
  avatarLetter: { fontSize: 32, fontWeight: '900' },
  editBadge: { position: 'absolute', bottom: -3, right: -3, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  heroIdentity: { flex: 1, gap: 6 },
  name: { fontSize: 24, lineHeight: 28, fontWeight: '900', letterSpacing: -0.6 },
  // Nombres largos ("William Andrés Pérez Gómez"): un poco más pequeños, en dos líneas.
  nameLong: { fontSize: 20, lineHeight: 24 },
  email: { fontSize: 13, fontWeight: '700' },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusPillText: { fontSize: 12.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, borderRadius: 20, borderWidth: 1, padding: 12, gap: 5 },
  metricValue: { fontSize: 14, fontWeight: '900' },
  metricLabel: { fontSize: 11, fontWeight: '700' },
  health: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 12 },
  healthHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  healthTitle: { flex: 1, fontSize: 15.5, fontWeight: '900' },
  healthEmpty: { fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
  healthRow: { gap: 6 },
  healthLabel: { fontSize: 11.5, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  healthValue: { fontSize: 13.5, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, maxWidth: '100%' },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  appearance: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  appearanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  appearanceIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  appearanceTitle: { fontSize: 15.5, fontWeight: '800' },
  segment: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 3, gap: 3 },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: 'transparent' },
  segmentText: { fontSize: 13, fontWeight: '800' },
  deleteLink: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  deleteText: { fontSize: 14, fontWeight: '800' },
  footer: { alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  footerText: { fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
});
