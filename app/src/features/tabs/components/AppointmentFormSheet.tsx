import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import {
  AppButton,
  ERROR_COLOR,
  FieldShell,
  FormSheet,
  PressableScale,
  TextField,
  useFieldColors,
} from '../../../shared/ui';
import { LeafletMapModal } from '../../../shared/components/LeafletMapModal';
import {
  formatLeadMinutes,
  getAppointmentReminderLeadMinutes,
  scheduleAppointmentReminder,
} from '../../../shared/services/notifications.service';
import { getStoredSession } from '../../auth';
import * as appointmentsAPI from '../services/appointments.service';
import type { AppointmentData } from '../services/appointments.service';
import { formatClock } from '../utils/appointment-status';
import { findDuplicateAppointment } from '../utils/duplicates';
import { isForeignTimeZone, zonedParts, zonedToDate } from '../../../shared/services/dose-schedule';

const TITLE_MAX = 120;
const DOCTOR_MAX = 120;
const LOCATION_MAX = 160;
const NOTES_MAX = 500;

type FormState = {
  title: string;
  doctorName: string;
  date: Date | null; // solo día
  time: string; // HH:mm
  location: string;
  notes: string;
};

type FormErrors = Partial<Record<'title' | 'doctorName' | 'date' | 'time', string>>;

const emptyForm = (): FormState => ({ title: '', doctorName: '', date: null, time: '', location: '', notes: '' });

/** Fecha y hora "de pared" en la zona del dueño (o la del teléfono). */
const wallClock = (instant: Date, timeZone?: string | null) => {
  if (!isForeignTimeZone(timeZone)) return { date: instant, time: formatClock(instant) };
  const p = zonedParts(instant, timeZone);
  return {
    date: new Date(p.year, p.month - 1, p.day),
    time: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
  };
};

const formFromAppointment = (appointment: AppointmentData, timeZone?: string | null): FormState => {
  const scheduled = new Date(appointment.scheduledAt);
  const valid = !Number.isNaN(scheduled.getTime());
  const wall = valid ? wallClock(scheduled, timeZone) : null;
  return {
    title: appointment.title,
    doctorName: appointment.doctorName,
    date: wall?.date ?? null,
    time: wall?.time ?? '',
    location: appointment.location ?? '',
    notes: appointment.notes ?? '',
  };
};

/** Día + hora elegidos → instante. En otra zona, son la fecha y hora del dueño. */
const combine = (date: Date, time: string, timeZone?: string | null): Date => {
  const [hours, minutes] = time.split(':').map(Number);
  if (isForeignTimeZone(timeZone)) {
    return zonedToDate(date.getFullYear(), date.getMonth() + 1, date.getDate(), hours, minutes, timeZone);
  }
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
};

const timeToDate = (time: string): Date => combine(new Date(), time || '09:00');

const formatLongDate = (date: Date) =>
  date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function validate(form: FormState, original: AppointmentData | null | undefined, timeZone?: string | null): FormErrors {
  const errors: FormErrors = {};
  if (!form.title.trim()) errors.title = 'Indica el motivo de la cita.';
  if (!form.doctorName.trim()) errors.doctorName = 'Indica el profesional o especialidad.';
  if (!form.date) errors.date = 'Elige la fecha.';
  if (!form.time) errors.time = 'Elige la hora.';
  if (form.date && form.time) {
    const scheduled = combine(form.date, form.time, timeZone);
    const unchanged = original && new Date(original.scheduledAt).getTime() === scheduled.getTime();
    // Al editar se permite conservar una fecha ya pasada (p. ej. corregir el título).
    if (!unchanged && scheduled.getTime() <= Date.now()) errors.time = 'Esa fecha y hora ya pasaron.';
  }
  return errors;
}

export type AppointmentFormSheetProps = {
  theme: AppTheme;
  visible: boolean;
  appointment?: AppointmentData | null;
  onClose: () => void;
  onSaved: (appointment: AppointmentData, isNew: boolean) => void;
  /** Cita de otra persona del Círculo: sus recordatorios suenan en su teléfono. */
  ownerId?: string;
  /** La otra persona no usa la app (perfil a cargo). */
  ownerIsDependent?: boolean;
  /** Zona horaria del dueño: la fecha y hora se eligen en su hora local. */
  ownerTimeZone?: string | null;
  /** Citas actuales del dueño, para avisar si se repite una. */
  existingAppointments?: AppointmentData[];
};

export function AppointmentFormSheet({
  theme,
  visible,
  appointment,
  onClose,
  onSaved,
  ownerId,
  ownerIsDependent = false,
  ownerTimeZone,
  existingAppointments = [],
}: Readonly<AppointmentFormSheetProps>) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showErrors, setShowErrors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [iosPicker, setIosPicker] = useState<'date' | 'time' | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [leadMinutes, setLeadMinutes] = useState<number | null>(null);
  const isEditing = Boolean(appointment);

  useEffect(() => {
    if (!visible) return;
    setForm(appointment ? formFromAppointment(appointment, ownerTimeZone) : emptyForm());
    setShowErrors(false);
    setIosPicker(null);
    void getAppointmentReminderLeadMinutes().then(setLeadMinutes).catch(() => setLeadMinutes(null));
  }, [visible, appointment]);

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  const errors = showErrors ? validate(form, appointment, ownerTimeZone) : {};
  const dateColors = useFieldColors(theme, iosPicker === 'date', Boolean(errors.date));
  const timeColors = useFieldColors(theme, iosPicker === 'time', Boolean(errors.time));

  const openDatePicker = () => {
    const value = form.date ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate: isEditing ? undefined : new Date(),
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) update({ date: selected });
        },
      });
    } else {
      if (!form.date) update({ date: value });
      setIosPicker((current) => (current === 'date' ? null : 'date'));
    }
  };

  const openTimePicker = () => {
    const value = timeToDate(form.time);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'time',
        is24Hour: true,
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) update({ time: formatClock(selected) });
        },
      });
    } else {
      if (!form.time) update({ time: formatClock(value) });
      setIosPicker((current) => (current === 'time' ? null : 'time'));
    }
  };

  const handleSave = async (confirmedDuplicate = false) => {
    setShowErrors(true);
    const currentErrors = validate(form, appointment, ownerTimeZone);
    if (Object.values(currentErrors).some(Boolean) || !form.date) return;

    // La misma cita ya registrada (p. ej. por otra persona del Círculo).
    const duplicate = confirmedDuplicate
      ? null
      : findDuplicateAppointment(combine(form.date, form.time, ownerTimeZone), form.doctorName, form.title, existingAppointments, appointment?.id);
    if (duplicate) {
      const when = new Date(duplicate.scheduledAt).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      Alert.alert(
        'Parece que esta cita ya existe',
        `Ya hay una cita "${duplicate.title}" con ${duplicate.doctorName} el ${when}. Si es la misma, no la agregues otra vez.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Es otra, guardar', onPress: () => void handleSave(true) },
        ],
      );
      return;
    }

    const session = await getStoredSession();
    if (!session?.accessToken) {
      Alert.alert('Sesión expirada', 'Vuelve a iniciar sesión para continuar.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      doctorName: form.doctorName.trim(),
      scheduledAt: combine(form.date, form.time, ownerTimeZone).toISOString(),
      location: form.location.trim(),
      notes: form.notes.trim(),
    };

    // El backend reinicia la asistencia al recibir scheduledAt: solo se envía si cambió.
    const rescheduled = !appointment || new Date(appointment.scheduledAt).toISOString() !== payload.scheduledAt;

    try {
      setIsSaving(true);
      const saved = appointment
        ? await appointmentsAPI.updateAppointment(
          appointment.id,
          session.accessToken,
          { ...payload, scheduledAt: rescheduled ? payload.scheduledAt : undefined },
          ownerId,
        )
        : await appointmentsAPI.createAppointment(
          session.accessToken,
          { ...payload, location: payload.location || undefined, notes: payload.notes || undefined },
          ownerId,
        );
      // Los recordatorios no deben impedir guardar la cita.
      if (!ownerId) void scheduleAppointmentReminder(saved).catch(() => undefined);
      onSaved(saved, !appointment);
      onClose();
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo de nuevo en unos momentos.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <FormSheet
        theme={theme}
        visible={visible}
        title={isEditing ? 'Editar cita' : 'Nueva cita'}
        subtitle={isEditing ? undefined : 'Te recordaremos antes de la consulta.'}
        onClose={onClose}
        dismissDisabled={isSaving}
        footer={
          <>
            <AppButton theme={theme} label="Cancelar" variant="secondary" onPress={onClose} disabled={isSaving} style={styles.flex} />
            <AppButton
              theme={theme}
              label={isEditing ? 'Guardar cambios' : 'Guardar'}
              icon="checkmark"
              onPress={() => void handleSave()}
              loading={isSaving}
              style={styles.flexWide}
            />
          </>
        }
      >
        <TextField
          theme={theme}
          label="Motivo"
          value={form.title}
          error={errors.title}
          onChangeText={(title) => update({ title })}
          placeholder="Ej. Control de cardiología"
          maxLength={TITLE_MAX}
          autoCapitalize="sentences"
          returnKeyType="next"
        />

        <TextField
          theme={theme}
          label="Profesional"
          value={form.doctorName}
          error={errors.doctorName}
          onChangeText={(doctorName) => update({ doctorName })}
          placeholder="Ej. Dra. Pérez"
          maxLength={DOCTOR_MAX}
          autoCapitalize="words"
          returnKeyType="next"
        />

        <View style={styles.row}>
          <View style={styles.flexWide}>
            <FieldShell theme={theme} label="Fecha" error={errors.date}>
              <PressableScale
                pressedScale={0.98}
                onPress={openDatePicker}
                accessibilityRole="button"
                accessibilityLabel={form.date ? `Fecha: ${formatLongDate(form.date)}. Toca para cambiar.` : 'Elegir fecha'}
                style={[styles.selector, dateColors]}
              >
                <Ionicons name="calendar-outline" size={20} color={theme.colors.accentSecondary} />
                <Text
                  style={[styles.selectorText, { color: form.date ? theme.colors.textPrimary : theme.colors.inputPlaceholder }]}
                  numberOfLines={1}
                >
                  {form.date ? formatLongDate(form.date) : 'Elegir'}
                </Text>
              </PressableScale>
            </FieldShell>
          </View>
          <View style={styles.flex}>
            <FieldShell theme={theme} label="Hora" error={errors.time}>
              <PressableScale
                pressedScale={0.98}
                onPress={openTimePicker}
                accessibilityRole="button"
                accessibilityLabel={form.time ? `Hora: ${form.time}. Toca para cambiar.` : 'Elegir hora'}
                style={[styles.selector, timeColors]}
              >
                <Ionicons name="time-outline" size={20} color={theme.colors.accentSecondary} />
                <Text style={[styles.selectorText, { color: form.time ? theme.colors.textPrimary : theme.colors.inputPlaceholder }]}>
                  {form.time || 'Elegir'}
                </Text>
              </PressableScale>
            </FieldShell>
          </View>
        </View>

        {Platform.OS === 'ios' && iosPicker === 'date' ? (
          <DateTimePicker
            value={form.date ?? new Date()}
            mode="date"
            display="inline"
            minimumDate={isEditing ? undefined : new Date()}
            locale="es-ES"
            themeVariant={theme.mode}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              if (selected) update({ date: selected });
            }}
          />
        ) : null}
        {Platform.OS === 'ios' && iosPicker === 'time' ? (
          <DateTimePicker
            value={timeToDate(form.time)}
            mode="time"
            display="spinner"
            is24Hour
            locale="es-ES"
            themeVariant={theme.mode}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              if (selected) update({ time: formatClock(selected) });
            }}
          />
        ) : null}

        <TextField
          theme={theme}
          label="Lugar"
          optional
          value={form.location}
          onChangeText={(location) => update({ location })}
          placeholder="Ej. Clínica Central, consultorio 204"
          maxLength={LOCATION_MAX}
          trailing={
            <Pressable
              onPress={() => setMapVisible(true)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Elegir lugar en el mapa"
              style={({ pressed }) => [styles.mapButton, { backgroundColor: `${theme.colors.accentSecondary}18`, opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="map-outline" size={20} color={theme.colors.accentSecondary} />
            </Pressable>
          }
        />

        <TextField
          theme={theme}
          label="Notas"
          optional
          value={form.notes}
          onChangeText={(notes) => update({ notes })}
          placeholder="Ej. Llevar exámenes de sangre, ir en ayunas"
          maxLength={NOTES_MAX}
          multiline
          textAlignVertical="top"
        />

        {isForeignTimeZone(ownerTimeZone) ? (
          <View style={[styles.info, { backgroundColor: `${theme.colors.accentSecondary}12` }]}>
            <Ionicons name="earth-outline" size={16} color={theme.colors.accentSecondary} />
            <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
              Elige la fecha y la hora de la cita en la hora local de esa persona ({ownerTimeZone?.split('/').pop()?.replace(/_/g, ' ')}).
            </Text>
          </View>
        ) : null}

        <View style={[styles.info, { backgroundColor: `${theme.colors.accentSecondary}12` }]}>
          <Ionicons name="notifications-outline" size={16} color={theme.colors.accentSecondary} />
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
            {ownerId
              ? ownerIsDependent
                ? 'Los recordatorios llegarán a los cuidadores que los tengan activados en su ficha.'
                : 'Los recordatorios le llegarán a su teléfono la próxima vez que abra MedicAI.'
              : leadMinutes
                ? `Te avisaremos ${formatLeadMinutes(leadMinutes)} antes y a la hora de la cita. Después te preguntaremos si asististe.`
                : 'Te avisaremos antes y a la hora de la cita. Después te preguntaremos si asististe.'}
          </Text>
        </View>

        {showErrors && Object.values(validate(form, appointment, ownerTimeZone)).some(Boolean) ? (
          <Text style={[styles.formError, { color: ERROR_COLOR }]} accessibilityLiveRegion="polite">
            Revisa los campos marcados.
          </Text>
        ) : null}
      </FormSheet>

      <LeafletMapModal
        visible={mapVisible}
        onClose={() => setMapVisible(false)}
        onConfirm={(address) => update({ location: address.slice(0, LOCATION_MAX) })}
        theme={theme}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  row: { flexDirection: 'row', gap: 10 },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12 },
  selectorText: { flex: 1, fontSize: 15.5 },
  mapButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12 },
  infoText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  formError: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
