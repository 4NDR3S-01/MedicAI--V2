/**
 * MedicAI — Notification & Alarm Service
 *
 * This module handles TWO distinct event types per medication dose:
 *
 *  1. REMINDER (notification)
 *       - Fires `leadMinutes` BEFORE the scheduled dose time.
 *       - Uses expo-notifications only → lightweight, banner-style.
 *       - Does NOT trigger native AlarmActivity or in-app alarm modal.
 *       - Not persisted to native SharedPreferences (no BootReceiver needed).
 *       - Configurable lead time via Profile → Notificaciones.
 *
 *  2. DOSE ALARM (alarm)
 *       - Fires AT the exact scheduled dose time.
 *       - Priority 1: Android native AlarmManager (survives reboot via BootReceiver).
 *       - Priority 2: expo-notifications fallback (cross-platform).
 *       - Triggers native AlarmActivity (full-screen over lock screen) + in-app modal.
 *       - Full interaction: Take / Snooze (10 min) / Skip.
 *
 * iOS Critical Alerts require the `com.apple.developer.usernotifications.critical-alerts`
 * entitlement (configured in app.json) and Apple approval for production.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, PermissionsAndroid } from 'react-native';

import { appStorage } from '../storage';
import AlarmNative from '../native/AlarmNative';
import { doseKey, getDoseDatesBetween, type DoseScheduleInput } from './dose-schedule';

// ─── Public constants ─────────────────────────────────────────────────────────

export const CHANNELS = {
  MEDICATION_ALARMS: 'medicai_medication_alarms',
  MEDICATION_REMINDERS: 'medicai_medication_reminders',
  APPOINTMENTS: 'medicai_appointments',
  /** Debe coincidir con CIRCLE_CHANNEL del backend (push). */
  CIRCLE: 'medicai_circle',
} as const;

export const NOTIFICATION_CATEGORIES = {
  DOSE_ALARM: 'DOSE_ALARM_ACTION',
  REMINDER: 'MEDICATION_REMINDER',
  APPOINTMENT: 'APPOINTMENT_REMINDER',
} as const;

export const NOTIFICATION_ACTIONS = {
  TAKE: 'TAKE_ACTION',
  SNOOZE: 'SNOOZE_ACTION',
  SKIP: 'SKIP_ACTION',
  SNOOZE_APPOINTMENT: 'SNOOZE_APPOINTMENT_ACTION',
} as const;

export const SCHEDULE_TYPES = {
  DOSE_ALARM: 'DOSE_ALARM',
  REMINDER: 'REMINDER',
} as const;

// ─── Internal constants ───────────────────────────────────────────────────────

const LEAD_MINUTES_STORAGE_KEY = 'medicai_medication_reminder_lead_minutes_v1';
const APPOINTMENT_LEAD_MINUTES_STORAGE_KEY = 'medicai_appointment_reminder_lead_minutes_v1';
const DEFAULT_LEAD_MINUTES = 5;
const DEFAULT_APPOINTMENT_LEAD_MINUTES = 60;
const MIN_APPOINTMENT_LEAD_MINUTES = 30;
// Android limita a 500 las alarmas pendientes por app (AlarmManager), sumando
// alarmas nativas y notificaciones programadas. iOS limita a 64 notificaciones.
// Se reserva margen para citas y alarmas pospuestas.
const ANDROID_DOSE_BUDGET = 300;
const ANDROID_REMINDER_BUDGET = 80;
const IOS_NOTIFICATION_LIMIT = 64;
const IOS_RESERVED_SLOTS = 4;
const PLAN_LOOKAHEAD_DAYS = 14;
const REMINDER_HORIZON_MS = 48 * 3_600_000;
// Se vuelve a planificar si quedan menos de 3 días cubiertos o el plan es viejo.
const REPLAN_HORIZON_MARGIN_MS = 3 * 86_400_000;
const REPLAN_MAX_AGE_MS = 12 * 3_600_000;
const PLAN_STORAGE_KEY = 'medicai_alarm_plan_v1';
const NATIVE_IDS_STORAGE_KEY = 'medicai_native_alarm_ids_v1';
const SCHEDULE_CONCURRENCY = 8;
const SNOOZE_MINUTES = 10;
const APPOINTMENT_SNOOZE_MINUTES = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

export type MedicationScheduleInput = DoseScheduleInput & {
  name: string;
  dosage: string;
  /**
   * Medicamento de otra persona del Círculo cuyos recordatorios recibo:
   * ALARM = alarma completa (p. ej. un hijo sin teléfono), NOTIFY = solo aviso.
   */
  ownerId?: string;
  ownerName?: string;
  careMode?: 'ALARM' | 'NOTIFY';
};

/** Recordatorios de otras personas del Círculo, combinados con los propios. */
type CareAlarmPlan = { items: MedicationScheduleInput[]; handled: string[] };
const CARE_PLAN_STORAGE_KEY = 'medicai_care_alarm_plan_v1';
const CARE_OWNERS_STORAGE_KEY = 'medicai_care_medication_owners_v1';

export type AlarmSyncResult = {
  status: 'scheduled' | 'up-to-date' | 'no-permission';
  scheduled: number;
  failed: number;
};

// ─── Low-level: una alarma de toma y un recordatorio ──────────────────────────

const nativeDoseAlarmId = (medicationId: string, dose: Date) => `${medicationId}_dose_${dose.getTime()}`;

/** Alarma a la hora exacta: nativa en Android (sobrevive reinicios), Expo si no. */
const scheduleDoseAlarm = async (
  medication: MedicationScheduleInput,
  dose: Date,
): Promise<{ nativeId?: string }> => {
  const title = medication.ownerName ? `${medication.ownerName} · ${medication.name}` : medication.name;
  const body = medication.ownerName
    ? `Es hora de la dosis de ${medication.ownerName}: ${medication.dosage}`
    : `Es hora de tu dosis: ${medication.dosage}`;

  // Solo aviso: una notificación normal, sin pantalla de alarma.
  if (medication.careMode === 'NOTIFY') {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          id: medication.id,
          type: SCHEDULE_TYPES.REMINDER,
          careNotice: true,
          ownerId: medication.ownerId,
          scheduledFor: dose.toISOString(),
          doseAt: dose.toISOString(),
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: dose,
        channelId: CHANNELS.MEDICATION_REMINDERS,
      },
    });
    return {};
  }

  if (AlarmNative.isAvailable()) {
    const nativeId = nativeDoseAlarmId(medication.id, dose);
    try {
      await AlarmNative.scheduleAlarm(nativeId, dose.getTime(), title, body);
      return { nativeId };
    } catch (err) {
      console.warn('[MedicAI] Native dose alarm failed, falling back to expo-notifications:', err);
    }
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        id: medication.id,
        type: SCHEDULE_TYPES.DOSE_ALARM,
        ownerId: medication.ownerId,
        scheduledFor: dose.toISOString(),
        doseAt: dose.toISOString(),
      },
      categoryIdentifier: NOTIFICATION_CATEGORIES.DOSE_ALARM,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: dose,
      channelId: CHANNELS.MEDICATION_ALARMS,
    },
  });
  return {};
};

/** Aviso `leadMinutes` antes de la toma (solo notificación, sin pantalla de alarma). */
const scheduleDoseReminder = async (
  medication: MedicationScheduleInput,
  dose: Date,
  reminderAt: Date,
): Promise<void> => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Recordatorio: ${medication.name}`,
      body: `Tu dosis (${medication.dosage}) es en unos minutos.`,
      data: {
        id: medication.id,
        type: SCHEDULE_TYPES.REMINDER,
        scheduledFor: reminderAt.toISOString(),
        doseAt: dose.toISOString(),
      },
      categoryIdentifier: NOTIFICATION_CATEGORIES.REMINDER,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
      sticky: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderAt,
      channelId: CHANNELS.MEDICATION_REMINDERS,
    },
  });
};

/** Ejecuta tareas asíncronas con concurrencia limitada; cuenta los fallos. */
async function runLimited<T>(items: T[], worker: (item: T) => Promise<void>): Promise<number> {
  let failed = 0;
  for (let index = 0; index < items.length; index += SCHEDULE_CONCURRENCY) {
    const batch = items.slice(index, index + SCHEDULE_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(worker));
    failed += results.filter((result) => result.status === 'rejected').length;
  }
  return failed;
}

// ─── Lead minutes preference ──────────────────────────────────────────────────

export async function getMedicationReminderLeadMinutes(): Promise<number> {
  const raw = await appStorage.getItem(LEAD_MINUTES_STORAGE_KEY);
  if (!raw) return DEFAULT_LEAD_MINUTES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 120 ? parsed : DEFAULT_LEAD_MINUTES;
}

export async function setMedicationReminderLeadMinutes(minutes: number): Promise<void> {
  await appStorage.setItem(
    LEAD_MINUTES_STORAGE_KEY,
    String(Math.max(0, Math.min(120, Math.trunc(minutes)))),
  );
}

export async function getAppointmentReminderLeadMinutes(): Promise<number> {
  const raw = await appStorage.getItem(APPOINTMENT_LEAD_MINUTES_STORAGE_KEY);
  if (!raw) return DEFAULT_APPOINTMENT_LEAD_MINUTES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= MIN_APPOINTMENT_LEAD_MINUTES && parsed <= 10_080
    ? parsed
    : DEFAULT_APPOINTMENT_LEAD_MINUTES;
}

export async function setAppointmentReminderLeadMinutes(minutes: number): Promise<void> {
  await appStorage.setItem(
    APPOINTMENT_LEAD_MINUTES_STORAGE_KEY,
    String(Math.max(MIN_APPOINTMENT_LEAD_MINUTES, Math.min(10_080, Math.trunc(minutes)))),
  );
}

export const formatLeadMinutes = (minutes: number): string => {
  if (minutes < 60) return `${minutes} minutos`;
  if (minutes === 60) return '1 hora';
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? 'día' : 'días'}`;
  if (minutes % 60 === 0) return `${minutes / 60} horas`;
  return `${minutes} minutos`;
};

// ─── Notification setup ───────────────────────────────────────────────────────

/**
 * Call once at app startup before mounting root component.
 * Sets foreground handler + Android channels + interactive categories.
 */
export async function setupNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  if (Platform.OS === 'android') {
    // High-priority channel for dose alarms
    await Notifications.setNotificationChannelAsync(CHANNELS.MEDICATION_ALARMS, {
      name: 'Alarmas de Medicación',
      description: 'Alarmas para el momento exacto de la toma',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#4F46E5',
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: true,
    });

    // Standard channel for pre-dose reminders
    await Notifications.setNotificationChannelAsync(CHANNELS.MEDICATION_REMINDERS, {
      name: 'Recordatorios de Medicación',
      description: 'Avisos previos a la toma de medicamentos',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F46E5',
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync(CHANNELS.APPOINTMENTS, {
      name: 'Recordatorios de Citas',
      description: 'Recordatorios para citas médicas programadas',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F46E5',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: true,
    });

    // Avisos del Círculo enviados por el servidor (push): invitaciones,
    // "no registró su toma", cambios de permisos.
    await Notifications.setNotificationChannelAsync(CHANNELS.CIRCLE, {
      name: 'Avisos del Círculo',
      description: 'Invitaciones, tomas sin registrar de las personas que cuidas y cambios en lo que comparten',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 150, 200],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      enableVibrate: true,
      showBadge: true,
    });
  }

  // Category for dose alarms: full interaction
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.DOSE_ALARM, [
    {
      identifier: NOTIFICATION_ACTIONS.TAKE,
      buttonTitle: 'Tomar',
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTIONS.SNOOZE,
      buttonTitle: 'Posponer (10m)',
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTIONS.SKIP,
      buttonTitle: 'Omitir',
      options: { isDestructive: true, opensAppToForeground: false },
    },
  ]);

  // Category for reminders: simple notification, open app on tap
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.REMINDER, []);

  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.APPOINTMENT, [
    {
      identifier: NOTIFICATION_ACTIONS.SNOOZE_APPOINTMENT,
      buttonTitle: 'Recordar luego',
      options: { opensAppToForeground: true },
    },
  ]);
}

/**
 * Requests notification permissions and creates Android channels.
 * On iOS, requests Critical Alerts authorization.
 * Returns 'granted' on success, null if denied or simulator.
 */
export async function registerForPushNotificationsAsync(): Promise<'granted' | null> {
  if (!Device.isDevice) {
    console.log('[MedicAI] Notifications: physical device required — skipping');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowCriticalAlerts: true,
        allowProvisional: false,
      },
    });
    finalStatus = status;
  }

  if (Platform.OS === 'android' && Platform.Version >= 33 && finalStatus !== 'granted') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        const { status: recheckStatus } = await Notifications.getPermissionsAsync();
        finalStatus = recheckStatus;
      }
    } catch (err) {
      console.warn('[MedicAI] POST_NOTIFICATIONS permission request failed:', err);
    }
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNELS.MEDICATION_ALARMS, {
      name: 'Alarmas de Medicación',
      description: 'Alarmas para el momento exacto de la toma',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#4F46E5',
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync(CHANNELS.MEDICATION_REMINDERS, {
      name: 'Recordatorios de Medicación',
      description: 'Avisos previos a la toma de medicamentos',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F46E5',
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync(CHANNELS.APPOINTMENTS, {
      name: 'Recordatorios de Citas',
      description: 'Recordatorios para citas médicas programadas',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F46E5',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: true,
    });
  }

  return 'granted';
}

// ─── Public scheduling API ────────────────────────────────────────────────────

// ─── Planificador global de alarmas de medicamentos ──────────────────────────

type AlarmPlanMeta = { signature: string; horizonEnd: number; plannedAt: number };

const isMedicationNotification = (data: Record<string, unknown> | undefined) =>
  !!data
  && (data.type === SCHEDULE_TYPES.DOSE_ALARM || data.type === SCHEDULE_TYPES.REMINDER)
  && data.snooze !== true;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await appStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

const buildPlanSignature = (medications: MedicationScheduleInput[], leadMinutes: number) =>
  JSON.stringify({
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    leadMinutes,
    meds: medications
      .filter((med) => med.active)
      .map((med) => [
        med.id,
        med.name,
        med.dosage,
        [...med.times].sort(),
        med.activeSince,
        med.customEndDate,
        med.ownerName ?? null,
        med.careMode ?? null,
        med.timeZone ?? null,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });

/** Cancela todo lo planificado (no las alarmas pospuestas por el usuario). */
async function cancelPlannedMedicationAlarms(legacyMedicationIds: string[]): Promise<void> {
  const nativeIds = (await readJson<string[]>(NATIVE_IDS_STORAGE_KEY)) ?? [];
  if (AlarmNative.isAvailable()) {
    await runLimited(nativeIds, (id) => AlarmNative.cancelAlarm(id).then(() => undefined));
    // Versiones anteriores programaban 30 días por medicamento sin registrar los
    // ids: la primera vez se limpian por prefijo de medicamento.
    await runLimited(legacyMedicationIds, (id) =>
      AlarmNative.cancelAlarmsForMedication(id).then(() => undefined),
    );
  }
  await appStorage.setItem(NATIVE_IDS_STORAGE_KEY, '[]');

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await runLimited(
    scheduled.filter((item) => isMedicationNotification(item.content.data as Record<string, unknown>)),
    (item) => Notifications.cancelScheduledNotificationAsync(item.identifier),
  );
}

let syncChain: Promise<unknown> = Promise.resolve();

/**
 * Programa las alarmas de TODOS los medicamentos con un presupuesto global:
 * las tomas más próximas primero, hasta PLAN_LOOKAHEAD_DAYS o hasta agotar el
 * presupuesto (nunca se supera el límite del sistema).
 *
 * Es incremental: si nada cambió y el plan aún cubre varios días, no hace nada.
 * Llamarla al cargar la lista, al volver a primer plano y tras cualquier
 * cambio (con `force`). Las llamadas se encadenan, nunca se solapan.
 *
 * @param handledDoseKeys tomas ya registradas (doseKey) que no deben sonar.
 */
export function syncMedicationAlarms(
  medications: MedicationScheduleInput[],
  options: { force?: boolean; handledDoseKeys?: Set<string> } = {},
): Promise<AlarmSyncResult> {
  const run = syncChain.then(() => runMedicationAlarmSync(medications, options));
  syncChain = run.catch(() => undefined);
  return run;
}

async function runMedicationAlarmSync(
  ownMedications: MedicationScheduleInput[],
  { force = false, handledDoseKeys: ownHandled }: { force?: boolean; handledDoseKeys?: Set<string> },
): Promise<AlarmSyncResult> {
  // Un solo plan (y un solo presupuesto) para lo propio y lo de las personas
  // que cuido: así ninguna llamada borra las alarmas de la otra.
  const care = await readJson<CareAlarmPlan>(CARE_PLAN_STORAGE_KEY);
  const ownIds = new Set(ownMedications.map((medication) => medication.id));
  const medications = [
    ...ownMedications,
    ...(care?.items ?? []).filter((medication) => !ownIds.has(medication.id)),
  ];
  const handledDoseKeys = new Set([...(ownHandled ?? []), ...(care?.handled ?? [])]);

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    return { status: 'no-permission', scheduled: 0, failed: 0 };
  }

  const now = new Date();
  const leadMinutes = await getMedicationReminderLeadMinutes();
  const signature = buildPlanSignature(medications, leadMinutes);
  const previous = await readJson<AlarmPlanMeta>(PLAN_STORAGE_KEY);

  const planIsFresh =
    previous
    && previous.signature === signature
    && previous.horizonEnd - now.getTime() > REPLAN_HORIZON_MARGIN_MS
    && now.getTime() - previous.plannedAt < REPLAN_MAX_AGE_MS;
  if (!force && planIsFresh) {
    return { status: 'up-to-date', scheduled: 0, failed: 0 };
  }

  await cancelPlannedMedicationAlarms(previous ? [] : medications.map((med) => med.id));

  // Presupuesto según plataforma.
  let doseBudget = ANDROID_DOSE_BUDGET;
  let reminderBudget = ANDROID_REMINDER_BUDGET;
  if (Platform.OS === 'ios') {
    const remaining = await Notifications.getAllScheduledNotificationsAsync();
    const available = Math.max(0, IOS_NOTIFICATION_LIMIT - IOS_RESERVED_SLOTS - remaining.length);
    doseBudget = available;
    reminderBudget = 0; // en iOS se calculan con lo que sobre tras las tomas
  }

  const lookaheadEnd = new Date(now.getTime() + PLAN_LOOKAHEAD_DAYS * 86_400_000);
  const dosesOf = (list: MedicationScheduleInput[]) =>
    list
      .flatMap((medication) =>
        getDoseDatesBetween(medication, new Date(now.getTime() + 1000), lookaheadEnd).map((dose) => ({
          medication,
          dose,
        })),
      )
      .filter(({ medication, dose }) => !handledDoseKeys?.has(doseKey(medication.id, dose)))
      .sort((a, b) => a.dose.getTime() - b.dose.getTime());

  // Las tomas propias tienen prioridad: un cuidador con muchas personas no
  // puede quedarse sin sus propias alarmas por falta de cupo.
  const ownDoses = dosesOf(medications.filter((medication) => !medication.ownerId));
  const careDoses = dosesOf(medications.filter((medication) => medication.ownerId));
  const plannedOwn = ownDoses.slice(0, doseBudget);
  const plannedCare = careDoses.slice(0, Math.max(0, doseBudget - plannedOwn.length));
  const plannedDoses = [...plannedOwn, ...plannedCare];
  if (Platform.OS === 'ios') {
    reminderBudget = Math.max(0, doseBudget - plannedDoses.length);
  }

  const nativeIds: string[] = [];
  let failed = await runLimited(plannedDoses, async ({ medication, dose }) => {
    const { nativeId } = await scheduleDoseAlarm(medication, dose);
    if (nativeId) nativeIds.push(nativeId);
  });

  const reminders =
    leadMinutes > 0
      ? plannedDoses
        // El aviso previo es solo para las tomas propias.
        .filter(({ medication }) => !medication.ownerId)
        .filter(({ dose }) => dose.getTime() - now.getTime() <= REMINDER_HORIZON_MS)
        .map(({ medication, dose }) => ({
          medication,
          dose,
          reminderAt: new Date(dose.getTime() - leadMinutes * 60_000),
        }))
        .filter(({ reminderAt }) => reminderAt.getTime() > now.getTime())
        .slice(0, reminderBudget)
      : [];
  failed += await runLimited(reminders, ({ medication, dose, reminderAt }) =>
    scheduleDoseReminder(medication, dose, reminderAt),
  );

  // Si el presupuesto no alcanzó para todo, el plan cubre hasta la última toma
  // programada de la lista que se quedó corta.
  const coveredUntil = (planned: typeof ownDoses, all: typeof ownDoses) =>
    planned.length < all.length
      ? planned.length > 0 ? planned[planned.length - 1].dose.getTime() : now.getTime()
      : lookaheadEnd.getTime();
  const horizonEnd = Math.min(coveredUntil(plannedOwn, ownDoses), coveredUntil(plannedCare, careDoses));

  await appStorage.setItem(NATIVE_IDS_STORAGE_KEY, JSON.stringify(nativeIds));
  await appStorage.setItem(
    PLAN_STORAGE_KEY,
    JSON.stringify({ signature, horizonEnd, plannedAt: now.getTime() } satisfies AlarmPlanMeta),
  );

  const scheduled = plannedDoses.length + reminders.length - failed;
  console.log(`[MedicAI] Alarm plan: ${plannedDoses.length} doses, ${reminders.length} reminders, ${failed} failed`);
  if (failed > 0 && scheduled <= 0) {
    throw new Error('No se pudieron programar las alarmas.');
  }
  return { status: 'scheduled', scheduled, failed };
}

/** Cancela la alarma y el recordatorio de una toma concreta (p. ej. ya registrada). */
export async function cancelDoseAlarm(medicationId: string, dose: Date): Promise<void> {
  const doseIso = dose.toISOString();
  if (AlarmNative.isAvailable()) {
    try {
      await AlarmNative.cancelAlarm(nativeDoseAlarmId(medicationId, dose));
    } catch {
      // No crítico
    }
  }
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of scheduled) {
    const data = item.content.data as Record<string, unknown> | undefined;
    if (data?.id === medicationId && data.doseAt === doseIso) {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }
}

const getAppointmentEndOfDayReminderDate = (appointmentDate: Date): Date => {
  const endOfDay = new Date(appointmentDate);
  endOfDay.setHours(21, 0, 0, 0);

  if (endOfDay.getTime() <= appointmentDate.getTime()) {
    endOfDay.setTime(appointmentDate.getTime() + 60 * 60_000);
  }

  const lastReasonableReminder = new Date(appointmentDate);
  lastReasonableReminder.setHours(23, 30, 0, 0);
  return endOfDay.getTime() > lastReasonableReminder.getTime() ? lastReasonableReminder : endOfDay;
};

const scheduleAppointmentNotification = async (
  appointment: {
    id: string;
    title: string;
    doctorName?: string | null;
    scheduledAt: string;
  },
  triggerDate: Date,
  kind: 'LEAD' | 'TIME' | 'END_OF_DAY' | 'SNOOZE',
  title: string,
  body: string,
): Promise<void> => {
  if (triggerDate.getTime() <= Date.now()) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        id: appointment.id,
        type: 'APPOINTMENT',
        appointmentNotificationKind: kind,
        scheduledAt: appointment.scheduledAt,
        title: appointment.title,
        doctorName: appointment.doctorName ?? undefined,
      },
      categoryIdentifier: NOTIFICATION_CATEGORIES.APPOINTMENT,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: CHANNELS.APPOINTMENTS,
    },
  });
};

/**
 * Schedules three appointment notifications:
 *  1. Configurable lead reminder (minimum 30 minutes)
 *  2. Exact appointment-time reminder
 *  3. End-of-day follow-up if the user did not manually mark attendance
 */
export async function scheduleAppointmentReminder(appointment: {
  id: string;
  title: string;
  doctorName?: string | null;
  scheduledAt: string;
  active?: boolean;
  attendanceStatus?: 'PENDING' | 'ATTENDED' | 'MISSED';
}): Promise<void> {
  await cancelNotificationsByDataId(appointment.id);
  if (appointment.active === false) return;
  if (appointment.attendanceStatus && appointment.attendanceStatus !== 'PENDING') return;

  const appointmentDate = new Date(appointment.scheduledAt);
  if (Number.isNaN(appointmentDate.getTime())) return;
  // Si la cita ya empezó, aún puede quedar pendiente la pregunta "¿Asististe?".
  if (getAppointmentEndOfDayReminderDate(appointmentDate).getTime() <= Date.now()) return;

  const permission = await registerForPushNotificationsAsync();
  if (permission !== 'granted') {
    console.warn('[MedicAI] scheduleAppointmentReminder: permission not granted, aborting schedule for', appointment.id);
    return;
  }

  const leadMinutes = await getAppointmentReminderLeadMinutes();
  const reminderAt = appointmentDate.getTime() - leadMinutes * 60_000;
  const doctorText = appointment.doctorName ? ` con ${appointment.doctorName}` : '';

  await scheduleAppointmentNotification(
    appointment,
    new Date(reminderAt),
    'LEAD',
    `Próxima cita: ${appointment.title}`,
    `Tienes una cita médica${doctorText} en ${formatLeadMinutes(leadMinutes)}.`,
  );

  await scheduleAppointmentNotification(
    appointment,
    appointmentDate,
    'TIME',
    `Tienes una cita: ${appointment.title}`,
    `Es la hora registrada de tu cita médica${doctorText}.`,
  );

  await scheduleAppointmentNotification(
    appointment,
    getAppointmentEndOfDayReminderDate(appointmentDate),
    'END_OF_DAY',
    `¿Asististe a ${appointment.title}?`,
    'Marca manualmente si asististe o no para mantener tu agenda actualizada.',
  );
}

export async function snoozeAppointmentReminder(
  notificationData: Notifications.NotificationContent,
): Promise<boolean> {
  const data = notificationData.data as {
    id?: string;
    scheduledAt?: string;
    title?: string;
    doctorName?: string;
  } | undefined;
  if (!data?.id || !data.scheduledAt) return false;

  const appointmentDate = new Date(data.scheduledAt);
  if (Number.isNaN(appointmentDate.getTime()) || appointmentDate.getTime() <= Date.now()) return false;

  const snoozeAt = Date.now() + APPOINTMENT_SNOOZE_MINUTES * 60_000;
  if (snoozeAt >= appointmentDate.getTime()) return false;

  await scheduleAppointmentNotification(
    {
      id: data.id,
      title: data.title ?? notificationData.title ?? 'Cita médica',
      doctorName: data.doctorName,
      scheduledAt: data.scheduledAt,
    },
    new Date(snoozeAt),
    'SNOOZE',
    `[Recordatorio] ${data.title ?? notificationData.title ?? 'Cita médica'}`,
    `Tu cita es pronto. ${notificationData.body ?? ''}`.trim(),
  );

  return true;
}

/**
 * Cancels ALL scheduled events (reminders + dose alarms + snoozed) for the given medication.
 */
export async function cancelNotificationsByDataId(id: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.id === id) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  if (AlarmNative.isAvailable()) {
    try {
      await AlarmNative.cancelAlarmsForMedication(id);
    } catch {
      // Non-critical
    }
  }
}

// ─── Snooze ───────────────────────────────────────────────────────────────────

/**
 * Schedules a snoozed DOSE ALARM after the given number of minutes.
 * Snoozed alarms use the dose alarm path (native → expo) so they trigger
 * the full interaction flow when they fire.
 */
async function scheduleSnoozeAlarm(
  medicationId: string,
  medicationName: string,
  body: string | undefined | null,
  minutes: number,
  doseAt: Date | null,
): Promise<void> {
  const snoozeDate = new Date(Date.now() + minutes * 60_000);
  // Mismo formato que el nativo: conserva la hora original de la toma para que
  // al responder la alarma pospuesta se registre en la toma correcta.
  const snoozeId = `${medicationId}_snooze_${snoozeDate.getTime()}${doseAt ? `_${doseAt.getTime()}` : ''}`;
  const snoozeTitle = medicationName.startsWith('[Pospuesto]') ? medicationName : `[Pospuesto] ${medicationName}`;
  const snoozeBody = body ?? 'Recuerda tomar tu medicamento.';

  if (AlarmNative.isAvailable()) {
    try {
      await AlarmNative.scheduleAlarm(snoozeId, snoozeDate.getTime(), snoozeTitle, snoozeBody);
      return;
    } catch (err) {
      console.warn('[MedicAI] Native snooze failed, falling back:', err);
    }
  }

  const doseIso = (doseAt ?? snoozeDate).toISOString();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: snoozeTitle,
      body: snoozeBody,
      // `snooze` evita que una replanificación cancele la alarma pospuesta;
      // `scheduledFor` es la toma original (para registrar la acción).
      data: { id: medicationId, type: SCHEDULE_TYPES.DOSE_ALARM, scheduledFor: doseIso, doseAt: doseIso, snooze: true },
      categoryIdentifier: NOTIFICATION_CATEGORIES.DOSE_ALARM,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: snoozeDate,
      channelId: CHANNELS.MEDICATION_ALARMS,
    },
  });
}

const getOriginalDose = (data: { doseAt?: unknown; scheduledFor?: unknown } | undefined): Date | null => {
  const raw = typeof data?.doseAt === 'string' ? data.doseAt : data?.scheduledFor;
  if (typeof raw !== 'string') return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Reschedules a dismissed dose alarm 10 minutes from now.
 */
export async function snoozeNotification(
  notificationData: Notifications.NotificationContent,
): Promise<void> {
  await snoozeNotificationWithDuration(notificationData, SNOOZE_MINUTES);
}

/**
 * Reschedules with a custom duration.
 */
export async function snoozeNotificationWithDuration(
  notificationData: Notifications.NotificationContent,
  minutes: number,
): Promise<void> {
  const data = notificationData.data as { id?: string; doseAt?: unknown; scheduledFor?: unknown } | undefined;
  const medicationId = data?.id ?? 'unknown';
  const medicationName = notificationData.title ?? 'Medicamento';
  await scheduleSnoozeAlarm(medicationId, medicationName, notificationData.body, minutes, getOriginalDose(data));
}

// ─── Post-launch recovery ─────────────────────────────────────────────────────

let appointmentSyncChain: Promise<unknown> = Promise.resolve();

type AppointmentReminderInput = {
  id: string;
  title: string;
  doctorName?: string | null;
  scheduledAt: string;
  active?: boolean;
  attendanceStatus?: 'PENDING' | 'ATTENDED' | 'MISSED';
};

/**
 * Deja los recordatorios de citas igual que la lista del servidor. Las
 * llamadas se encadenan (pantalla de Citas + sincronización al abrir la app)
 * para no programar dos veces el mismo aviso.
 */
export function rescheduleAppointmentsAfterLaunch(appointments: AppointmentReminderInput[]): Promise<void> {
  const run = appointmentSyncChain.then(() => runAppointmentReminderSync(appointments));
  appointmentSyncChain = run.catch(() => undefined);
  return run;
}

async function runAppointmentReminderSync(
  appointments: Array<{
    id: string;
    title: string;
    doctorName?: string | null;
    scheduledAt: string;
    active?: boolean;
    attendanceStatus?: 'PENDING' | 'ATTENDED' | 'MISSED';
  }>,
): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const byId = new Map(appointments.map((appointment) => [appointment.id, appointment]));

  // Recordatorios huérfanos: citas eliminadas, ya marcadas o desactivadas
  // (p. ej. por alguien del Círculo desde otro teléfono).
  const orphanIds = new Set<string>();
  for (const notification of scheduled) {
    const data = notification.content.data as { id?: string; type?: string } | undefined;
    if (data?.type !== 'APPOINTMENT' || typeof data.id !== 'string') continue;
    const appointment = byId.get(data.id);
    if (!appointment || appointment.active === false || (appointment.attendanceStatus && appointment.attendanceStatus !== 'PENDING')) {
      orphanIds.add(data.id);
    }
  }
  for (const id of orphanIds) await cancelNotificationsByDataId(id);

  for (const appointment of appointments) {
    if (appointment.active === false) continue;
    if (appointment.attendanceStatus && appointment.attendanceStatus !== 'PENDING') continue;

    const appointmentDate = new Date(appointment.scheduledAt);
    if (Number.isNaN(appointmentDate.getTime())) continue;
    if (getAppointmentEndOfDayReminderDate(appointmentDate).getTime() <= Date.now()) continue;

    // Programado y para la misma hora → nada que hacer. Si la hora cambió
    // (también desde otro teléfono), se reprograma.
    const upToDate = scheduled.some((notification) => {
      const data = notification.content.data as { id?: string; type?: string; scheduledAt?: string } | undefined;
      return data?.id === appointment.id
        && data.type === 'APPOINTMENT'
        && data.scheduledAt
        && new Date(data.scheduledAt).getTime() === appointmentDate.getTime();
    });
    if (!upToDate) await scheduleAppointmentReminder(appointment);
  }
}


// ─── Recordatorios de personas que cuido (Círculo) ───────────────────────────

/**
 * Guarda los medicamentos de otras personas cuyos recordatorios recibo; el
 * siguiente syncMedicationAlarms los programa junto con los propios.
 */
export async function setCareAlarmPlan(items: MedicationScheduleInput[], handled: Set<string>): Promise<void> {
  await appStorage.setItem(CARE_PLAN_STORAGE_KEY, JSON.stringify({ items, handled: [...handled] } satisfies CareAlarmPlan));
  const owners = Object.fromEntries(items.filter((item) => item.ownerId).map((item) => [item.id, item.ownerId]));
  await appStorage.setItem(CARE_OWNERS_STORAGE_KEY, JSON.stringify(owners));
}

/**
 * De quién es un medicamento que sonó en este teléfono (undefined si es
 * propio). Necesario para registrar la toma desde la alarma.
 */
export async function getCareMedicationOwner(medicationId: string): Promise<string | undefined> {
  const owners = await readJson<Record<string, string>>(CARE_OWNERS_STORAGE_KEY);
  return owners?.[medicationId];
}

const CARE_APPOINTMENT_TYPE = 'CARE_APPOINTMENT';
let careAppointmentChain: Promise<unknown> = Promise.resolve();

export type CareAppointmentInput = AppointmentReminderInput & { ownerId: string; ownerName: string };

/**
 * Avisos (antes y a la hora) de las citas de personas que cuido. Van aparte
 * de las propias para que cada sincronización solo toque lo suyo.
 */
export function syncCareAppointmentReminders(appointments: CareAppointmentInput[]): Promise<void> {
  const run = careAppointmentChain.then(() => runCareAppointmentSync(appointments));
  careAppointmentChain = run.catch(() => undefined);
  return run;
}

async function runCareAppointmentSync(appointments: CareAppointmentInput[]): Promise<void> {
  const leadMinutes = await getAppointmentReminderLeadMinutes();
  const now = Date.now();
  const wanted = new Map<string, { appointment: CareAppointmentInput; at: Date; kind: 'LEAD' | 'TIME' }>();
  for (const appointment of appointments) {
    if (appointment.active === false || (appointment.attendanceStatus && appointment.attendanceStatus !== 'PENDING')) continue;
    const date = new Date(appointment.scheduledAt);
    if (Number.isNaN(date.getTime())) continue;
    const lead = new Date(date.getTime() - leadMinutes * 60_000);
    if (lead.getTime() > now) wanted.set(`${appointment.id}|LEAD|${lead.getTime()}`, { appointment, at: lead, kind: 'LEAD' });
    if (date.getTime() > now) wanted.set(`${appointment.id}|TIME|${date.getTime()}`, { appointment, at: date, kind: 'TIME' });
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existing = new Set<string>();
  for (const notification of scheduled) {
    const data = notification.content.data as { type?: string; id?: string; kind?: string; at?: number } | undefined;
    if (data?.type !== CARE_APPOINTMENT_TYPE) continue;
    const key = `${data.id}|${data.kind}|${data.at}`;
    if (wanted.has(key)) existing.add(key);
    else await Notifications.cancelScheduledNotificationAsync(notification.identifier);
  }

  const permission = wanted.size ? await registerForPushNotificationsAsync() : 'granted';
  if (permission !== 'granted') return;

  for (const [key, { appointment, at, kind }] of wanted) {
    if (existing.has(key)) continue;
    const doctor = appointment.doctorName ? ` con ${appointment.doctorName}` : '';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: kind === 'LEAD' ? `Próxima cita de ${appointment.ownerName}` : `${appointment.ownerName} tiene una cita ahora`,
        body: kind === 'LEAD'
          ? `${appointment.title}${doctor} en ${formatLeadMinutes(leadMinutes)}.`
          : `${appointment.title}${doctor}.`,
        data: { type: CARE_APPOINTMENT_TYPE, id: appointment.id, ownerId: appointment.ownerId, kind, at: at.getTime() },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNELS.APPOINTMENTS },
    });
  }
}


/**
 * Al cerrar sesión: cancela TODO lo programado en este teléfono (alarmas
 * nativas, notificaciones, recordatorios de citas y de personas que cuido) y
 * borra los planes guardados, para que no suene nada del usuario anterior.
 */
export async function cancelAllUserReminders(): Promise<void> {
  const nativeIds = (await readJson<string[]>(NATIVE_IDS_STORAGE_KEY)) ?? [];
  if (AlarmNative.isAvailable()) {
    await runLimited(nativeIds, (id) => AlarmNative.cancelAlarm(id).then(() => undefined));
    await AlarmNative.stopAlarm().catch(() => undefined);
  }
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  await Promise.all(
    [NATIVE_IDS_STORAGE_KEY, PLAN_STORAGE_KEY, CARE_PLAN_STORAGE_KEY, CARE_OWNERS_STORAGE_KEY].map((key) =>
      appStorage.removeItem(key).catch(() => undefined),
    ),
  );
}
