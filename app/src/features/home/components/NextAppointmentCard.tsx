import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { PressableScale } from '../../../shared/ui';
import type { AppointmentData } from '../../tabs/services/appointments.service';
import { countdownLabel, dateParts, formatClock, isInProgress } from '../../tabs/utils/appointment-status';
import { SectionHeader } from './SectionHeader';

/** La próxima cita, con cuenta atrás. Sin citas, una invitación a agendar. */
export function NextAppointmentCard({
  theme,
  now,
  appointment,
  upcomingCount,
  onOpen,
}: Readonly<{ theme: AppTheme; now: Date; appointment: AppointmentData | null; upcomingCount: number; onOpen: () => void }>) {
  const accent = theme.colors.accentSecondary;
  const date = appointment ? new Date(appointment.scheduledAt) : null;
  const parts = date ? dateParts(date) : null;
  const inProgress = appointment ? isInProgress(appointment, now) : false;

  return (
    <View style={styles.section}>
      <SectionHeader
        theme={theme}
        title="Próxima cita"
        action={upcomingCount > 1 ? `Ver las ${upcomingCount}` : 'Ver agenda'}
        onAction={onOpen}
      />
      <PressableScale
        onPress={onOpen}
        pressedScale={0.99}
        accessibilityRole="button"
        accessibilityLabel={appointment && date
          ? `${appointment.title} con ${appointment.doctorName}, ${countdownLabel(date, now)}, a las ${formatClock(date)}`
          : 'No tienes citas próximas. Abrir agenda'}
        style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}
      >
        {appointment && date && parts ? (
          <>
            <View style={[styles.dateTile, { backgroundColor: `${accent}14` }]}>
              <Text style={[styles.month, { color: accent }]}>{parts.month}</Text>
              <Text style={[styles.day, { color: theme.colors.textPrimary }]}>{parts.day}</Text>
              <Text style={[styles.weekday, { color: theme.colors.textMuted }]}>{parts.weekday}</Text>
            </View>
            <View style={styles.info}>
              <Text style={[styles.when, { color: inProgress ? theme.colors.accentTertiary : accent }]}>
                {inProgress ? 'En curso' : `${countdownLabel(date, now)} · ${formatClock(date)}`}
              </Text>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={2}>{appointment.title}</Text>
              <Text style={[styles.meta, { color: theme.colors.textSecondary }]} numberOfLines={1}>{appointment.doctorName}</Text>
              {appointment.location ? (
                <View style={styles.location}>
                  <MaterialCommunityIcons name="map-marker-outline" size={13} color={theme.colors.textMuted} />
                  <Text style={[styles.locationText, { color: theme.colors.textMuted }]} numberOfLines={1}>{appointment.location}</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <View style={[styles.emptyIcon, { backgroundColor: `${accent}14` }]}>
              <MaterialCommunityIcons name="calendar-plus" size={24} color={accent} />
            </View>
            <View style={styles.info}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Sin citas próximas</Text>
              <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>Agenda tus controles y te recordaremos antes.</Text>
            </View>
          </>
        )}
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textMuted} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, borderWidth: 1, padding: 14 },
  dateTile: { width: 62, borderRadius: 16, alignItems: 'center', paddingVertical: 8 },
  month: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  day: { fontSize: 24, fontWeight: '900', lineHeight: 28 },
  weekday: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  emptyIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  when: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { fontSize: 16, fontWeight: '900' },
  meta: { fontSize: 13, fontWeight: '600' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locationText: { flex: 1, fontSize: 12, fontWeight: '600' },
});
