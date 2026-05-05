import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '../../../shared/ui';
import type { AppTheme } from '../../../shared/theme';

export type HomeScreenProps = {
  theme: AppTheme;
  userEmail: string | null;
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

type QuickActionSpec = {
  key: string;
  label: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: 'accentPrimary' | 'accentSecondary' | 'accentTertiary';
  onPress?: () => void;
};

export function HomeScreen({
  theme,
  userEmail,
  contentBottomInset,
  onOpenMedications,
  onOpenAppointments,
  onOpenReminders,
  onOpenAssistant,
}: Readonly<HomeScreenProps>) {
  const greeting = useMemo(() => getGreeting(), []);
  const displayName = useMemo(() => displayNameFromEmail(userEmail), [userEmail]);
  const avatarLetter = useMemo(() => initialFromName(displayName), [displayName]);

  const quickActions: QuickActionSpec[] = useMemo(
    () => [
      {
        key: 'meds',
        label: 'Medicamentos',
        subtitle: 'Dosis, stock y fichas',
        icon: 'pill',
        accent: 'accentPrimary',
        onPress: openOrStub('Medicamentos', onOpenMedications),
      },
      {
        key: 'appts',
        label: 'Citas',
        subtitle: 'Agenda y recordatorios',
        icon: 'calendar-clock',
        accent: 'accentSecondary',
        onPress: openOrStub('Citas', onOpenAppointments),
      },
      {
        key: 'remind',
        label: 'Alertas',
        subtitle: 'Notificaciones de salud',
        icon: 'bell-ring-outline',
        accent: 'accentTertiary',
        onPress: openOrStub('Alertas', onOpenReminders),
      },
      {
        key: 'ai',
        label: 'Asistente IA',
        subtitle: 'Preguntas y guía',
        icon: 'robot-outline',
        accent: 'accentPrimary',
        onPress: openOrStub('Asistente IA', onOpenAssistant),
      },
    ],
    [onOpenMedications, onOpenAppointments, onOpenReminders, onOpenAssistant],
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomInset }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroTextBlock}>
              <Text style={[styles.greeting, { color: theme.colors.textMuted }]}>{greeting}</Text>
              <Text style={[styles.heroName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                {displayName}
              </Text>
              {userEmail ? (
                <Text
                  style={[styles.heroEmail, { color: theme.colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {userEmail}
                </Text>
              ) : null}
            </View>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: `${theme.colors.accentPrimary}24`,
                  borderColor: `${theme.colors.accentPrimary}55`,
                },
              ]}
            >
              <Text style={[styles.avatarLetter, { color: theme.colors.accentPrimary }]}>
                {avatarLetter}
              </Text>
            </View>
          </View>

          <View style={styles.logoRow}>
            <BrandLogo theme={theme} size={44} showName={false} />
            <View style={styles.logoTextCol}>
              <Text style={[styles.appName, { color: theme.colors.textPrimary }]}>MedicAI</Text>
              <Text style={[styles.tagline, { color: theme.colors.textMuted }]}>
                Medicación, citas y seguimiento en un solo lugar.
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Resumen</Text>
        <View style={styles.statsRow}>
          {[
            { label: 'Activos', value: '—', hint: 'Medicamentos en tratamiento', icon: 'pill-multiple' as const },
            { label: 'Citas', value: '—', hint: 'Próximas en agenda', icon: 'calendar-month-outline' as const },
            { label: 'Alertas', value: '—', hint: 'Recordatorios pendientes', icon: 'bell-outline' as const },
          ].map((stat) => (
            <View
              key={stat.label}
              style={[
                styles.statCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.surfaceBorder,
                },
              ]}
              accessibilityRole="summary"
              accessibilityLabel={`${stat.label}: ${stat.value}. ${stat.hint}`}
            >
              <MaterialCommunityIcons name={stat.icon} size={20} color={theme.colors.accentSecondary} />
              <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Accesos rápidos</Text>
        <View style={styles.quickGrid}>
          {quickActions.map((action) => {
            const accent = theme.colors[action.accent];
            return (
              <Pressable
                key={action.key}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.quickCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.surfaceBorder,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityHint={action.subtitle}
              >
                <View
                  style={[
                    styles.quickIconWrap,
                    { backgroundColor: `${accent}1F`, borderColor: `${accent}40` },
                  ]}
                >
                  <MaterialCommunityIcons name={action.icon} size={22} color={accent} />
                </View>
                <Text style={[styles.quickTitle, { color: theme.colors.textPrimary }]}>{action.label}</Text>
                <Text style={[styles.quickSubtitle, { color: theme.colors.textMuted }]}>
                  {action.subtitle}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View
          style={[
            styles.wellnessCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.surfaceBorder,
            },
          ]}
        >
          <View style={styles.wellnessHeader}>
            <MaterialCommunityIcons name="heart-pulse" size={22} color={theme.colors.accentPrimary} />
            <Text style={[styles.wellnessTitle, { color: theme.colors.textPrimary }]}>Bienestar hoy</Text>
          </View>
          <Text style={[styles.wellnessBody, { color: theme.colors.textSecondary }]}>
            Mantén tus horarios de medicación y revisa las interacciones antes de combinar fármacos. Si
            algo cambia en tu salud, actualiza tu perfil para recomendaciones más seguras.
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: `${theme.colors.accentPrimary}18` }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: '36%',
                  backgroundColor: theme.colors.accentPrimary,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressCaption, { color: theme.colors.textMuted }]}>
            Rutina semanal · conecta tus hábitos cuando estén disponibles los datos
          </Text>
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
    paddingHorizontal: 22,
    paddingTop: 12,
    gap: 18,
  },
  heroCard: {
    gap: 16,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  heroTextBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  greeting: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  heroName: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  heroEmail: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: '800',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoTextCol: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  appName: {
    fontSize: 17,
    fontWeight: '800',
  },
  tagline: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: -6,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 6,
    minWidth: 0,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 8,
  },
  quickIconWrap: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  quickSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  wellnessCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 12,
  },
  wellnessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wellnessTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  wellnessBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
});
