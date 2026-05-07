import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, Dimensions, Image } from 'react-native';

import type { AppTheme } from '../../../shared/theme';

const { width } = Dimensions.get('window');

export type HomeScreenProps = {
  theme: AppTheme;
  userFullName: string | null;
  userEmail: string | null;
  avatarData?: string | null;
  /** Espacio inferior para la barra de pestañas y el FAB central. */
  contentBottomInset: number;
  /** Si se define, sustituye el aviso «En desarrollo» al abrir Medicamentos. */
  onOpenMedications?: () => void;
  onOpenAppointments?: () => void;
  onOpenReminders?: () => void;
  onOpenAssistant?: () => void;
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Buenos días';
  }
  if (hour < 19) {
    return 'Buenas tardes';
  }
  return 'Buenas noches';
}

function displayNameFromEmail(email: string | null): string {
  if (!email) {
    return 'Usuario';
  }
  const local = email.split('@')[0] ?? '';
  if (!local) {
    return 'Usuario';
  }
  const spaced = local.replace(/[._-]+/g, ' ').trim();
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeFullName(fullName: string | null): string | null {
  if (!fullName) {
    return null;
  }
  const words = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return null;
  }

  // Mostrar maximo dos palabras para un encabezado corto y legible.
  return words.slice(0, 2).join(' ');
}

function initialFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }
  return trimmed[0]!.toUpperCase();
}

function openOrStub(label: string, handler?: () => void) {
  return () => {
    if (handler) {
      handler();
      return;
    }
    Alert.alert(
      'En desarrollo',
      `La sección «${label}» estará disponible en una próxima actualización.`,
    );
  };
}

function getSafeAvatar(data: string | null | undefined) {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    if (parsed && parsed.url) return parsed;
  } catch (e) {
    // ignore
  }
  return null;
}

export function HomeScreen({
  theme,
  userFullName,
  userEmail,
  avatarData,
  contentBottomInset,
  onOpenMedications,
  onOpenAppointments,
  onOpenReminders,
  onOpenAssistant,
}: Readonly<HomeScreenProps>) {
  const greeting = useMemo(() => getGreeting(), []);
  const displayName = useMemo(
    () => normalizeFullName(userFullName) ?? displayNameFromEmail(userEmail),
    [userFullName, userEmail],
  );
  const avatarLetter = useMemo(() => initialFromName(displayName), [displayName]);
  const firstName = useMemo(() => displayName.split(' ')[0] ?? displayName, [displayName]);
  const parsedAvatar = useMemo(() => getSafeAvatar(avatarData), [avatarData]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomInset + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.headerTextContainer}>
            <Text style={[styles.greeting, { color: theme.colors.textSecondary }]}>{greeting},</Text>
            <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              {firstName}
            </Text>
          </View>
          <View
            style={[
              styles.avatarContainer,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
            ]}
          >
            {parsedAvatar ? (
              <Image source={{ uri: parsedAvatar.url }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarText, { color: theme.colors.accentPrimary }]}>
                {avatarLetter}
              </Text>
            )}
          </View>
        </View>

        {/* Hero AI Banner */}
        <Pressable
          style={({ pressed }) => [
            styles.heroBanner,
            { backgroundColor: theme.colors.accentPrimary, transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}
          onPress={openOrStub('Asistente IA', onOpenAssistant)}
        >
          <View style={styles.heroContent}>
            <View style={[styles.badge, { backgroundColor: theme.colors.buttonText }]}>
              <MaterialCommunityIcons name="star-four-points" size={14} color={theme.colors.accentPrimary} />
              <Text style={[styles.badgeText, { color: theme.colors.accentPrimary }]}>MedicAI Activo</Text>
            </View>
            <Text style={[styles.heroTitle, { color: theme.colors.buttonText }]}>¿Cómo te sientes hoy?</Text>
            <Text style={[styles.heroSubtitle, { color: theme.colors.buttonText }]}>
              Habla con tu asistente médico inteligente para recibir ayuda inmediata.
            </Text>
          </View>
          <MaterialCommunityIcons
            name="robot-outline"
            size={110}
            color="rgba(255,255,255,0.15)"
            style={styles.heroIcon}
          />
        </Pressable>

        {/* Bento Grid */}
        <View style={styles.bentoGrid}>
          {/* Medications */}
          <Pressable
            style={({ pressed }) => [
              styles.bentoSquare,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.surfaceBorder,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            onPress={openOrStub('Medicamentos', onOpenMedications)}
          >
            <View style={[styles.iconCircle, { backgroundColor: `${theme.colors.accentPrimary}15` }]}>
              <MaterialCommunityIcons name="pill" size={32} color={theme.colors.accentPrimary} />
            </View>
            <View style={styles.bentoTextWrap}>
              <Text style={[styles.bentoTitle, { color: theme.colors.textPrimary }]}>Botiquín</Text>
              <Text style={[styles.bentoSubtitle, { color: theme.colors.textSecondary }]}>Tus recetas</Text>
            </View>
          </Pressable>

          {/* Appointments */}
          <Pressable
            style={({ pressed }) => [
              styles.bentoSquare,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.surfaceBorder,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            onPress={openOrStub('Citas', onOpenAppointments)}
          >
            <View style={[styles.iconCircle, { backgroundColor: `${theme.colors.accentSecondary}15` }]}>
              <MaterialCommunityIcons name="calendar-month" size={32} color={theme.colors.accentSecondary} />
            </View>
            <View style={styles.bentoTextWrap}>
              <Text style={[styles.bentoTitle, { color: theme.colors.textPrimary }]}>Agenda</Text>
              <Text style={[styles.bentoSubtitle, { color: theme.colors.textSecondary }]}>Próximas citas</Text>
            </View>
          </Pressable>
        </View>

        {/* Radar / Resumen Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Hoy en tu radar</Text>
          <View style={[styles.radarCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
            <View style={styles.radarItem}>
              <View style={[styles.radarDot, { backgroundColor: theme.colors.accentPrimary }]} />
              <Text style={[styles.radarText, { color: theme.colors.textPrimary }]}>Actualiza tu registro de síntomas con la IA</Text>
            </View>
            <View style={[styles.radarDivider, { backgroundColor: theme.colors.background }]} />
            <View style={styles.radarItem}>
              <View style={[styles.radarDot, { backgroundColor: theme.colors.accentSecondary }]} />
              <Text style={[styles.radarText, { color: theme.colors.textPrimary }]}>Revisa la disponibilidad de tus medicamentos</Text>
            </View>
            <View style={[styles.radarDivider, { backgroundColor: theme.colors.background }]} />
            <View style={styles.radarItem}>
              <View style={[styles.radarDot, { backgroundColor: theme.colors.textMuted }]} />
              <Text style={[styles.radarText, { color: theme.colors.textSecondary }]}>No hay citas programadas para hoy</Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  headerTextContainer: {
    flex: 1,
  },
  greeting: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  name: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '900',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  heroBanner: {
    borderRadius: 32,
    padding: 24,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 180,
    justifyContent: 'center',
  },
  heroContent: {
    position: 'relative',
    zIndex: 2,
    width: '75%',
    gap: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  heroSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    opacity: 0.9,
  },
  heroIcon: {
    position: 'absolute',
    right: -15,
    bottom: -15,
    zIndex: 1,
    transform: [{ rotate: '-10deg' }],
  },
  bentoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  bentoSquare: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
    aspectRatio: 1,
    justifyContent: 'space-between',
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoTextWrap: {
    gap: 4,
  },
  bentoTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  bentoSubtitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  bentoRect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
  },
  bentoRectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  section: {
    marginTop: 8,
    gap: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    paddingHorizontal: 4,
  },
  radarCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  radarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  radarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  radarText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  radarDivider: {
    height: 2,
    borderRadius: 1,
  },
});
