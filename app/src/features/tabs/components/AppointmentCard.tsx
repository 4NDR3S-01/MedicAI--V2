import { memo } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import type { AppointmentAttendanceStatus, AppointmentData } from '../services/appointments.service';
import {
  appointmentDate,
  canMarkAttendance,
  dateParts,
  formatClock,
  getAppointmentState,
  isInProgress,
  relativeDayLabel,
  type AppointmentState,
} from '../utils/appointment-status';
import { changedByNote } from '../utils/audit';
import { formatClockIn, isForeignTimeZone } from '../../../shared/services/dose-schedule';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export const APPOINTMENT_STATE_META: Record<AppointmentState, { label: string; icon: IconName }> = {
  upcoming: { label: 'Programada', icon: 'calendar-clock' },
  awaiting: { label: 'Por confirmar', icon: 'help-circle-outline' },
  attended: { label: 'Asistí', icon: 'check-circle' },
  missed: { label: 'No asistí', icon: 'close-circle-outline' },
};

export function appointmentStateColor(theme: AppTheme, state: AppointmentState): string {
  switch (state) {
    case 'attended':
      return theme.colors.success;
    case 'awaiting':
      return theme.colors.accentTertiary;
    case 'missed':
      return theme.colors.textMuted;
    case 'upcoming':
    default:
      return theme.colors.accentSecondary;
  }
}

type AppointmentCardProps = {
  theme: AppTheme;
  appointment: AppointmentData;
  now: Date;
  busy: boolean;
  onEdit: (appointment: AppointmentData) => void;
  onDelete: (appointment: AppointmentData) => void;
  onMarkAttendance: (appointment: AppointmentData, status: AppointmentAttendanceStatus) => void;
  onChangeAttendance: (appointment: AppointmentData) => void;
  onDirections: (appointment: AppointmentData) => void;
  /** Al ver las citas de otra persona sin permiso para gestionarlas: solo lectura. */
  canManage?: boolean;
  /** Zona horaria del dueño (otra persona): se muestra su hora y la tuya. */
  ownerTimeZone?: string | null;
};

function AppointmentCardBase({
  theme,
  appointment,
  now,
  busy,
  onEdit,
  onDelete,
  onMarkAttendance,
  onChangeAttendance,
  onDirections,
  canManage = true,
  ownerTimeZone,
}: Readonly<AppointmentCardProps>) {
  const date = appointmentDate(appointment);
  const state = getAppointmentState(appointment, now);
  const inProgress = isInProgress(appointment, now);
  const color = inProgress ? theme.colors.accentPrimary : appointmentStateColor(theme, state);
  const meta = inProgress ? { label: 'En curso', icon: 'progress-clock' as IconName } : APPOINTMENT_STATE_META[state];
  const parts = date ? dateParts(date) : null;
  const isPast = state !== 'upcoming';
  const askAttendance = canManage && (state === 'awaiting' || (inProgress && canMarkAttendance(appointment, now)));
  const canChangeAttendance = canManage && (state === 'attended' || state === 'missed');
  const whenLabel = date
    ? isForeignTimeZone(ownerTimeZone)
      ? `${relativeDayLabel(date, now)} · ${formatClockIn(date, ownerTimeZone)} su hora (${formatClock(date)} tuya)`
      : `${relativeDayLabel(date, now)} · ${formatClock(date)}`
    : 'Sin fecha';

  return (
    <Pressable
      onLongPress={canManage ? () => onEdit(appointment) : undefined}
      delayLongPress={250}
      accessibilityLabel={`${appointment.title} con ${appointment.doctorName}, ${whenLabel}, ${meta.label.toLowerCase()}`}
      accessibilityHint={canManage ? 'Mantén presionado para editar' : undefined}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder, borderLeftColor: color },
        state === 'missed' && styles.cardDimmed,
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.dateBox, { backgroundColor: `${color}12` }]}>
          <Text style={[styles.dateDay, { color: theme.colors.textPrimary }]}>{parts?.day ?? '--'}</Text>
          <Text style={[styles.dateMonth, { color }]}>{parts?.month ?? '--'}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={2}>
            {appointment.title}
          </Text>
          <View style={styles.whenRow}>
            <MaterialCommunityIcons name="clock-outline" size={14} color={color} />
            <Text style={[styles.whenText, { color }]}>{whenLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="stethoscope" size={16} color={theme.colors.textMuted} />
          <Text style={[styles.detailText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {appointment.doctorName}
          </Text>
        </View>
        {appointment.location ? (
          <Pressable
            onPress={() => onDirections(appointment)}
            hitSlop={4}
            accessibilityRole="link"
            accessibilityLabel={`${appointment.location}. Abrir en el mapa`}
            style={({ pressed }) => [styles.detailRow, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="map-marker-outline" size={16} color={theme.colors.textMuted} />
            <Text style={[styles.detailText, styles.linkText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {appointment.location}
            </Text>
            {!isPast ? <MaterialCommunityIcons name="directions" size={16} color={theme.colors.accentSecondary} /> : null}
          </Pressable>
        ) : null}
        {appointment.notes ? (
          <View style={[styles.notes, { backgroundColor: `${theme.colors.textMuted}10` }]}>
            <MaterialCommunityIcons name="note-text-outline" size={13} color={theme.colors.textMuted} />
            <Text style={[styles.notesText, { color: theme.colors.textMuted }]} numberOfLines={2}>
              {appointment.notes}
            </Text>
          </View>
        ) : null}
      </View>

      {changedByNote(appointment, { masculine: false }) ? (
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="account-edit-outline" size={14} color={theme.colors.textMuted} />
          <Text style={[styles.auditText, { color: theme.colors.textMuted }]}>{changedByNote(appointment, { masculine: false })}</Text>
        </View>
      ) : null}

      {askAttendance ? (
        <View style={[styles.ask, { backgroundColor: `${theme.colors.accentTertiary}12`, borderColor: `${theme.colors.accentTertiary}35` }]}>
          <Text style={[styles.askText, { color: theme.colors.textPrimary }]}>¿Asististe a esta cita?</Text>
          <View style={styles.askActions}>
            <AskButton
              label="No asistí"
              icon="close"
              color={theme.colors.textSecondary}
              background={theme.colors.inputBackground}
              border={theme.colors.inputBorder}
              disabled={busy}
              onPress={() => onMarkAttendance(appointment, 'MISSED')}
            />
            <AskButton
              label="Asistí"
              icon="check"
              color={theme.colors.buttonText}
              background={theme.colors.success}
              border={theme.colors.success}
              disabled={busy}
              onPress={() => onMarkAttendance(appointment, 'ATTENDED')}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          onPress={canChangeAttendance ? () => onChangeAttendance(appointment) : undefined}
          disabled={busy || !canChangeAttendance}
          accessibilityRole={canChangeAttendance ? 'button' : undefined}
          accessibilityLabel={`${meta.label}${canChangeAttendance ? '. Toca para cambiar' : ''}`}
          style={[styles.statusPill, { backgroundColor: `${color}14` }]}
        >
          <MaterialCommunityIcons name={meta.icon} size={14} color={color} />
          <Text style={[styles.statusText, { color }]}>{meta.label}</Text>
          {canChangeAttendance ? <MaterialCommunityIcons name="chevron-down" size={14} color={color} /> : null}
        </Pressable>
        {canManage ? (
          <View style={styles.actions}>
            <IconAction
              icon="pencil-outline"
              color={theme.colors.textSecondary}
              background={`${theme.colors.textSecondary}0D`}
              label={`Editar ${appointment.title}`}
              onPress={() => onEdit(appointment)}
            />
            <IconAction
              icon="trash-can-outline"
              color={theme.colors.accentTertiary}
              background={`${theme.colors.accentTertiary}12`}
              label={`Eliminar ${appointment.title}`}
              onPress={() => onDelete(appointment)}
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export const AppointmentCard = memo(AppointmentCardBase);

function AskButton({
  label,
  icon,
  color,
  background,
  border,
  disabled,
  onPress,
}: Readonly<{ label: string; icon: IconName; color: string; background: string; border: string; disabled: boolean; onPress: () => void }>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.askButton,
        { backgroundColor: background, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={16} color={color} />
      <Text style={[styles.askButtonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function IconAction({
  icon,
  color,
  background,
  label,
  onPress,
}: Readonly<{ icon: IconName; color: string; background: string; label: string; onPress: () => void }>) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconAction, { backgroundColor: background }, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={16} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, borderLeftWidth: 4, padding: 16, gap: 12 },
  cardDimmed: { opacity: 0.75 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateBox: { width: 52, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 21, fontWeight: '900', letterSpacing: -0.8, lineHeight: 24 },
  dateMonth: { fontSize: 10.5, fontWeight: '900', letterSpacing: 0.6 },
  headerInfo: { flex: 1, gap: 4 },
  title: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  whenText: { fontSize: 13, fontWeight: '800' },
  details: { gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { flexShrink: 1, fontSize: 14, fontWeight: '600' },
  linkText: { textDecorationLine: 'underline' },
  notes: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  notesText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  ask: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  askText: { fontSize: 14, fontWeight: '800' },
  askActions: { flexDirection: 'row', gap: 8 },
  askButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
  },
  askButtonText: { fontSize: 14, fontWeight: '800' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 6 },
  iconAction: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  auditText: { fontSize: 12, fontWeight: '600' },
});
