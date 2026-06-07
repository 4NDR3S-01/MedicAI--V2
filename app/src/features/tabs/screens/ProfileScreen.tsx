import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useEffect, useMemo, useState } from 'react';

import {
  fetchProfileFromBackend,
  requestPasswordReset,
  updateAvatarOnBackend,
  updateProfileOnBackend,
  type ProfileUpdatePayload,
  type ProfileUser,
} from '../../auth/services/auth.service';
import { getStoredSession } from '../../auth';
import { fetchMedications } from '../services/medications.service';
import { fetchAppointments } from '../services/appointments.service';
import {
  getAppointmentReminderLeadMinutes,
  getMedicationReminderLeadMinutes,
  registerForPushNotificationsAsync,
  scheduleAppointmentReminder,
  scheduleMedicationNotifications,
  setAppointmentReminderLeadMinutes,
  setMedicationReminderLeadMinutes,
} from '../../../shared/services/notifications.service';
import type { AppTheme } from '../../../shared/theme';

const PREDEFINED_SEEDS = [
  { seed: 'Alexander', bg: 'e0f2fe' },
  { seed: 'Sophia', bg: 'fce7f3' },
  { seed: 'Oliver', bg: 'dcfce7' },
  { seed: 'Isabella', bg: 'fef3c7' },
  { seed: 'William', bg: 'e0e7ff' },
  { seed: 'Mia', bg: 'ffedd5' },
  { seed: 'James', bg: 'f3f4f6' },
  { seed: 'Charlotte', bg: 'cffafe' },
  { seed: 'Benjamin', bg: 'fae8ff' },
  { seed: 'Amelia', bg: 'ecfccb' },
  { seed: 'Lucas', bg: 'ffedd5' },
  { seed: 'Harper', bg: 'e0f2fe' },
];

const PREDEFINED_AVATARS = PREDEFINED_SEEDS.map((s, i) => ({
  id: `db-avt-${i}`,
  url: `https://api.dicebear.com/9.x/avataaars/png?seed=${s.seed}&backgroundColor=${s.bg}`,
}));

const MEDICATION_LEAD_OPTIONS = [0, 5, 10, 15, 30, 60];
const APPOINTMENT_LEAD_OPTIONS = [30, 60, 120, 1440];

const SPECIAL_CONDITIONS: Array<{
  key: keyof Pick<
    ProfileForm,
    'pregnancy' | 'lactation' | 'recentSurgeries' | 'immunosuppression' | 'anticoagulantTreatment'
  >;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = [
  {
    key: 'pregnancy',
    label: 'Embarazo',
    description: 'Ajusta recomendaciones y alertas de seguridad.',
    icon: 'human-pregnant',
  },
  {
    key: 'lactation',
    label: 'Lactancia',
    description: 'Útil para revisar compatibilidad de medicamentos.',
    icon: 'baby-bottle-outline',
  },
  {
    key: 'recentSurgeries',
    label: 'Cirugías recientes',
    description: 'Ayuda a contextualizar síntomas y tratamientos.',
    icon: 'hospital-box-outline',
  },
  {
    key: 'immunosuppression',
    label: 'Inmunosupresión',
    description: 'Prioriza señales de riesgo en consultas.',
    icon: 'shield-alert-outline',
  },
  {
    key: 'anticoagulantTreatment',
    label: 'Anticoagulantes',
    description: 'Marca precauciones por interacciones o sangrado.',
    icon: 'water-outline',
  },
];

type ProfileForm = {
  fullName: string;
  birthDate: string;
  phone: string;
  conditions: string;
  allergies: string;
  pregnancy: boolean;
  lactation: boolean;
  recentSurgeries: boolean;
  immunosuppression: boolean;
  anticoagulantTreatment: boolean;
};

type NotificationTab = 'medications' | 'appointments';

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
};

function getSafeAvatar(data: string | null | undefined) {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as { url?: string; id?: string };
    if (parsed?.url) return parsed;
  } catch {
    return null;
  }
  return null;
}

function displayNameFromEmail(email: string | null): string {
  if (!email) return 'Usuario';
  const local = email.split('@')[0] ?? '';
  if (!local) return 'Usuario';
  const spaced = local.replaceAll(/[._-]+/g, ' ').trim();
  return spaced.replaceAll(/\b\w/g, (char) => char.toUpperCase());
}

function initialFromName(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

function profileFormFromUser(user?: Partial<ProfileUser> | null): ProfileForm {
  return {
    fullName: user?.fullName ?? '',
    birthDate: user?.birthDate ?? '',
    phone: user?.phone ?? '',
    conditions: user?.conditions ?? '',
    allergies: user?.allergies ?? '',
    pregnancy: Boolean(user?.pregnancy),
    lactation: Boolean(user?.lactation),
    recentSurgeries: Boolean(user?.recentSurgeries),
    immunosuppression: Boolean(user?.immunosuppression),
    anticoagulantTreatment: Boolean(user?.anticoagulantTreatment),
  };
}

function calculateAgeLabel(birthDate: string) {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim());
  if (!parsed) return null;
  const date = new Date(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3]));
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const birthdayPassed = today.getMonth() > date.getMonth()
    || (today.getMonth() === date.getMonth() && today.getDate() >= date.getDate());
  if (!birthdayPassed) age -= 1;
  if (age < 0 || age > 120) return null;
  return `${age} años`;
}

function formatLeadOption(minutes: number) {
  if (minutes === 0) return 'Sin aviso previo';
  if (minutes < 60) return `${minutes} min antes`;
  if (minutes === 60) return '1 hora antes';
  if (minutes === 120) return '2 horas antes';
  if (minutes === 1440) return '1 día antes';
  return `${minutes} min antes`;
}

function ModalHeader({
  title,
  subtitle,
  theme,
  onClose,
}: Readonly<{
  title: string;
  subtitle?: string;
  theme: AppTheme;
  onClose: () => void;
}>) {
  return (
    <View style={styles.modalHeader}>
      <View style={styles.modalHeaderText}>
        <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>{title}</Text>
        {subtitle ? <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      <Pressable onPress={onClose} style={[styles.closeButton, { backgroundColor: `${theme.colors.textMuted}14` }]}>
        <MaterialCommunityIcons name="close" size={22} color={theme.colors.textPrimary} />
      </Pressable>
    </View>
  );
}

function TextField({
  label,
  value,
  placeholder,
  theme,
  multiline,
  keyboardType,
  onChangeText,
}: Readonly<{
  label: string;
  value: string;
  placeholder: string;
  theme: AppTheme;
  multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad';
  onChangeText: (value: string) => void;
}>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          {
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.surfaceBorder,
          },
        ]}
      />
    </View>
  );
}

function ProfileMetric({
  icon,
  label,
  value,
  theme,
}: Readonly<{
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  theme: AppTheme;
}>) {
  return (
    <View style={[styles.metricCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
      <MaterialCommunityIcons name={icon} size={18} color={theme.colors.accentPrimary} />
      <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function SettingsRow({
  icon,
  title,
  subtitle,
  accent,
  onPress,
  theme,
}: Readonly<{
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  accent: string;
  onPress: () => void;
  theme: AppTheme;
}>) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.settingsRow,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
        pressed && { transform: [{ scale: 0.985 }], backgroundColor: `${accent}10` },
      ]}
      onPress={onPress}
    >
      <View style={[styles.settingsIconWrap, { backgroundColor: `${accent}18` }]}>
        <MaterialCommunityIcons name={icon} size={22} color={accent} />
      </View>
      <View style={styles.settingsTextWrap}>
        <Text style={[styles.settingsRowTitle, { color: theme.colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.settingsRowSubtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.textMuted} />
    </Pressable>
  );
}

function ToggleRow({
  item,
  value,
  theme,
  onChange,
}: Readonly<{
  item: (typeof SPECIAL_CONDITIONS)[number];
  value: boolean;
  theme: AppTheme;
  onChange: (value: boolean) => void;
}>) {
  return (
    <View style={[styles.toggleRow, { borderColor: theme.colors.surfaceBorder }]}>
      <View style={[styles.toggleIcon, { backgroundColor: value ? `${theme.colors.accentPrimary}16` : `${theme.colors.textMuted}12` }]}>
        <MaterialCommunityIcons name={item.icon} size={20} color={value ? theme.colors.accentPrimary : theme.colors.textSecondary} />
      </View>
      <View style={styles.toggleTextWrap}>
        <Text style={[styles.toggleTitle, { color: theme.colors.textPrimary }]}>{item.label}</Text>
        <Text style={[styles.toggleSubtitle, { color: theme.colors.textMuted }]}>{item.description}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function LeadOption({
  minutes,
  selected,
  accent,
  theme,
  onPress,
}: Readonly<{
  minutes: number;
  selected: boolean;
  accent: string;
  theme: AppTheme;
  onPress: () => void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.leadOption,
        {
          borderColor: selected ? accent : theme.colors.surfaceBorder,
          backgroundColor: selected ? `${accent}16` : theme.colors.surface,
        },
      ]}
    >
      <Text style={[styles.leadOptionText, { color: selected ? accent : theme.colors.textPrimary }]}>
        {formatLeadOption(minutes)}
      </Text>
    </Pressable>
  );
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
}: Readonly<ProfileScreenProps>) {
  const [profile, setProfile] = useState<Partial<ProfileUser>>({
    fullName: userFullName,
    email: userEmail ?? undefined,
    avatar: avatarData,
  });
  const [profileForm, setProfileForm] = useState<ProfileForm>(() => profileFormFromUser({ fullName: userFullName }));
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [notificationSettingsVisible, setNotificationSettingsVisible] = useState(false);
  const [notificationTab, setNotificationTab] = useState<NotificationTab>('medications');
  const [isSavingNotificationSettings, setIsSavingNotificationSettings] = useState(false);
  const [medicationReminderLeadMinutes, setMedicationReminderLeadMinutesState] = useState(5);
  const [appointmentReminderLeadMinutes, setAppointmentReminderLeadMinutesState] = useState(60);
  const [medicationCount, setMedicationCount] = useState(0);
  const [appointmentCount, setAppointmentCount] = useState(0);
  const [supportVisible, setSupportVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);

  useEffect(() => {
    setProfile((current) => ({
      ...current,
      fullName: current.fullName ?? userFullName,
      email: current.email ?? userEmail ?? undefined,
      avatar: avatarData ?? current.avatar,
    }));
  }, [avatarData, userEmail, userFullName]);

  useEffect(() => {
    let cancelled = false;
    fetchProfileFromBackend()
      .then((res) => {
        if (!cancelled && res.user) {
          setProfile(res.user);
          setProfileForm(profileFormFromUser(res.user));
          onProfileUpdated?.(res.user);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentAvatarData = profile.avatar ?? avatarData;
  const parsedAvatar = useMemo(() => getSafeAvatar(currentAvatarData), [currentAvatarData]);
  const name = profile.fullName || userFullName || displayNameFromEmail(userEmail);
  const initial = initialFromName(name);
  const ageLabel = calculateAgeLabel(profile.birthDate ?? '');
  const activeRiskCount = SPECIAL_CONDITIONS.filter((item) => Boolean(profile[item.key])).length;
  const medicalSummary = profile.conditions || profile.allergies || activeRiskCount > 0
    ? `${profile.conditions ? 'Antecedentes registrados' : 'Sin antecedentes'} · ${profile.allergies ? 'alergias registradas' : 'sin alergias'} · ${activeRiskCount} alertas`
    : 'Completa tu contexto médico para consultas más precisas';

  const loadProfile = async (openModal: boolean) => {
    if (openModal) setProfileModalVisible(true);
    setIsLoadingProfile(true);
    try {
      const response = await fetchProfileFromBackend();
      if (response.user) {
        setProfile(response.user);
        setProfileForm(profileFormFromUser(response.user));
        onProfileUpdated?.(response.user);
      }
    } catch (error) {
      if (openModal) {
        setProfileForm(profileFormFromUser(profile));
      }
      Alert.alert(
        'No se pudo cargar el perfil',
        error instanceof Error ? error.message : 'Revisa tu conexión e intenta nuevamente.',
      );
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const openProfileEditor = () => {
    setProfileForm(profileFormFromUser(profile));
    void loadProfile(true);
  };

  const saveProfile = async () => {
    if (profileForm.birthDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(profileForm.birthDate.trim())) {
      Alert.alert('Fecha inválida', 'Usa el formato AAAA-MM-DD para la fecha de nacimiento.');
      return;
    }

    const payload: ProfileUpdatePayload = {
      fullName: profileForm.fullName.trim(),
      birthDate: profileForm.birthDate.trim(),
      phone: profileForm.phone.trim(),
      conditions: profileForm.conditions.trim(),
      allergies: profileForm.allergies.trim(),
      pregnancy: profileForm.pregnancy,
      lactation: profileForm.lactation,
      recentSurgeries: profileForm.recentSurgeries,
      immunosuppression: profileForm.immunosuppression,
      anticoagulantTreatment: profileForm.anticoagulantTreatment,
    };

    setIsSavingProfile(true);
    try {
      const response = await updateProfileOnBackend(payload);
      if (response.user) {
        setProfile(response.user);
        onProfileUpdated?.(response.user);
      } else {
        setProfile((current) => ({ ...current, ...payload }));
      }
      setProfileModalVisible(false);
      Alert.alert('Perfil actualizado', 'Tus datos personales y médicos se guardaron correctamente.');
    } catch (error) {
      Alert.alert(
        'No se pudo guardar',
        error instanceof Error ? error.message : 'Intenta nuevamente en unos minutos.',
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const openNotificationSettings = async () => {
    setNotificationSettingsVisible(true);
    const [medicationLeadMinutes, appointmentLeadMinutes] = await Promise.all([
      getMedicationReminderLeadMinutes(),
      getAppointmentReminderLeadMinutes(),
    ]);
    setMedicationReminderLeadMinutesState(medicationLeadMinutes);
    setAppointmentReminderLeadMinutesState(appointmentLeadMinutes);

    const session = await getStoredSession();
    if (!session?.accessToken) return;
    try {
      const [medications, appointments] = await Promise.all([
        fetchMedications(session.accessToken),
        fetchAppointments(session.accessToken),
      ]);
      setMedicationCount(medications.filter((medication) => medication.active).length);
      setAppointmentCount(appointments.filter((appointment) => {
        const date = new Date(appointment.scheduledAt);
        return appointment.active !== false
          && appointment.attendanceStatus === 'PENDING'
          && !Number.isNaN(date.getTime())
          && date.getTime() > Date.now();
      }).length);
    } catch {
      setMedicationCount(0);
      setAppointmentCount(0);
    }
  };

  const saveNotificationSettings = async () => {
    try {
      setIsSavingNotificationSettings(true);
      const permission = await registerForPushNotificationsAsync();
      if (permission !== 'granted') {
        Alert.alert('Permiso requerido', 'Activa las notificaciones del sistema para recibir recordatorios.');
        return;
      }

      await setMedicationReminderLeadMinutes(medicationReminderLeadMinutes);
      await setAppointmentReminderLeadMinutes(appointmentReminderLeadMinutes);

      const session = await getStoredSession();
      if (session?.accessToken) {
        try {
          const response = await updateProfileOnBackend({ notificationLeadMinutes: medicationReminderLeadMinutes });
          if (response.user) onProfileUpdated?.(response.user);
        } catch (syncError) {
          console.warn('[MedicAI] Failed to sync lead minutes with backend:', syncError);
        }

        const [medications, appointments] = await Promise.all([
          fetchMedications(session.accessToken),
          fetchAppointments(session.accessToken),
        ]);
        for (const medication of medications) {
          await scheduleMedicationNotifications(medication);
        }
        for (const appointment of appointments) {
          await scheduleAppointmentReminder(appointment);
        }
      }

      setNotificationSettingsVisible(false);
      Alert.alert('Recordatorios actualizados', 'Se reprogramaron medicamentos y citas con tus preferencias.');
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'No se pudieron actualizar las preferencias de notificación.',
      );
    } finally {
      setIsSavingNotificationSettings(false);
    }
  };

  const handleAvatarSelect = async (avatar: (typeof PREDEFINED_AVATARS)[0]) => {
    setIsSavingAvatar(true);
    try {
      const avatarStr = JSON.stringify(avatar);
      await updateAvatarOnBackend(avatarStr);
      setProfile((current) => ({ ...current, avatar: avatarStr }));
      onSetAvatar?.(avatarStr);
      setIsEditingAvatar(false);
    } catch (error) {
      Alert.alert(
        'Error al guardar avatar',
        error instanceof Error ? error.message : 'No se pudo guardar el avatar. Intenta de nuevo.',
      );
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const handleSecurityPress = () => {
    if (!userEmail) {
      Alert.alert('Correo no disponible', 'No encontramos un correo asociado a esta sesión.');
      return;
    }

    Alert.alert(
      'Seguridad de la cuenta',
      `Enviaremos un enlace de cambio de contraseña a ${userEmail}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar enlace',
          onPress: () => {
            void requestPasswordReset(userEmail)
              .then(() => Alert.alert('Correo enviado', 'Revisa tu bandeja de entrada y spam.'))
              .catch((error: unknown) => Alert.alert(
                'No se pudo enviar',
                error instanceof Error ? error.message : 'Intenta nuevamente más tarde.',
              ));
          },
        },
      ],
    );
  };

  const openSupportEmail = () => {
    const subject = encodeURIComponent('Soporte MedicAI');
    const body = encodeURIComponent(`Hola, necesito ayuda con mi cuenta ${userEmail ?? ''}.`);
    void Linking.openURL(`mailto:soporte@medicai.lat?subject=${subject}&body=${body}`);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}> 
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: contentBottomInset + 20 }]}
      >
        <View style={[styles.heroCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}> 
          <View style={styles.heroTopRow}>
            <Pressable
              style={[styles.avatar, { backgroundColor: theme.colors.background, borderColor: theme.colors.surfaceBorder }]}
              onPress={() => setIsEditingAvatar(true)}
            >
              {parsedAvatar ? (
                <Image source={{ uri: parsedAvatar.url }} style={styles.avatarImage} />
              ) : (
                <Text style={[styles.avatarLetter, { color: theme.colors.accentPrimary }]}>{initial}</Text>
              )}
              <View style={[styles.editBadge, { backgroundColor: theme.colors.accentPrimary }]}> 
                <MaterialCommunityIcons name="camera-outline" size={14} color="#fff" />
              </View>
            </Pressable>
            <View style={styles.heroIdentity}>
              <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>{name}</Text>
              {userEmail ? <Text style={[styles.email, { color: theme.colors.textMuted }]} numberOfLines={1}>{userEmail}</Text> : null}
              <View style={styles.heroPills}>
                <View style={[styles.statusPill, { backgroundColor: `${theme.colors.accentPrimary}14` }]}>
                  <MaterialCommunityIcons name="shield-check-outline" size={14} color={theme.colors.accentPrimary} />
                  <Text style={[styles.statusPillText, { color: theme.colors.accentPrimary }]}>Cuenta activa</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <ProfileMetric icon="calendar-account-outline" label="Edad" value={ageLabel ?? 'Sin dato'} theme={theme} />
            <ProfileMetric icon="alert-decagram-outline" label="Alertas" value={activeRiskCount > 0 ? String(activeRiskCount) : 'Ninguna'} theme={theme} />
            <ProfileMetric icon="bell-ring-outline" label="Aviso meds" value={formatLeadOption(profile.notificationLeadMinutes ?? medicationReminderLeadMinutes).replace(' antes', '')} theme={theme} />
          </View>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: `${theme.colors.accentPrimary}10`, borderColor: `${theme.colors.accentPrimary}24` }]}> 
          <MaterialCommunityIcons name="clipboard-pulse-outline" size={22} color={theme.colors.accentPrimary} />
          <View style={styles.summaryTextWrap}>
            <Text style={[styles.summaryTitle, { color: theme.colors.textPrimary }]}>Contexto médico</Text>
            <Text style={[styles.summaryBody, { color: theme.colors.textSecondary }]}>{medicalSummary}</Text>
          </View>
        </View>

        <View style={styles.sectionGroup}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Cuenta</Text>
          <SettingsRow
            icon="account-heart-outline"
            title="Datos personales y médicos"
            subtitle="Nombre, teléfono, alergias y condiciones de riesgo"
            accent={theme.colors.accentPrimary}
            onPress={openProfileEditor}
            theme={theme}
          />
          <SettingsRow
            icon="lock-reset"
            title="Seguridad"
            subtitle="Solicita un enlace seguro para cambiar tu contraseña"
            accent={theme.colors.accentSecondary}
            onPress={handleSecurityPress}
            theme={theme}
          />
          <SettingsRow
            icon="bell-badge-outline"
            title="Notificaciones"
            subtitle="Anticipación, permisos y reprogramación de recordatorios"
            accent="#F59E0B"
            onPress={() => { void openNotificationSettings(); }}
            theme={theme}
          />
        </View>

        <View style={styles.sectionGroup}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Soporte y privacidad</Text>
          <SettingsRow
            icon="lifebuoy"
            title="Centro de ayuda"
            subtitle="Guías rápidas, permisos Android y contacto de soporte"
            accent="#10B981"
            onPress={() => setSupportVisible(true)}
            theme={theme}
          />
          <SettingsRow
            icon="file-lock-outline"
            title="Privacidad y uso de datos"
            subtitle="Consulta qué datos guarda MedicAI y cómo se usan"
            accent="#8B5CF6"
            onPress={() => setPrivacyVisible(true)}
            theme={theme}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.signOut,
            {
              backgroundColor: `${theme.colors.accentTertiary}10`,
              borderColor: `${theme.colors.accentTertiary}30`,
              transform: [{ scale: pressed && !isSigningOut ? 0.98 : 1 }],
            },
            isSigningOut && styles.signOutDisabled,
          ]}
          onPress={onSignOut}
          disabled={isSigningOut}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          accessibilityState={{ disabled: isSigningOut }}
        >
          <MaterialCommunityIcons name="logout" size={20} color={theme.colors.accentTertiary} />
          <Text style={[styles.signOutText, { color: theme.colors.accentTertiary }]}> 
            {isSigningOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
          </Text>
        </Pressable>

        <Text style={[styles.versionText, { color: theme.colors.textMuted }]}>MedicAI v1.0.0</Text>
      </ScrollView>

      <Modal visible={isEditingAvatar} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsEditingAvatar(false)}>
        <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}> 
          <ModalHeader title="Elige tu avatar" subtitle="Se guardará en tu cuenta" theme={theme} onClose={() => setIsEditingAvatar(false)} />
          <ScrollView contentContainerStyle={styles.galleryGrid}>
            {PREDEFINED_AVATARS.map((avatar) => {
              const isSelected = parsedAvatar?.id === avatar.id;
              return (
                <Pressable
                  key={avatar.id}
                  style={[styles.galleryItem, { borderColor: isSelected ? theme.colors.accentPrimary : 'transparent' }]}
                  onPress={() => handleAvatarSelect(avatar)}
                  disabled={isSavingAvatar}
                >
                  <Image source={{ uri: avatar.url }} style={styles.galleryImage} />
                  {isSavingAvatar && isSelected ? (
                    <View style={styles.galleryLoadingOverlay}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={profileModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setProfileModalVisible(false)}>
        <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}> 
          <ModalHeader
            title="Datos personales"
            subtitle="Esta información queda asociada a tu cuenta MedicAI"
            theme={theme}
            onClose={() => setProfileModalVisible(false)}
          />
          <ScrollView contentContainerStyle={styles.profileFormScroll} showsVerticalScrollIndicator={false}>
            {isLoadingProfile ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.accentPrimary} />
                <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Actualizando datos...</Text>
              </View>
            ) : null}

            <View style={[styles.formSection, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}> 
              <Text style={[styles.formSectionTitle, { color: theme.colors.textPrimary }]}>Perfil</Text>
              <TextField label="Nombre completo" value={profileForm.fullName} placeholder="Tu nombre" theme={theme} onChangeText={(value) => setProfileForm((current) => ({ ...current, fullName: value }))} />
              <TextField label="Fecha de nacimiento" value={profileForm.birthDate} placeholder="AAAA-MM-DD" theme={theme} onChangeText={(value) => setProfileForm((current) => ({ ...current, birthDate: value }))} />
              <TextField label="Teléfono" value={profileForm.phone} placeholder="Número de contacto" theme={theme} keyboardType="phone-pad" onChangeText={(value) => setProfileForm((current) => ({ ...current, phone: value }))} />
            </View>

            <View style={[styles.formSection, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}> 
              <Text style={[styles.formSectionTitle, { color: theme.colors.textPrimary }]}>Información médica</Text>
              <TextField label="Antecedentes o condiciones" value={profileForm.conditions} placeholder="Ej. hipertensión, diabetes, asma" theme={theme} multiline onChangeText={(value) => setProfileForm((current) => ({ ...current, conditions: value }))} />
              <TextField label="Alergias" value={profileForm.allergies} placeholder="Ej. penicilina, ibuprofeno, alimentos" theme={theme} multiline onChangeText={(value) => setProfileForm((current) => ({ ...current, allergies: value }))} />
            </View>

            <View style={[styles.formSection, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}> 
              <Text style={[styles.formSectionTitle, { color: theme.colors.textPrimary }]}>Condiciones especiales</Text>
              {SPECIAL_CONDITIONS.map((item) => (
                <ToggleRow
                  key={item.key}
                  item={item}
                  value={profileForm[item.key]}
                  theme={theme}
                  onChange={(value) => setProfileForm((current) => ({ ...current, [item.key]: value }))}
                />
              ))}
            </View>

            <View style={styles.modalActionRow}>
              <Pressable
                style={[styles.secondaryButton, { borderColor: theme.colors.surfaceBorder }]}
                onPress={() => setProfileModalVisible(false)}
                disabled={isSavingProfile}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.colors.textPrimary }]}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, { backgroundColor: theme.colors.accentPrimary }, isSavingProfile && styles.disabledButton]}
                onPress={() => { void saveProfile(); }}
                disabled={isSavingProfile}
              >
                {isSavingProfile ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Guardar</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={notificationSettingsVisible} transparent animationType="slide" onRequestClose={() => setNotificationSettingsVisible(false)}>
        <View style={styles.sheetOverlay}>
          <View style={[styles.notificationSheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.surfaceBorder }]}> 
            <ModalHeader
              title="Notificaciones"
              subtitle="Controla recordatorios sin saturar tu agenda"
              theme={theme}
              onClose={() => setNotificationSettingsVisible(false)}
            />

            <View style={[styles.segmentedControl, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}> 
              {(['medications', 'appointments'] as NotificationTab[]).map((tab) => {
                const selected = notificationTab === tab;
                const label = tab === 'medications' ? 'Medicamentos' : 'Citas';
                return (
                  <Pressable
                    key={tab}
                    style={[styles.segmentButton, selected && { backgroundColor: theme.colors.accentPrimary }]}
                    onPress={() => setNotificationTab(tab)}
                  >
                    <Text style={[styles.segmentText, { color: selected ? '#fff' : theme.colors.textSecondary }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {notificationTab === 'medications' ? (
              <View style={styles.notificationContent}>
                <View style={[styles.notificationInfoCard, { backgroundColor: `${theme.colors.accentPrimary}10`, borderColor: `${theme.colors.accentPrimary}24` }]}> 
                  <MaterialCommunityIcons name="alarm-light-outline" size={24} color={theme.colors.accentPrimary} />
                  <View style={styles.summaryTextWrap}>
                    <Text style={[styles.summaryTitle, { color: theme.colors.textPrimary }]}>Alarmas críticas</Text>
                    <Text style={[styles.summaryBody, { color: theme.colors.textSecondary }]}>La toma exacta usa alarma nativa. El ajuste inferior sólo cambia el aviso previo.</Text>
                  </View>
                </View>
                <Text style={[styles.notificationSectionTitle, { color: theme.colors.textPrimary }]}>Aviso previo</Text>
                <View style={styles.leadGrid}>
                  {MEDICATION_LEAD_OPTIONS.map((minutes) => (
                    <LeadOption
                      key={minutes}
                      minutes={minutes}
                      selected={medicationReminderLeadMinutes === minutes}
                      accent={theme.colors.accentPrimary}
                      theme={theme}
                      onPress={() => setMedicationReminderLeadMinutesState(minutes)}
                    />
                  ))}
                </View>
                <Text style={[styles.notificationFootnote, { color: theme.colors.textMuted }]}>Medicamentos activos que se reprogramarán: {medicationCount}</Text>
              </View>
            ) : (
              <View style={styles.notificationContent}>
                <View style={[styles.notificationInfoCard, { backgroundColor: `${theme.colors.accentSecondary}10`, borderColor: `${theme.colors.accentSecondary}24` }]}> 
                  <MaterialCommunityIcons name="calendar-clock" size={24} color={theme.colors.accentSecondary} />
                  <View style={styles.summaryTextWrap}>
                    <Text style={[styles.summaryTitle, { color: theme.colors.textPrimary }]}>Tres avisos útiles</Text>
                    <Text style={[styles.summaryBody, { color: theme.colors.textSecondary }]}>Recibirás un aviso previo, otro a la hora exacta y un cierre de día si sigue pendiente.</Text>
                  </View>
                </View>
                <Text style={[styles.notificationSectionTitle, { color: theme.colors.textPrimary }]}>Aviso previo</Text>
                <View style={styles.leadGrid}>
                  {APPOINTMENT_LEAD_OPTIONS.map((minutes) => (
                    <LeadOption
                      key={minutes}
                      minutes={minutes}
                      selected={appointmentReminderLeadMinutes === minutes}
                      accent={theme.colors.accentSecondary}
                      theme={theme}
                      onPress={() => setAppointmentReminderLeadMinutesState(minutes)}
                    />
                  ))}
                </View>
                <Text style={[styles.notificationFootnote, { color: theme.colors.textMuted }]}>Citas pendientes futuras que se reprogramarán: {appointmentCount}</Text>
              </View>
            )}

            <View style={styles.modalActionRow}>
              <Pressable
                onPress={() => setNotificationSettingsVisible(false)}
                style={[styles.secondaryButton, { borderColor: theme.colors.surfaceBorder }]}
                disabled={isSavingNotificationSettings}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.colors.textPrimary }]}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => { void saveNotificationSettings(); }}
                style={[styles.primaryButton, { backgroundColor: theme.colors.accentPrimary }, isSavingNotificationSettings && styles.disabledButton]}
                disabled={isSavingNotificationSettings}
              >
                {isSavingNotificationSettings ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Guardar y reprogramar</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={supportVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSupportVisible(false)}>
        <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}> 
          <ModalHeader title="Centro de ayuda" subtitle="Acciones rápidas para resolver problemas comunes" theme={theme} onClose={() => setSupportVisible(false)} />
          <ScrollView contentContainerStyle={styles.helpScroll}>
            {[
              ['Las alarmas no suenan', 'Verifica permisos de notificación, alarma exacta, autoinicio y batería sin restricciones en Android.'],
              ['No veo mis cambios', 'Cierra y abre la sección; la app sincroniza datos del backend al entrar al perfil.'],
              ['Necesito soporte', 'Envíanos un correo con tu cuenta y una descripción corta del problema.'],
            ].map(([title, body]) => (
              <View key={title} style={[styles.helpCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}> 
                <Text style={[styles.helpTitle, { color: theme.colors.textPrimary }]}>{title}</Text>
                <Text style={[styles.helpBody, { color: theme.colors.textSecondary }]}>{body}</Text>
              </View>
            ))}
            <Pressable style={[styles.primaryButton, { backgroundColor: theme.colors.accentPrimary }]} onPress={openSupportEmail}>
              <Text style={styles.primaryButtonText}>Escribir a soporte</Text>
            </Pressable>
            <Pressable style={[styles.secondaryButton, { borderColor: theme.colors.surfaceBorder }]} onPress={() => { void Linking.openSettings(); }}>
              <Text style={[styles.secondaryButtonText, { color: theme.colors.textPrimary }]}>Abrir ajustes del sistema</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={privacyVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPrivacyVisible(false)}>
        <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}> 
          <ModalHeader title="Privacidad" subtitle="Resumen claro del uso de datos" theme={theme} onClose={() => setPrivacyVisible(false)} />
          <ScrollView contentContainerStyle={styles.helpScroll}>
            {[
              ['Datos de cuenta', 'Guardamos correo, nombre, avatar y datos básicos necesarios para identificar tu sesión.'],
              ['Datos de salud', 'Medicamentos, citas, alergias y condiciones se usan para recordatorios y contexto dentro de MedicAI.'],
              ['Control del usuario', 'Puedes editar datos personales desde esta pantalla o cerrar sesión para remover la sesión local del dispositivo.'],
              ['Seguridad', 'La autenticación usa JWT y el cambio de contraseña se realiza con enlace temporal enviado al correo.'],
            ].map(([title, body]) => (
              <View key={title} style={[styles.helpCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}> 
                <Text style={[styles.helpTitle, { color: theme.colors.textPrimary }]}>{title}</Text>
                <Text style={[styles.helpBody, { color: theme.colors.textSecondary }]}>{body}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingHorizontal: 18, paddingTop: 24, gap: 18 },
  heroCard: { borderRadius: 32, borderWidth: 1, padding: 18, gap: 18 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 86, height: 86, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 84, height: 84, borderRadius: 27 },
  avatarLetter: { fontSize: 36, fontWeight: '900' },
  editBadge: { position: 'absolute', bottom: -3, right: -3, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  heroIdentity: { flex: 1, gap: 6 },
  name: { fontSize: 25, fontWeight: '900', letterSpacing: -0.6 },
  email: { fontSize: 13, fontWeight: '700' },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusPillText: { fontSize: 12, fontWeight: '800' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, borderRadius: 20, borderWidth: 1, padding: 12, gap: 5 },
  metricValue: { fontSize: 14, fontWeight: '900' },
  metricLabel: { fontSize: 11, fontWeight: '700' },
  summaryCard: { flexDirection: 'row', borderRadius: 24, borderWidth: 1, padding: 16, gap: 12 },
  summaryTextWrap: { flex: 1, gap: 3 },
  summaryTitle: { fontSize: 15, fontWeight: '900' },
  summaryBody: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  sectionGroup: { gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase', paddingLeft: 8 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 24, borderWidth: 1, padding: 14 },
  settingsIconWrap: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  settingsTextWrap: { flex: 1, gap: 3 },
  settingsRowTitle: { fontSize: 16, fontWeight: '900' },
  settingsRowSubtitle: { fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 24, borderWidth: 1, marginTop: 2 },
  signOutText: { fontSize: 16, fontWeight: '900' },
  signOutDisabled: { opacity: 0.5 },
  versionText: { textAlign: 'center', fontSize: 12, fontWeight: '700', marginTop: 4 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, gap: 12 },
  modalHeaderText: { flex: 1, gap: 3 },
  modalTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  modalSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  closeButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 24, gap: 22, justifyContent: 'center' },
  galleryItem: { width: 82, height: 82, borderRadius: 41, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  galleryImage: { width: 74, height: 74, borderRadius: 37 },
  galleryLoadingOverlay: { position: 'absolute', width: '100%', height: '100%', borderRadius: 41, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  profileFormScroll: { padding: 18, gap: 14, paddingBottom: 34 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 8 },
  loadingText: { fontSize: 13, fontWeight: '700' },
  formSection: { borderWidth: 1, borderRadius: 24, padding: 14, gap: 12 },
  formSectionTitle: { fontSize: 16, fontWeight: '900' },
  fieldWrap: { gap: 7 },
  fieldLabel: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { minHeight: 48, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, fontSize: 15, fontWeight: '600' },
  inputMultiline: { minHeight: 92, paddingTop: 12, paddingBottom: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  toggleIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toggleTextWrap: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: 14, fontWeight: '900' },
  toggleSubtitle: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  modalActionRow: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  primaryButton: { flex: 1, minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  secondaryButton: { flex: 1, minHeight: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { fontSize: 14, fontWeight: '900', textAlign: 'center' },
  disabledButton: { opacity: 0.6 },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  notificationSheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, paddingHorizontal: 16, paddingBottom: 18, gap: 14, maxHeight: '88%' },
  segmentedControl: { flexDirection: 'row', borderWidth: 1, borderRadius: 18, padding: 4, gap: 4 },
  segmentButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 14 },
  segmentText: { fontSize: 13, fontWeight: '900' },
  notificationContent: { gap: 12 },
  notificationInfoCard: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 22, padding: 14 },
  notificationSectionTitle: { fontSize: 15, fontWeight: '900' },
  leadGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  leadOption: { width: '48%', borderWidth: 1, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 10, alignItems: 'center' },
  leadOptionText: { fontSize: 13, fontWeight: '900', textAlign: 'center' },
  notificationFootnote: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  helpScroll: { padding: 18, gap: 12, paddingBottom: 34 },
  helpCard: { borderWidth: 1, borderRadius: 22, padding: 16, gap: 6 },
  helpTitle: { fontSize: 16, fontWeight: '900' },
  helpBody: { fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
});
