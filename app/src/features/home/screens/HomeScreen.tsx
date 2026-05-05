import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';

export type HomeScreenProps = {
  theme: AppTheme;
  userFullName: string | null;
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
  userFullName,
  userEmail,
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

  const quickActions: QuickActionSpec[] = useMemo(
    () => [
      {
        key: 'meds',
        label: 'Medicamentos',
        subtitle: 'Control de dosis y stock',
        icon: 'pill',
        accent: 'accentPrimary',
        onPress: openOrStub('Medicamentos', onOpenMedications),
      },
      {
        key: 'appts',
        label: 'Citas',
        subtitle: 'Agenda y seguimiento',
        icon: 'calendar-clock',
        accent: 'accentSecondary',
        onPress: openOrStub('Citas', onOpenAppointments),
      },
      {
        key: 'remind',
        label: 'Alertas',
        subtitle: 'Recordatorios de salud',
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
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: `${theme.colors.accentPrimary}14`,
              borderColor: `${theme.colors.accentPrimary}40`,
            },
          ]}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroTextBlock}>
              <Text style={[styles.greeting, { color: theme.colors.textMuted }]}>{greeting}</Text>
              <Text style={[styles.heroName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={[styles.heroHelper, { color: theme.colors.textSecondary }]}>
                {`Hola ${firstName}, aquí tienes tu panel de salud.`}
              </Text>
            </View>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: `${theme.colors.accentPrimary}55`,
                },
              ]}
            >
              <Text style={[styles.avatarLetter, { color: theme.colors.accentPrimary }]}>
                {avatarLetter}
              </Text>
            </View>
          </View>
          {userEmail ? (
            <Text style={[styles.heroEmail, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {userEmail}
            </Text>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Resumen de hoy</Text>
          <Text style={[styles.sectionAction, { color: theme.colors.accentPrimary }]}>Ver detalle</Text>
        </View>
        <View style={styles.metricsGrid}>
          {[
            {
              label: 'Medicamentos',
              value: '--',
              hint: 'Tratamientos activos',
              icon: 'pill-multiple' as const,
              accent: theme.colors.accentPrimary,
            },
            {
              label: 'Próxima cita',
              value: '--',
              hint: 'Agenda médica',
              icon: 'calendar-month-outline' as const,
              accent: theme.colors.accentSecondary,
            },
            {
              label: 'Recordatorios',
              value: '--',
              hint: 'Pendientes hoy',
              icon: 'bell-outline' as const,
              accent: theme.colors.accentTertiary,
            },
            {
              label: 'IA',
              value: 'Online',
              hint: 'Asistente disponible',
              icon: 'robot-outline' as const,
              accent: theme.colors.accentPrimary,
            },
          ].map((stat) => (
            <View
              key={stat.label}
              style={[
                styles.metricCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.surfaceBorder,
                },
              ]}
              accessibilityRole="text"
              accessibilityLabel={`${stat.label}: ${stat.value}. ${stat.hint}`}
            >
              <View style={[styles.metricIconWrap, { backgroundColor: `${stat.accent}22` }]}>
                <MaterialCommunityIcons name={stat.icon} size={18} color={stat.accent} />
              </View>
              <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{stat.value}</Text>
              <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>{stat.label}</Text>
              <Text style={[styles.metricHint, { color: theme.colors.textMuted }]}>{stat.hint}</Text>
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
                    borderColor: `${accent}55`,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityHint={action.subtitle}
              >
                <View
                  style={[
                    styles.quickIconWrap,
                    { backgroundColor: `${accent}20`, borderColor: `${accent}45` },
                  ]}
                >
                  <MaterialCommunityIcons name={action.icon} size={22} color={accent} />
                </View>
                <Text style={[styles.quickTitle, { color: theme.colors.textPrimary }]}>{action.label}</Text>
                <Text style={[styles.quickSubtitle, { color: theme.colors.textMuted }]}>
                  {action.subtitle}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={18}
                  color={theme.colors.textMuted}
                  style={styles.quickChevron}
                />
              </Pressable>
            );
          })}
        </View>

        <View
          style={[
            styles.timelineCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.surfaceBorder,
            },
          ]}
        >
          <View style={styles.timelineHeader}>
            <Text style={[styles.timelineTitle, { color: theme.colors.textPrimary }]}>Próximos pasos</Text>
            <MaterialCommunityIcons name="clock-outline" size={18} color={theme.colors.textMuted} />
          </View>
          <View style={styles.timelineList}>
            {[
              'Registrar tus medicamentos activos',
              'Configurar recordatorios diarios',
              'Añadir tu próxima cita médica',
            ].map((item) => (
              <View key={item} style={styles.timelineItem}>
                <View style={[styles.timelineDot, { backgroundColor: theme.colors.accentPrimary }]} />
                <Text style={[styles.timelineText, { color: theme.colors.textSecondary }]}>{item}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.timelineCaption, { color: theme.colors.textMuted }]}>
            Completa estos pasos para desbloquear recomendaciones personalizadas.
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
    paddingTop: 14,
    gap: 20,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 10,
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
    fontWeight: '600',
    marginTop: 4,
  },
  heroHelper: {
    fontSize: 13,
    lineHeight: 19,
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionAction: {
    fontSize: 13,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 4,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricHint: {
    fontSize: 11,
    lineHeight: 15,
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
    position: 'relative',
    overflow: 'hidden',
  },
  quickChevron: {
    position: 'absolute',
    right: 12,
    top: 12,
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
  timelineCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 12,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  timelineList: {
    gap: 10,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  timelineText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  timelineCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
});
