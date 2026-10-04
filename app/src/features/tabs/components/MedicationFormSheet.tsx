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
import {
  fromDayKey,
  isForeignTimeZone,
  toDayKey,
  zonedParts,
  zonedToDate,
  type ScheduleType,
} from '../../../shared/services/dose-schedule';
import { getStoredSession } from '../../auth';
import * as medicationsAPI from '../services/medications.service';
import type { MedicationData } from '../services/medications.service';
import {
  AS_NEEDED_FREQUENCY,
  CUSTOM_INTERVAL_MAX,
  CUSTOM_INTERVAL_MIN,
  DAY_INTERVAL_MAX,
  DAY_INTERVAL_MIN,
  DOSAGE_UNITS,
  FREQUENCY_OPTIONS,
  WEEK_DAYS,
  calculateDailyTimes,
  defaultStockAlert,
  defaultStockPerDose,
  formatQuantity,
  formatTime,
  parseDosage,
  stepsEndDate,
  stockUnitLabel,
  timeToDate,
  weekDaysLabel,
  type DosageUnit,
} from '../utils/medication-form';

const CUSTOM = 'custom';
const NAME_MAX = 100;
const NOTES_MAX = 500;
const UNIT_OPTIONS = DOSAGE_UNITS.map((unit) => ({ value: unit, label: unit }));
const STEP_DAYS_MAX = 90;
const STEPS_MAX = 10;
const MAX_DAILY_LIMIT = 12;
const MIN_HOURS_LIMIT = 24;

const SCHEDULE_OPTIONS: { value: ScheduleType; label: string }[] = [
  { value: 'DAILY', label: 'Todos los días' },
  { value: 'WEEKDAYS', label: 'Algunos días' },
  { value: 'INTERVAL', label: 'Cada varios días' },
  { value: 'AS_NEEDED', label: 'Según necesidad' },
];

type DoseStepForm = { amount: string; days: number };

type FormState = {
  name: string;
  dosageAmount: string;
  dosageUnit: DosageUnit;
  scheduleType: ScheduleType;
  weekDays: number[];
  dayInterval: number;
  /** Primer día (cada varios días y dosis que cambia). */
  startDate: Date;
  frequency: string; // valor de FREQUENCY_OPTIONS o CUSTOM
  customInterval: number;
  firstDoseTime: string;
  /** Según necesidad: 0 = sin límite / sin mínimo. */
  maxDailyDoses: number;
  minHoursBetween: number;
  tapering: boolean;
  steps: DoseStepForm[];
  hasEndDate: boolean;
  endDate: Date | null;
  trackStock: boolean;
  stockQuantity: string;
  stockPerDose: string;
  stockAlertAt: string;
  notes: string;
};

type FormErrors = Partial<
  Record<'name' | 'dosage' | 'weekDays' | 'firstDoseTime' | 'steps' | 'endDate' | 'stockQuantity' | 'stockPerDose' | 'stockAlertAt', string>
>;

const today = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const emptyForm = (): FormState => ({
  name: '',
  dosageAmount: '',
  dosageUnit: 'mg',
  scheduleType: 'DAILY',
  weekDays: [],
  dayInterval: 2,
  startDate: today(),
  frequency: '',
  customInterval: 6,
  firstDoseTime: '',
  maxDailyDoses: 0,
  minHoursBetween: 0,
  tapering: false,
  steps: [],
  hasEndDate: false,
  endDate: null,
  trackStock: false,
  stockQuantity: '',
  stockPerDose: '',
  stockAlertAt: '',
  notes: '',
});

const toNumber = (value: string) => Number(value.trim().replace(',', '.'));
const isPositive = (value: string) => value.trim() !== '' && Number.isFinite(toNumber(value)) && toNumber(value) > 0;
const isNonNegative = (value: string) => value.trim() !== '' && Number.isFinite(toNumber(value)) && toNumber(value) >= 0;
const cleanNumber = (value: string) => value.replace(/[^\d.,]/g, '').slice(0, 8);

const formFromMedication = (medication: MedicationData, timeZone?: string | null): FormState => {
  const { amount, unit } = parseDosage(medication.dosage);
  const known = FREQUENCY_OPTIONS.some((option) => option.value === medication.frequency);
  let endDate = medication.customEndDate ? new Date(medication.customEndDate) : null;
  // El último día del tratamiento es un día del calendario del dueño.
  if (endDate && isForeignTimeZone(timeZone)) {
    const p = zonedParts(endDate, timeZone);
    endDate = new Date(p.year, p.month - 1, p.day);
  }
  const scheduleType = medication.scheduleType ?? 'DAILY';
  const steps = (medication.dosageSteps ?? []).map((step) => ({ amount: parseDosage(step.dosage).amount, days: step.days }));
  const stockTracked = medication.stockQuantity != null;
  return {
    name: medication.name,
    dosageAmount: amount,
    dosageUnit: unit,
    scheduleType,
    weekDays: medication.weekDays ?? [],
    dayInterval: medication.dayInterval && medication.dayInterval >= DAY_INTERVAL_MIN ? medication.dayInterval : 2,
    startDate: (medication.startDate && fromDayKey(medication.startDate)) || today(),
    frequency: scheduleType === 'AS_NEEDED' ? '' : known ? medication.frequency : CUSTOM,
    customInterval: medication.customIntervalHours ?? 6,
    firstDoseTime: medication.firstDoseTime || medication.times?.[0] || '',
    maxDailyDoses: medication.maxDailyDoses ?? 0,
    minHoursBetween: medication.minHoursBetween ?? 0,
    tapering: steps.length > 0,
    steps,
    hasEndDate: Boolean(endDate),
    endDate,
    trackStock: stockTracked,
    stockQuantity: stockTracked ? formatQuantity(medication.stockQuantity!) : '',
    stockPerDose: stockTracked ? formatQuantity(medication.stockPerDose ?? 1) : '',
    stockAlertAt: stockTracked && medication.stockAlertAt != null ? formatQuantity(medication.stockAlertAt) : '',
    notes: medication.notes ?? '',
  };
};

/** Medicamento preparado por el asistente: se abre como nuevo, ya rellenado. */
export type MedicationDraft = {
  name: string;
  dosageAmount: number;
  dosageUnit: string;
  intervalHours: number;
  firstDoseTime: string;
  durationDays: number | null;
  notes: string | null;
};

const formFromDraft = (draft: MedicationDraft): FormState => {
  const option = FREQUENCY_OPTIONS.find((item) => item.hours === draft.intervalHours);
  const unit = DOSAGE_UNITS.find((item) => item.toLowerCase() === draft.dosageUnit.toLowerCase()) ?? 'mg';
  let endDate: Date | null = null;
  if (draft.durationDays) {
    endDate = today();
    endDate.setDate(endDate.getDate() + draft.durationDays - 1);
  }
  return {
    ...emptyForm(),
    name: draft.name,
    dosageAmount: formatQuantity(draft.dosageAmount),
    dosageUnit: unit,
    frequency: option ? option.value : CUSTOM,
    customInterval: Math.min(CUSTOM_INTERVAL_MAX, Math.max(CUSTOM_INTERVAL_MIN, draft.intervalHours)),
    firstDoseTime: draft.firstDoseTime,
    hasEndDate: Boolean(endDate),
    endDate,
    notes: draft.notes ?? '',
  };
};

const intervalFor = (form: FormState) =>
  form.frequency === CUSTOM
    ? form.customInterval
    : (FREQUENCY_OPTIONS.find((option) => option.value === form.frequency)?.hours ?? 0);

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  const asNeeded = form.scheduleType === 'AS_NEEDED';
  const tapering = form.tapering && !asNeeded;
  if (!form.name.trim()) errors.name = 'Escribe el nombre del medicamento.';
  if (!tapering && !isPositive(form.dosageAmount)) errors.dosage = 'Indica una cantidad válida.';
  if (form.scheduleType === 'WEEKDAYS' && !form.weekDays.length) errors.weekDays = 'Elige al menos un día.';
  if (!asNeeded && !form.firstDoseTime) errors.firstDoseTime = 'Elige la hora de la primera toma.';
  if (tapering && (!form.steps.length || form.steps.some((step) => !isPositive(step.amount)))) {
    errors.steps = 'Indica la dosis de cada etapa.';
  }
  if (form.hasEndDate && !tapering) {
    if (!form.endDate) errors.endDate = 'Elige la fecha de fin.';
    else if (form.endDate.getTime() < today().getTime()) errors.endDate = 'La fecha de fin ya pasó.';
    else if (form.endDate.getTime() < form.startDate.getTime() && (form.scheduleType === 'INTERVAL')) {
      errors.endDate = 'La fecha de fin es anterior al inicio.';
    }
  }
  if (form.trackStock) {
    if (!isNonNegative(form.stockQuantity)) errors.stockQuantity = 'Indica cuántas tienes.';
    if (!isPositive(form.stockPerDose)) errors.stockPerDose = 'Indica cuántas usas por toma.';
    if (form.stockAlertAt.trim() && !isNonNegative(form.stockAlertAt)) errors.stockAlertAt = 'Indica una cantidad válida.';
  }
  return errors;
}

const SCHEDULE_KEYS = [
  'frequency',
  'firstDoseTime',
  'times',
  'customIntervalHours',
  'customEndDate',
  'scheduleType',
  'weekDays',
  'dayInterval',
  'startDate',
  'dosageSteps',
  'maxDailyDoses',
  'minHoursBetween',
] as const;
const DETAIL_KEYS = ['name', 'dosage', 'notes', 'stockQuantity', 'stockPerDose', 'stockAlertAt'] as const;

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
  const changes: Record<string, unknown> = {};
  for (const key of DETAIL_KEYS) {
    const before = key === 'notes' ? original.notes ?? '' : original[key];
    const after = key === 'notes' ? next.notes ?? '' : next[key];
    if (!same(before, after)) changes[key] = next[key];
  }
  const scheduleChanged = SCHEDULE_KEYS.some((key) => {
    if (key === 'customEndDate') return !sameDate(original.customEndDate, next.customEndDate);
    if (key === 'firstDoseTime') return !same(original.firstDoseTime ?? original.times?.[0], next.firstDoseTime);
    if (key === 'times') return !same([...(original.times ?? [])].sort(), [...(next.times ?? [])].sort());
    if (key === 'scheduleType') return !same(original.scheduleType ?? 'DAILY', next.scheduleType ?? 'DAILY');
    if (key === 'weekDays') return !same([...(original.weekDays ?? [])].sort(), [...(next.weekDays ?? [])].sort());
    return !same(original[key], next[key]);
  });
  if (scheduleChanged) {
    for (const key of SCHEDULE_KEYS) changes[key] = next[key];
  }
  return changes as Partial<medicationsAPI.CreateMedicationPayload>;
}

const longDate = (date: Date) => date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (date: Date) => date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

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
  /** Nuevo medicamento ya rellenado (p. ej. preparado por el asistente). */
  draft?: MedicationDraft | null;
};

type PickerTarget = 'time' | 'date' | 'start';

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
  draft,
}: Readonly<MedicationFormSheetProps>) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showErrors, setShowErrors] = useState(false);
  const [frequencyError, setFrequencyError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [iosPicker, setIosPicker] = useState<PickerTarget | null>(null);
  const isEditing = Boolean(medication);
  // Crear incluye ficha y horarios; al editar, cada parte tiene su permiso.
  const detailsLocked = isEditing && !canEditDetails;
  const scheduleLocked = isEditing && !canEditSchedule;

  useEffect(() => {
    if (!visible) return;
    if (medication) setForm(formFromMedication(medication, ownerTimeZone));
    else setForm(draft ? formFromDraft(draft) : emptyForm());
    setShowErrors(false);
    setFrequencyError(false);
    setIosPicker(null);
  }, [visible, medication]);

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  const errors = showErrors ? validate(form) : {};
  const asNeeded = form.scheduleType === 'AS_NEEDED';
  const tapering = form.tapering && !asNeeded;
  const interval = intervalFor(form);
  const previewTimes = useMemo(
    () => (!asNeeded && form.firstDoseTime && interval ? calculateDailyTimes(form.firstDoseTime, interval) : []),
    [asNeeded, form.firstDoseTime, interval],
  );
  const usesStartDate = form.scheduleType === 'INTERVAL' || tapering;
  const taperEnd = tapering && form.steps.length ? stepsEndDate(form.startDate, form.steps) : null;

  // Dosis que se cuenta en las existencias (la de hoy o la primera etapa).
  const referenceDosage = `${(tapering ? form.steps[0]?.amount : form.dosageAmount) || '1'} ${form.dosageUnit}`;
  const stockUnit = stockUnitLabel(referenceDosage);
  const dosesPerDay = asNeeded ? form.maxDailyDoses || 3 : previewTimes.length || 1;

  const timeColors = useFieldColors(theme, iosPicker === 'time', Boolean(errors.firstDoseTime));
  const dateColors = useFieldColors(theme, iosPicker === 'date', Boolean(errors.endDate));
  const startColors = useFieldColors(theme, iosPicker === 'start', false);

  const setScheduleType = (scheduleType: ScheduleType) => {
    const patch: Partial<FormState> = { scheduleType };
    // Al pasar a "algunos días", de lunes a viernes como punto de partida.
    if (scheduleType === 'WEEKDAYS' && !form.weekDays.length) patch.weekDays = [1, 2, 3, 4, 5];
    update(patch);
    setFrequencyError(false);
  };

  const toggleWeekDay = (day: number) =>
    update({ weekDays: form.weekDays.includes(day) ? form.weekDays.filter((item) => item !== day) : [...form.weekDays, day] });

  const setTapering = (value: boolean) => {
    if (value && !form.steps.length) {
      const first = form.dosageAmount || '';
      update({ tapering: true, steps: [{ amount: first, days: 7 }, { amount: '', days: 7 }], hasEndDate: false });
    } else {
      update({ tapering: value });
    }
  };

  const updateStep = (index: number, patch: Partial<DoseStepForm>) =>
    update({ steps: form.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)) });

  const setTrackStock = (value: boolean) => {
    if (value && !form.stockPerDose) {
      const perDose = defaultStockPerDose(referenceDosage);
      update({
        trackStock: true,
        stockPerDose: formatQuantity(perDose),
        stockAlertAt: form.stockAlertAt || String(defaultStockAlert(perDose, dosesPerDay)),
      });
    } else {
      update({ trackStock: value });
    }
  };

  const stockEstimate = useMemo(() => {
    if (!form.trackStock || !isNonNegative(form.stockQuantity) || !isPositive(form.stockPerDose) || asNeeded) return null;
    let daysPerWeek = 7;
    if (form.scheduleType === 'WEEKDAYS') daysPerWeek = form.weekDays.length || 7;
    else if (form.scheduleType === 'INTERVAL') daysPerWeek = 7 / form.dayInterval;
    const perDay = (toNumber(form.stockPerDose) * dosesPerDay * daysPerWeek) / 7;
    return perDay > 0 ? Math.floor(toNumber(form.stockQuantity) / perDay) : null;
  }, [form, asNeeded, dosesPerDay]);

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

  const openDatePicker = (target: 'date' | 'start') => {
    const inAWeek = new Date();
    inAWeek.setDate(inAWeek.getDate() + 7);
    const value = target === 'start' ? form.startDate : form.endDate ?? inAWeek;
    const apply = (selected: Date) => {
      selected.setHours(0, 0, 0, 0);
      update(target === 'start' ? { startDate: selected } : { endDate: selected });
    };
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate: target === 'start' ? undefined : new Date(),
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) apply(selected);
        },
      });
    } else {
      if (target === 'date' && !form.endDate) update({ endDate: value });
      setIosPicker((current) => (current === target ? null : target));
    }
  };

  const handleSave = async (confirmedDuplicate = false) => {
    setShowErrors(true);
    const currentErrors = validate(form);
    const missingFrequency = !asNeeded && !form.frequency;
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
    if (willBeActive && !ownerId && !asNeeded) {
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
    // Con dosis que cambia, el tratamiento termina con la última etapa.
    const lastDay = taperEnd ?? (form.hasEndDate && form.endDate ? new Date(form.endDate) : null);
    let endDate = lastDay;
    if (endDate && isForeignTimeZone(ownerTimeZone)) {
      endDate = zonedToDate(endDate.getFullYear(), endDate.getMonth() + 1, endDate.getDate(), 23, 59, ownerTimeZone);
    } else {
      endDate?.setHours(23, 59, 0, 0);
    }
    const dosageOf = (amount: string) => `${amount.trim().replace(',', '.')} ${form.dosageUnit}`;
    let frequency = isCustom ? `Cada ${form.customInterval} horas` : form.frequency;
    if (asNeeded) frequency = AS_NEEDED_FREQUENCY;
    const payload: medicationsAPI.CreateMedicationPayload = {
      name: form.name.trim(),
      dosage: dosageOf(tapering ? form.steps[0].amount : form.dosageAmount),
      frequency,
      firstDoseTime: asNeeded ? undefined : form.firstDoseTime,
      times: asNeeded ? [] : previewTimes,
      notes: form.notes.trim() || undefined,
      customIntervalHours: isCustom && !asNeeded ? form.customInterval : null,
      customEndDate: endDate ? endDate.toISOString() : null,
      scheduleType: form.scheduleType,
      weekDays: form.scheduleType === 'WEEKDAYS' ? [...form.weekDays].sort() : [],
      dayInterval: form.scheduleType === 'INTERVAL' ? form.dayInterval : null,
      startDate: usesStartDate ? toDayKey(form.startDate) : null,
      dosageSteps: tapering ? form.steps.map((step) => ({ days: step.days, dosage: dosageOf(step.amount) })) : null,
      maxDailyDoses: asNeeded && form.maxDailyDoses ? form.maxDailyDoses : null,
      minHoursBetween: asNeeded && form.minHoursBetween ? form.minHoursBetween : null,
      stockQuantity: form.trackStock ? toNumber(form.stockQuantity) : null,
      stockPerDose: form.trackStock ? toNumber(form.stockPerDose) : null,
      stockAlertAt: form.trackStock && form.stockAlertAt.trim() ? toNumber(form.stockAlertAt) : null,
    };

    try {
      setIsSaving(true);
      let saved: MedicationData;
      if (medication) {
        const changes: Partial<medicationsAPI.CreateMedicationPayload> = ownerId
          ? changedFields(medication, { ...payload, notes: form.notes.trim() })
          : { ...payload, notes: form.notes.trim() };
        // Las existencias bajan con cada toma: si no se tocaron, no se
        // reenvían (una toma registrada mientras se editaba no se pierde).
        if (!ownerId && (medication.stockQuantity ?? null) === payload.stockQuantity) delete changes.stockQuantity;
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

  let previewDays = 'a diario';
  if (form.scheduleType === 'WEEKDAYS' && form.weekDays.length) previewDays = weekDaysLabel(form.weekDays).toLowerCase();
  else if (form.scheduleType === 'INTERVAL') previewDays = `cada ${form.dayInterval} días`;
  if (previewDays === 'todos los días') previewDays = 'a diario';
  else if (form.scheduleType === 'WEEKDAYS' && !previewDays.startsWith('de ')) previewDays = `los ${previewDays}`;

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
        <Note theme={theme} icon="lock-closed-outline" color={theme.colors.accentTertiary}>
          {detailsLocked
            ? 'Solo puedes cambiar los horarios y recordatorios de este medicamento.'
            : 'Solo puedes cambiar el nombre, la dosis, las existencias y las notas. Los horarios no.'}
        </Note>
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

        <FieldShell
          theme={theme}
          label="Dosis"
          error={errors.dosage}
          helper={tapering ? 'La dosis de cada etapa se indica más abajo, en "La dosis va cambiando".' : undefined}
        >
          <View style={styles.dosageRow}>
            {tapering ? null : (
              <View style={styles.flex}>
                <TextField
                  theme={theme}
                  label=""
                  value={form.dosageAmount}
                  invalid={Boolean(errors.dosage)}
                  onChangeText={(dosageAmount) => update({ dosageAmount: cleanNumber(dosageAmount) })}
                  placeholder="Ej. 500"
                  keyboardType="decimal-pad"
                  accessibilityLabel="Cantidad de la dosis"
                />
              </View>
            )}
            <SelectField
              theme={theme}
              value={form.dosageUnit}
              options={UNIT_OPTIONS}
              onChange={(dosageUnit) => update({ dosageUnit })}
              accessibilityLabel="Unidad de la dosis"
              style={tapering ? styles.flex : styles.unitSelect}
            />
          </View>
        </FieldShell>
      </View>

      {timeZoneNote ? (
        <Note theme={theme} icon="earth-outline" color={theme.colors.accentSecondary}>{timeZoneNote}</Note>
      ) : null}

      <View pointerEvents={scheduleLocked ? 'none' : 'auto'} style={[styles.group, scheduleLocked && styles.locked]}>
        <FieldShell theme={theme} label="¿Qué días?" error={errors.weekDays}>
          <View style={styles.chipsWrap}>
            {SCHEDULE_OPTIONS.map((option) => (
              <SelectableChip
                key={option.value}
                theme={theme}
                label={option.label}
                selected={form.scheduleType === option.value}
                onPress={() => setScheduleType(option.value)}
              />
            ))}
          </View>
          {form.scheduleType === 'WEEKDAYS' ? (
            <View style={styles.weekRow} accessibilityRole="none">
              {WEEK_DAYS.map((day) => {
                const selected = form.weekDays.includes(day.value);
                return (
                  <PressableScale
                    key={day.value}
                    onPress={() => toggleWeekDay(day.value)}
                    accessibilityRole="checkbox"
                    accessibilityLabel={day.name}
                    accessibilityState={{ checked: selected }}
                    style={[
                      styles.weekDay,
                      selected
                        ? { backgroundColor: theme.colors.accentPrimary, borderColor: theme.colors.accentPrimary }
                        : { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder },
                    ]}
                  >
                    <Text style={[styles.weekDayText, { color: selected ? '#fff' : theme.colors.textSecondary }]}>{day.short}</Text>
                  </PressableScale>
                );
              })}
            </View>
          ) : null}
          {form.scheduleType === 'INTERVAL' ? (
            <Stepper
              theme={theme}
              label="Cada"
              value={`${form.dayInterval} días`}
              canDecrease={form.dayInterval > DAY_INTERVAL_MIN}
              canIncrease={form.dayInterval < DAY_INTERVAL_MAX}
              onDecrease={() => update({ dayInterval: form.dayInterval - 1 })}
              onIncrease={() => update({ dayInterval: form.dayInterval + 1 })}
              decreaseLabel="Menos días"
              increaseLabel="Más días"
            />
          ) : null}
          {asNeeded ? (
            <>
              <Stepper
                theme={theme}
                label="Máximo al día"
                value={form.maxDailyDoses ? `${form.maxDailyDoses}` : 'Sin límite'}
                canDecrease={form.maxDailyDoses > 0}
                canIncrease={form.maxDailyDoses < MAX_DAILY_LIMIT}
                onDecrease={() => update({ maxDailyDoses: form.maxDailyDoses - 1 })}
                onIncrease={() => update({ maxDailyDoses: form.maxDailyDoses + 1 })}
                decreaseLabel="Menos tomas al día"
                increaseLabel="Más tomas al día"
              />
              <Stepper
                theme={theme}
                label="Entre tomas"
                value={form.minHoursBetween ? `${form.minHoursBetween} h` : 'Sin mínimo'}
                canDecrease={form.minHoursBetween > 0}
                canIncrease={form.minHoursBetween < MIN_HOURS_LIMIT}
                onDecrease={() => update({ minHoursBetween: form.minHoursBetween - 1 })}
                onIncrease={() => update({ minHoursBetween: form.minHoursBetween + 1 })}
                decreaseLabel="Menos horas entre tomas"
                increaseLabel="Más horas entre tomas"
              />
              <Note theme={theme} icon="hand-left-outline" color={theme.colors.accentPrimary}>
                No sonarán alarmas. Registra cada toma desde la tarjeta y te avisaremos si superas el máximo o si
                no ha pasado el tiempo indicado.
              </Note>
            </>
          ) : null}
        </FieldShell>

        {asNeeded ? null : (
          <>
            <FieldShell
              theme={theme}
              label="Veces al día"
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
                <Stepper
                  theme={theme}
                  label="Cada"
                  value={`${form.customInterval} h`}
                  canDecrease={form.customInterval > CUSTOM_INTERVAL_MIN}
                  canIncrease={form.customInterval < CUSTOM_INTERVAL_MAX}
                  onDecrease={() => update({ customInterval: Math.max(CUSTOM_INTERVAL_MIN, form.customInterval - 1) })}
                  onIncrease={() => update({ customInterval: Math.min(CUSTOM_INTERVAL_MAX, form.customInterval + 1) })}
                  decreaseLabel="Menos horas"
                  increaseLabel="Más horas"
                />
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
                <Note theme={theme} icon="alarm-outline" color={theme.colors.accentPrimary}>
                  Sonará {previewDays} a las{' '}
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '800' }}>{previewTimes.join(' · ')}</Text>
                </Note>
              ) : null}
            </FieldShell>

            <FieldShell theme={theme} label="Dosis" error={errors.steps}>
              <View style={styles.chipsWrap}>
                <SelectableChip theme={theme} label="Siempre la misma" selected={!form.tapering} onPress={() => setTapering(false)} />
                <SelectableChip theme={theme} label="La dosis va cambiando" selected={form.tapering} onPress={() => setTapering(true)} />
              </View>
              {tapering ? (
                <View style={styles.steps}>
                  {form.steps.map((step, index) => (
                    <View
                      key={index}
                      style={[styles.stepCard, { borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.inputBackground }]}
                    >
                      <View style={styles.stepHeader}>
                        <Text style={[styles.stepTitle, { color: theme.colors.textPrimary }]}>Etapa {index + 1}</Text>
                        {form.steps.length > 1 ? (
                          <PressableScale
                            onPress={() => update({ steps: form.steps.filter((_, i) => i !== index) })}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Quitar etapa ${index + 1}`}
                          >
                            <Ionicons name="close-circle" size={22} color={theme.colors.textMuted} />
                          </PressableScale>
                        ) : null}
                      </View>
                      <View style={styles.dosageRow}>
                        <View style={styles.flex}>
                          <TextField
                            theme={theme}
                            label=""
                            value={step.amount}
                            invalid={Boolean(errors.steps) && !isPositive(step.amount)}
                            onChangeText={(amount) => updateStep(index, { amount: cleanNumber(amount) })}
                            placeholder="Ej. 20"
                            keyboardType="decimal-pad"
                            accessibilityLabel={`Dosis de la etapa ${index + 1}`}
                          />
                        </View>
                        <Text style={[styles.stepUnit, { color: theme.colors.textSecondary }]}>{form.dosageUnit}</Text>
                      </View>
                      <Stepper
                        theme={theme}
                        label="Durante"
                        value={`${step.days} ${step.days === 1 ? 'día' : 'días'}`}
                        canDecrease={step.days > 1}
                        canIncrease={step.days < STEP_DAYS_MAX}
                        onDecrease={() => updateStep(index, { days: step.days - 1 })}
                        onIncrease={() => updateStep(index, { days: step.days + 1 })}
                        decreaseLabel={`Menos días en la etapa ${index + 1}`}
                        increaseLabel={`Más días en la etapa ${index + 1}`}
                      />
                    </View>
                  ))}
                  {form.steps.length < STEPS_MAX ? (
                    <AppButton
                      theme={theme}
                      label="Agregar etapa"
                      icon="add"
                      iconPosition="left"
                      variant="secondary"
                      onPress={() => update({ steps: [...form.steps, { amount: '', days: form.steps[form.steps.length - 1]?.days ?? 7 }] })}
                    />
                  ) : null}
                  <Note theme={theme} icon="trending-down-outline" color={theme.colors.accentSecondary}>
                    Por ejemplo, un corticoide que se va reduciendo. Cada alarma dirá la dosis de ese día.
                  </Note>
                </View>
              ) : null}
            </FieldShell>

            {usesStartDate ? (
              <FieldShell theme={theme} label="Empieza">
                <PressableScale
                  pressedScale={0.98}
                  onPress={() => openDatePicker('start')}
                  accessibilityRole="button"
                  accessibilityLabel={`Empieza el ${longDate(form.startDate)}. Toca para cambiar.`}
                  style={[styles.selector, startColors]}
                >
                  <Ionicons name="play-circle-outline" size={20} color={theme.colors.accentSecondary} />
                  <Text style={[styles.selectorText, { color: theme.colors.textPrimary }]}>
                    {form.startDate.getTime() === today().getTime() ? 'Hoy' : longDate(form.startDate)}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
                </PressableScale>
                {Platform.OS === 'ios' && iosPicker === 'start' ? (
                  <DateTimePicker
                    value={form.startDate}
                    mode="date"
                    display="inline"
                    locale="es-ES"
                    themeVariant={theme.mode}
                    onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                      if (selected) {
                        selected.setHours(0, 0, 0, 0);
                        update({ startDate: selected });
                      }
                    }}
                  />
                ) : null}
              </FieldShell>
            ) : null}
          </>
        )}

        <FieldShell theme={theme} label="Duración" error={tapering ? null : errors.endDate}>
          {taperEnd ? (
            <Note theme={theme} icon="flag-outline" color={theme.colors.accentPrimary}>
              Termina el <Text style={{ color: theme.colors.textPrimary, fontWeight: '800' }}>{shortDate(taperEnd)}</Text>, al
              acabar la última etapa.
            </Note>
          ) : (
            <>
              <View style={styles.chipsWrap}>
                <SelectableChip theme={theme} label="Sin fecha de fin" selected={!form.hasEndDate} onPress={() => { update({ hasEndDate: false }); setIosPicker(null); }} />
                <SelectableChip theme={theme} label="Hasta una fecha" selected={form.hasEndDate} onPress={() => { update({ hasEndDate: true }); if (!form.endDate) openDatePicker('date'); }} />
              </View>
              {form.hasEndDate ? (
                <PressableScale
                  pressedScale={0.98}
                  onPress={() => openDatePicker('date')}
                  accessibilityRole="button"
                  accessibilityLabel="Elegir fecha de fin del tratamiento"
                  style={[styles.selector, dateColors]}
                >
                  <Ionicons name="calendar-outline" size={20} color={theme.colors.accentSecondary} />
                  <Text style={[styles.selectorText, { color: form.endDate ? theme.colors.textPrimary : theme.colors.inputPlaceholder }]}>
                    {form.endDate ? `Hasta el ${longDate(form.endDate)}` : 'Elegir fecha'}
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
            </>
          )}
        </FieldShell>
      </View>

      <View pointerEvents={detailsLocked ? 'none' : 'auto'} style={[styles.group, detailsLocked && styles.locked]}>
        <FieldShell theme={theme} label="Existencias" optional>
          <View style={styles.chipsWrap}>
            <SelectableChip theme={theme} label="No llevar la cuenta" selected={!form.trackStock} onPress={() => setTrackStock(false)} />
            <SelectableChip theme={theme} label="Avisarme cuando queden pocas" selected={form.trackStock} onPress={() => setTrackStock(true)} />
          </View>
        </FieldShell>
        {form.trackStock ? (
          <>
            <View style={styles.stockRow}>
              <View style={styles.flex}>
                <TextField
                  theme={theme}
                  label={`Tienes (${stockUnit})`}
                  value={form.stockQuantity}
                  error={errors.stockQuantity}
                  onChangeText={(stockQuantity) => update({ stockQuantity: cleanNumber(stockQuantity) })}
                  placeholder="Ej. 30"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.flex}>
                <TextField
                  theme={theme}
                  label="Usas por toma"
                  value={form.stockPerDose}
                  error={errors.stockPerDose}
                  onChangeText={(stockPerDose) => update({ stockPerDose: cleanNumber(stockPerDose) })}
                  placeholder="Ej. 1"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <TextField
              theme={theme}
              label={`Avisarme cuando queden (${stockUnit})`}
              value={form.stockAlertAt}
              error={errors.stockAlertAt}
              onChangeText={(stockAlertAt) => update({ stockAlertAt: cleanNumber(stockAlertAt) })}
              placeholder="Ej. 5"
              keyboardType="decimal-pad"
            />
            <Note theme={theme} icon="cube-outline" color={theme.colors.accentSecondary}>
              {stockEstimate !== null
                ? `Te alcanza para unos ${stockEstimate} ${stockEstimate === 1 ? 'día' : 'días'}. `
                : ''}
              Cada toma registrada como tomada se descuenta sola. Cuando compres más, actualiza la cantidad aquí.
            </Note>
          </>
        ) : null}

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
      </View>

      {showErrors && Object.values(validate(form)).some(Boolean) ? (
        <Text style={[styles.formError, { color: ERROR_COLOR }]} accessibilityLiveRegion="polite">
          Revisa los campos marcados.
        </Text>
      ) : null}
    </FormSheet>
  );
}

function Note({
  theme,
  icon,
  color,
  children,
}: Readonly<{ theme: AppTheme; icon: keyof typeof Ionicons.glyphMap; color: string; children: React.ReactNode }>) {
  return (
    <View style={[styles.preview, { backgroundColor: `${color}14` }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.previewText, { color: theme.colors.textSecondary }]}>{children}</Text>
    </View>
  );
}

function Stepper({
  theme,
  label,
  value,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
  decreaseLabel,
  increaseLabel,
}: Readonly<{
  theme: AppTheme;
  label: string;
  value: string;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseLabel: string;
  increaseLabel: string;
}>) {
  return (
    <View style={[styles.stepper, { borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.inputBackground }]}>
      <Text style={[styles.stepperLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <StepperButton theme={theme} icon="remove" label={decreaseLabel} disabled={!canDecrease} onPress={onDecrease} />
      <Text style={[styles.stepperValue, { color: theme.colors.textPrimary }]} accessibilityLiveRegion="polite">
        {value}
      </Text>
      <StepperButton theme={theme} icon="add" label={increaseLabel} disabled={!canIncrease} onPress={onIncrease} />
    </View>
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
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  weekDay: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  weekDayText: { fontSize: 14, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 8, paddingLeft: 14 },
  stepperLabel: { fontSize: 15, fontWeight: '600', minWidth: 44 },
  stepperButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  steps: { gap: 10 },
  stepCard: { gap: 10, borderWidth: 1, borderRadius: 16, padding: 12 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepTitle: { fontSize: 14, fontWeight: '800' },
  stepUnit: { fontSize: 15, fontWeight: '700', minWidth: 60, paddingTop: 15 },
  stockRow: { flexDirection: 'row', gap: 10 },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14 },
  selectorText: { flex: 1, fontSize: 16 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  previewText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  formError: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  group: { gap: 20 },
  locked: { opacity: 0.5 },
});
