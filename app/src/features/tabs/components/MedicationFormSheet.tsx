import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import {
  AppButton,
  ERROR_COLOR,
  FieldShell,
  FormSheet,
  PressableScale,
  SelectField,
  SelectableChip,
  TextField,
  useFieldColors,
} from '../../../shared/ui';
import { ensureAlarmPermissions } from '../../../shared/services/alarm-permissions.service';
import { describeMedication, findDuplicateMedication } from '../utils/duplicates';
import { isForeignTimeZone, zonedParts, zonedToDate } from '../../../shared/services/dose-schedule';
import { getStoredSession } from '../../auth';
import * as medicationsAPI from '../services/medications.service';
import type { MedicationData } from '../services/medications.service';
import {
  CUSTOM_INTERVAL_MAX,
  CUSTOM_INTERVAL_MIN,
  DOSAGE_UNITS,
  FREQUENCY_OPTIONS,
  calculateDailyTimes,
  formatTime,
  parseDosage,
  timeToDate,
  type DosageUnit,
} from '../utils/medication-form';

const CUSTOM = 'custom';
const NAME_MAX = 100;
const NOTES_MAX = 500;
const UNIT_OPTIONS = DOSAGE_UNITS.map((unit) => ({ value: unit, label: unit }));

type FormState = {
  name: string;
  dosageAmount: string;
  dosageUnit: DosageUnit;
  frequency: string; // valor de FREQUENCY_OPTIONS o CUSTOM
  customInterval: number;
  firstDoseTime: string;
  hasEndDate: boolean;
  endDate: Date | null;
  notes: string;
};

type FormErrors = Partial<Record<'name' | 'dosage' | 'firstDoseTime' | 'endDate', string>>;

const emptyForm = (): FormState => ({
  name: '',
  dosageAmount: '',
  dosageUnit: 'mg',
  frequency: '',
  customInterval: 6,
  firstDoseTime: '',
  hasEndDate: false,
  endDate: null,
  notes: '',
});

const formFromMedication = (medication: MedicationData, timeZone?: string | null): FormState => {
  const { amount, unit } = parseDosage(medication.dosage);
  const known = FREQUENCY_OPTIONS.some((option) => option.value === medication.frequency);
  let endDate = medication.customEndDate ? new Date(medication.customEndDate) : null;
  // El último día del tratamiento es un día del calendario del dueño.
  if (endDate && isForeignTimeZone(timeZone)) {
    const p = zonedParts(endDate, timeZone);
    endDate = new Date(p.year, p.month - 1, p.day);
  }
  return {
    name: medication.name,
    dosageAmount: amount,
    dosageUnit: unit,
    frequency: known ? medication.frequency : CUSTOM,
    customInterval: medication.customIntervalHours ?? 6,
    firstDoseTime: medication.firstDoseTime || medication.times?.[0] || '',
    hasEndDate: Boolean(endDate),
    endDate,
    notes: medication.notes ?? '',
  };
};

const intervalFor = (form: FormState) =>
  form.frequency === CUSTOM
    ? form.customInterval
    : (FREQUENCY_OPTIONS.find((option) => option.value === form.frequency)?.hours ?? 0);

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = 'Escribe el nombre del medicamento.';
  const amount = Number(form.dosageAmount.replace(',', '.'));
  if (!form.dosageAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
    errors.dosage = 'Indica una cantidad válida.';
  }
  if (!form.firstDoseTime) errors.firstDoseTime = 'Elige la hora de la primera toma.';
  if (form.hasEndDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!form.endDate) errors.endDate = 'Elige la fecha de fin.';
    else if (form.endDate.getTime() < today.getTime()) errors.endDate = 'La fecha de fin ya pasó.';
  }
  return errors;
}

/**
 * Solo lo que cambió: al editar lo de otra persona, cada parte requiere su
 * propio permiso (ficha vs. horarios), así que no se reenvía lo intacto.
 */
function changedFields(
  original: MedicationData,
  next: Partial<medicationsAPI.CreateMedicationPayload>,
): Partial<medicationsAPI.CreateMedicationPayload> {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const sameDate = (a?: string | null, b?: string | null) =>
    (a ? new Date(a).toDateString() : null) === (b ? new Date(b).toDateString() : null);
  const changes: Partial<medicationsAPI.CreateMedicationPayload> = {};
  if (!same(original.name, next.name)) changes.name = next.name;
  if (!same(original.dosage, next.dosage)) changes.dosage = next.dosage;
  if (!same(original.notes ?? '', next.notes ?? '')) changes.notes = next.notes;
  const scheduleChanged =
    !same(original.frequency, next.frequency)
    || !same(original.firstDoseTime ?? original.times?.[0], next.firstDoseTime)
    || !same([...(original.times ?? [])].sort(), [...(next.times ?? [])].sort())
    || !same(original.customIntervalHours ?? null, next.customIntervalHours ?? null)
    || !sameDate(original.customEndDate, next.customEndDate);
  if (scheduleChanged) {
    Object.assign(changes, {
      frequency: next.frequency,
      firstDoseTime: next.firstDoseTime,
      times: next.times,
      customIntervalHours: next.customIntervalHours,
      customEndDate: next.customEndDate,
    });
  }
  return changes;
}

export type MedicationFormSheetProps = {
  theme: AppTheme;
  visible: boolean;
  medication?: MedicationData | null;
  onClose: () => void;
  onSaved: (medication: MedicationData, isNew: boolean) => void;
  /** Medicamento de otra persona del Círculo. */
  ownerId?: string;
  /** Al editar lo de otra persona: qué partes permite cambiar. */
  canEditDetails?: boolean;
  canEditSchedule?: boolean;
  /** Si el dueño está en otra zona horaria: aviso de que las horas son las suyas. */
  timeZoneNote?: string;
  /** Zona horaria del dueño (otra persona): el fin del tratamiento es su día. */
  ownerTimeZone?: string | null;
  /** Medicamentos actuales del dueño, para avisar si se repite uno. */
  existingMedications?: MedicationData[];
};

export function MedicationFormSheet({
  theme,
  visible,
  medication,
  onClose,
  onSaved,
  ownerId,
  canEditDetails = true,
  canEditSchedule = true,
  timeZoneNote,
  ownerTimeZone,
  existingMedications = [],
}: Readonly<MedicationFormSheetProps>) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showErrors, setShowErrors] = useState(false);
  const [frequencyError, setFrequencyError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [iosPicker, setIosPicker] = useState<'time' | 'date' | null>(null);
  const isEditing = Boolean(medication);
  // Crear incluye ficha y horarios; al editar, cada parte tiene su permiso.
  const detailsLocked = isEditing && !canEditDetails;
  const scheduleLocked = isEditing && !canEditSchedule;

  useEffect(() => {
    if (!visible) return;
    setForm(medication ? formFromMedication(medication, ownerTimeZone) : emptyForm());
    setShowErrors(false);
    setFrequencyError(false);
    setIosPicker(null);
  }, [visible, medication]);

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  const errors = showErrors ? validate(form) : {};
  const interval = intervalFor(form);
  const previewTimes = useMemo(
    () => (form.firstDoseTime && interval ? calculateDailyTimes(form.firstDoseTime, interval) : []),
    [form.firstDoseTime, interval],
  );

  const timeColors = useFieldColors(theme, iosPicker === 'time', Boolean(errors.firstDoseTime));
  const dateColors = useFieldColors(theme, iosPicker === 'date', Boolean(errors.endDate));

  const openTimePicker = () => {
    const value = form.firstDoseTime ? timeToDate(form.firstDoseTime) : timeToDate('08:00');
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'time',
        is24Hour: true,
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) update({ firstDoseTime: formatTime(selected) });
        },
      });
    } else {
      if (!form.firstDoseTime) update({ firstDoseTime: formatTime(value) });
      setIosPicker((current) => (current === 'time' ? null : 'time'));
    }
  };

  const openDatePicker = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7);
    const value = form.endDate ?? tomorrow;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) update({ endDate: selected });
        },
      });
    } else {
      if (!form.endDate) update({ endDate: value });
      setIosPicker((current) => (current === 'date' ? null : 'date'));
    }
  };

  const handleSave = async (confirmedDuplicate = false) => {
    setShowErrors(true);
    const currentErrors = validate(form);
    const missingFrequency = !form.frequency;
    setFrequencyError(missingFrequency);
    if (Object.values(currentErrors).some(Boolean) || missingFrequency) return;

    // Mismo medicamento ya activo (p. ej. lo agregó otra persona del Círculo):
    // dos registros harían sonar dos alarmas por la misma toma.
    const nameChanged = !medication || medication.name.trim() !== form.name.trim();
    const duplicate = !confirmedDuplicate && nameChanged
      ? findDuplicateMedication(form.name, existingMedications, medication?.id)
      : null;
    if (duplicate) {
      Alert.alert(
        'Este medicamento ya está registrado',
        `Ya existe ${describeMedication(duplicate)}. Si es el mismo, edita ese en lugar de agregarlo otra vez, para que no suenen dos alarmas.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Es otro, guardar', onPress: () => void handleSave(true) },
        ],
      );
      return;
    }

    // Las alarmas solo funcionan con los permisos concedidos. Si el
    // medicamento es de otra persona, suenan en su teléfono, no en este.
    const willBeActive = medication ? medication.active : true;
    if (willBeActive && !ownerId) {
      const { ready } = await ensureAlarmPermissions();
      if (!ready) {
        Alert.alert(
          'Permisos incompletos',
          'Sin los permisos de notificaciones y alarmas no podremos avisarte a la hora de cada toma.',
        );
        return;
      }
    }

    const session = await getStoredSession();
    if (!session?.accessToken) {
      Alert.alert('Sesión expirada', 'Vuelve a iniciar sesión para continuar.');
      return;
    }

    const isCustom = form.frequency === CUSTOM;
    let endDate = form.hasEndDate && form.endDate ? new Date(form.endDate) : null;
    if (endDate && isForeignTimeZone(ownerTimeZone)) {
      endDate = zonedToDate(endDate.getFullYear(), endDate.getMonth() + 1, endDate.getDate(), 23, 59, ownerTimeZone);
    } else {
      endDate?.setHours(23, 59, 0, 0);
    }
    const payload = {
      name: form.name.trim(),
      dosage: `${form.dosageAmount.trim().replace(',', '.')} ${form.dosageUnit}`,
      frequency: isCustom ? `Cada ${form.customInterval} horas` : form.frequency,
      firstDoseTime: form.firstDoseTime,
      times: previewTimes,
      notes: form.notes.trim() || undefined,
      customIntervalHours: isCustom ? form.customInterval : null,
      customEndDate: endDate ? endDate.toISOString() : null,
    };

    try {
      setIsSaving(true);
      let saved: MedicationData;
      if (medication) {
        const changes = ownerId
          ? changedFields(medication, { ...payload, notes: form.notes.trim() })
          : { ...payload, notes: form.notes.trim() };
        if (!Object.keys(changes).length) {
          onClose();
          return;
        }
        saved = await medicationsAPI.updateMedication(medication.id, session.accessToken, changes, ownerId);
      } else {
        saved = await medicationsAPI.createMedication(session.accessToken, payload, ownerId);
      }
      onSaved(saved, !medication);
      onClose();
    } catch (error) {
      Alert.alert(
        'No se pudo guardar',
        error instanceof Error ? error.message : 'Inténtalo de nuevo en unos momentos.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title={isEditing ? 'Editar medicamento' : 'Nuevo medicamento'}
      subtitle={isEditing ? undefined : 'Te avisaremos a la hora de cada toma.'}
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
      {detailsLocked || scheduleLocked ? (
        <View style={[styles.preview, { backgroundColor: `${theme.colors.accentTertiary}14` }]}>
          <Ionicons name="lock-closed-outline" size={16} color={theme.colors.accentTertiary} />
          <Text style={[styles.previewText, { color: theme.colors.textSecondary }]}>
            {detailsLocked
              ? 'Solo puedes cambiar los horarios y recordatorios de este medicamento.'
              : 'Solo puedes cambiar el nombre, la dosis y las notas. Los horarios no.'}
          </Text>
        </View>
      ) : null}

      <View pointerEvents={detailsLocked ? 'none' : 'auto'} style={[styles.group, detailsLocked && styles.locked]}>
        <TextField
          theme={theme}
          label="Nombre"
          editable={!detailsLocked}
          value={form.name}
          error={errors.name}
          onChangeText={(name) => update({ name })}
          placeholder="Ej. Paracetamol"
          maxLength={NAME_MAX}
          autoCapitalize="sentences"
          returnKeyType="next"
        />

        <FieldShell theme={theme} label="Dosis" error={errors.dosage}>
          <View style={styles.dosageRow}>
            <View style={styles.flex}>
              <TextField
                theme={theme}
                label=""
                value={form.dosageAmount}
                invalid={Boolean(errors.dosage)}
                onChangeText={(dosageAmount) => update({ dosageAmount: dosageAmount.replace(/[^\d.,]/g, '').slice(0, 8) })}
                placeholder="Ej. 500"
                keyboardType="decimal-pad"
                accessibilityLabel="Cantidad de la dosis"
              />
            </View>
            <SelectField
              theme={theme}
              value={form.dosageUnit}
              options={UNIT_OPTIONS}
              onChange={(dosageUnit) => update({ dosageUnit })}
              accessibilityLabel="Unidad de la dosis"
              style={styles.unitSelect}
            />
          </View>
        </FieldShell>

      </View>

      {timeZoneNote ? (
        <View style={[styles.preview, { backgroundColor: `${theme.colors.accentSecondary}14` }]}>
          <Ionicons name="earth-outline" size={16} color={theme.colors.accentSecondary} />
          <Text style={[styles.previewText, { color: theme.colors.textSecondary }]}>{timeZoneNote}</Text>
        </View>
      ) : null}

      <View pointerEvents={scheduleLocked ? 'none' : 'auto'} style={[styles.group, scheduleLocked && styles.locked]}>
        <FieldShell
          theme={theme}
          label="Frecuencia"
          error={frequencyError && !form.frequency ? 'Elige cada cuánto se toma.' : null}
        >
          <View style={styles.chipsWrap}>
            {FREQUENCY_OPTIONS.map((option) => (
              <SelectableChip
                key={option.value}
                theme={theme}
                label={option.label}
                selected={form.frequency === option.value}
                onPress={() => update({ frequency: option.value })}
              />
            ))}
            <SelectableChip
              theme={theme}
              label="Personalizada"
              selected={form.frequency === CUSTOM}
              onPress={() => update({ frequency: CUSTOM })}
            />
          </View>
          {form.frequency === CUSTOM ? (
            <View style={[styles.stepper, { borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.inputBackground }]}>
              <Text style={[styles.stepperLabel, { color: theme.colors.textSecondary }]}>Cada</Text>
              <StepperButton
                theme={theme}
                icon="remove"
                label="Menos horas"
                disabled={form.customInterval <= CUSTOM_INTERVAL_MIN}
                onPress={() => update({ customInterval: Math.max(CUSTOM_INTERVAL_MIN, form.customInterval - 1) })}
              />
              <Text style={[styles.stepperValue, { color: theme.colors.textPrimary }]} accessibilityLiveRegion="polite">
                {form.customInterval} h
              </Text>
              <StepperButton
                theme={theme}
                icon="add"
                label="Más horas"
                disabled={form.customInterval >= CUSTOM_INTERVAL_MAX}
                onPress={() => update({ customInterval: Math.min(CUSTOM_INTERVAL_MAX, form.customInterval + 1) })}
              />
            </View>
          ) : null}
        </FieldShell>

        <FieldShell theme={theme} label="Primera toma" error={errors.firstDoseTime}>
          <PressableScale
            pressedScale={0.98}
            onPress={openTimePicker}
            accessibilityRole="button"
            accessibilityLabel={form.firstDoseTime ? `Primera toma a las ${form.firstDoseTime}. Toca para cambiar.` : 'Elegir hora de la primera toma'}
            style={[styles.selector, timeColors]}
          >
            <Ionicons name="time-outline" size={20} color={theme.colors.accentSecondary} />
            <Text style={[styles.selectorText, { color: form.firstDoseTime ? theme.colors.textPrimary : theme.colors.inputPlaceholder }]}>
              {form.firstDoseTime || 'Elegir hora'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
          </PressableScale>
          {Platform.OS === 'ios' && iosPicker === 'time' ? (
            <DateTimePicker
              value={timeToDate(form.firstDoseTime || '08:00')}
              mode="time"
              display="spinner"
              is24Hour
              locale="es-ES"
              themeVariant={theme.mode}
              onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                if (selected) update({ firstDoseTime: formatTime(selected) });
              }}
            />
          ) : null}
          {previewTimes.length ? (
            <View style={[styles.preview, { backgroundColor: `${theme.colors.accentPrimary}12` }]}>
              <Ionicons name="alarm-outline" size={16} color={theme.colors.accentPrimary} />
              <Text style={[styles.previewText, { color: theme.colors.textSecondary }]}>
                Sonará a diario a las{' '}
                <Text style={{ color: theme.colors.textPrimary, fontWeight: '800' }}>{previewTimes.join(' · ')}</Text>
              </Text>
            </View>
          ) : null}
        </FieldShell>

        <FieldShell theme={theme} label="Duración" error={errors.endDate}>
          <View style={styles.chipsWrap}>
            <SelectableChip theme={theme} label="Sin fecha de fin" selected={!form.hasEndDate} onPress={() => { update({ hasEndDate: false }); setIosPicker(null); }} />
            <SelectableChip theme={theme} label="Hasta una fecha" selected={form.hasEndDate} onPress={() => { update({ hasEndDate: true }); if (!form.endDate) openDatePicker(); }} />
          </View>
          {form.hasEndDate ? (
            <PressableScale
              pressedScale={0.98}
              onPress={openDatePicker}
              accessibilityRole="button"
              accessibilityLabel="Elegir fecha de fin del tratamiento"
              style={[styles.selector, dateColors]}
            >
              <Ionicons name="calendar-outline" size={20} color={theme.colors.accentSecondary} />
              <Text style={[styles.selectorText, { color: form.endDate ? theme.colors.textPrimary : theme.colors.inputPlaceholder }]}>
                {form.endDate
                  ? `Hasta el ${form.endDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : 'Elegir fecha'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
            </PressableScale>
          ) : null}
          {Platform.OS === 'ios' && iosPicker === 'date' && form.hasEndDate ? (
            <DateTimePicker
              value={form.endDate ?? new Date()}
              mode="date"
              display="inline"
              minimumDate={new Date()}
              locale="es-ES"
              themeVariant={theme.mode}
              onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                if (selected) update({ endDate: selected });
              }}
            />
          ) : null}
        </FieldShell>

      </View>

      <TextField
        theme={theme}
        label="Notas"
        editable={!detailsLocked}
        optional
        value={form.notes}
        onChangeText={(notes) => update({ notes })}
        placeholder="Ej. Tomar con comida"
        maxLength={NOTES_MAX}
        multiline
        textAlignVertical="top"
      />

      {showErrors && Object.values(validate(form)).some(Boolean) ? (
        <Text style={[styles.formError, { color: ERROR_COLOR }]} accessibilityLiveRegion="polite">
          Revisa los campos marcados.
        </Text>
      ) : null}
    </FormSheet>
  );
}

function StepperButton({
  theme,
  icon,
  label,
  disabled,
  onPress,
}: Readonly<{ theme: AppTheme; icon: 'add' | 'remove'; label: string; disabled: boolean; onPress: () => void }>) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.stepperButton, { backgroundColor: `${theme.colors.accentPrimary}${disabled ? '0D' : '1F'}` }]}
    >
      <Ionicons name={icon} size={20} color={disabled ? theme.colors.textMuted : theme.colors.accentPrimary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  dosageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  unitSelect: { width: 140 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 8, paddingLeft: 14 },
  stepperLabel: { fontSize: 15, fontWeight: '600' },
  stepperButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14 },
  selectorText: { flex: 1, fontSize: 16 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  previewText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  formError: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  group: { gap: 20 },
  locked: { opacity: 0.5 },
});
