import { memo, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { readableText, type AppTheme } from '../../../shared/theme';
import { BottomSheet, SheetInfo, SheetInfoLine, SheetOptionRow } from '../../../shared/ui';
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
import { repeatLabel } from '../utils/appointment-series';

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
  const [optionsOpen, setOptionsOpen] = useState(false);
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

  // "Programada" es lo normal: el estado solo se muestra cuando aporta algo.
  const showStatus = inProgress || isPast;
  const hasDetails = Boolean(appointment.notes || repeatLabel(appointment.repeatRule) || changedByNote(appointment, { masculine: false }));
  const hasOptions = canManage || hasDetails;

  return (
    <>
    <Pressable
      onPress={hasOptions ? () => setOptionsOpen(true) : undefined}
      onLongPress={canManage ? () => onEdit(appointment) : undefined}
      delayLongPress={300}
      accessibilityRole={hasOptions ? 'button' : undefined}
      accessibilityLabel={`${appointment.title} con ${appointment.doctorName}, ${whenLabel}, ${meta.label.toLowerCase()}`}
      accessibilityHint={hasOptions ? 'Abre los detalles y las opciones' : undefined}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
        state === 'missed' && styles.cardDimmed,
        pressed && hasOptions && styles.cardPressed,
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.dateBox, { backgroundColor: `${color}12` }]}>
          <Text style={[styles.dateDay, { color: theme.colors.textPrimary }]}>{parts?.day ?? '--'}</Text>
          <Text style={[styles.dateMonth, { color: readableText(theme, color) }]}>{parts?.month ?? '--'}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={2}>
            {appointment.title}
          </Text>
          <View style={styles.whenRow}>
            <MaterialCommunityIcons name="clock-outline" size={14} color={color} />
            <Text style={[styles.whenText, { color: readableText(theme, color) }]}>{whenLabel}</Text>
          </View>
        </View>
        {hasOptions ? <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} /> : null}
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
      </View>

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

      {showStatus && !askAttendance ? (
        <View style={styles.footer}>
          <Pressable
            onPress={canChangeAttendance ? () => onChangeAttendance(appointment) : undefined}
            disabled={busy || !canChangeAttendance}
            accessibilityRole={canChangeAttendance ? 'button' : undefined}
            accessibilityLabel={`${meta.label}${canChangeAttendance ? '. Toca para cambiar' : ''}`}
            style={[styles.statusPill, { backgroundColor: `${color}14` }]}
          >
            <MaterialCommunityIcons name={meta.icon} size={14} color={color} />
            <Text style={[styles.statusText, { color: readableText(theme, color) }]}>{meta.label}</Text>
            {canChangeAttendance ? <MaterialCommunityIcons name="chevron-down" size={14} color={color} /> : null}
          </Pressable>
        </View>
      ) : null}
    </Pressable>

    {hasOptions ? (
      <AppointmentOptionsSheet
        theme={theme}
        appointment={optionsOpen ? appointment : null}
        canManage={canManage}
        onClose={() => setOptionsOpen(false)}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    ) : null}
    </>
  );
}

/** Detalle (notas, repetición, quién la cambió) y acciones de una cita. */
function AppointmentOptionsSheet({
  theme,
  appointment,
  canManage,
  onClose,
  onEdit,
  onDelete,
}: Readonly<{
  theme: AppTheme;
  appointment: AppointmentData | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (appointment: AppointmentData) => void;
  onDelete: (appointment: AppointmentData) => void;
}>) {
  const last = useRef(appointment);
  if (appointment) last.current = appointment;
  const item = appointment ?? last.current;
  if (!item) return null;

  const date = appointmentDate(item);
  const audit = changedByNote(item, { masculine: false });
  const thenClose = (action: (a: AppointmentData) => void) => () => {
    onClose();
    setTimeout(() => action(item), 220);
  };

  return (
    <BottomSheet
      theme={theme}
      visible={Boolean(appointment)}
      onClose={onClose}
      title={item.title}
      subtitle={
        <Text style={[styles.sheetSubtitle, { color: theme.colors.textMuted }]}>
          {date ? `${date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · ${formatClock(date)}` : 'Sin fecha'}
          {' · '}
          {item.doctorName}
        </Text>
      }
    >
      <View>
        {repeatLabel(item.repeatRule) || item.notes || audit ? (
          <SheetInfo theme={theme}>
            {repeatLabel(item.repeatRule) ? <SheetInfoLine theme={theme} icon="repeat" text={repeatLabel(item.repeatRule) ?? ''} /> : null}
            {item.notes ? <SheetInfoLine theme={theme} icon="note-text-outline" text={item.notes} /> : null}
            {audit ? <SheetInfoLine theme={theme} icon="account-edit-outline" text={audit} /> : null}
          </SheetInfo>
        ) : null}
        {canManage ? (
          <>
            <SheetOptionRow theme={theme} icon="pencil-outline" label="Editar cita" hint="Fecha, lugar, médico y recordatorio" onPress={thenClose(onEdit)} />
            <SheetOptionRow theme={theme} icon="trash-can-outline" label="Eliminar cita" destructive onPress={thenClose(onDelete)} />
          </>
        ) : null}
      </View>
    </BottomSheet>
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

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  cardPressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
  sheetSubtitle: { fontSize: 14, marginTop: 4 },
  cardDimmed: { opacity: 0.75 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateBox: { width: 52, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 20, fontWeight: '800', letterSpacing: -0.8, lineHeight: 24 },
  dateMonth: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  headerInfo: { flex: 1, gap: 4 },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  whenText: { fontSize: 13, fontWeight: '600' },
  details: { gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { flexShrink: 1, fontSize: 14, fontWeight: '600' },
  linkText: { textDecorationLine: 'underline' },
  ask: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  askText: { fontSize: 14, fontWeight: '700' },
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
  askButtonText: { fontSize: 14, fontWeight: '700' },
  footer: { flexDirection: 'row' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
