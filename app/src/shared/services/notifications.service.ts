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

// ─── Public constants ─────────────────────────────────────────────────────────

export const CHANNELS = {
  MEDICATION_ALARMS: 'medicai_medication_alarms',
  MEDICATION_REMINDERS: 'medicai_medication_reminders',
  APPOINTMENTS: 'medicai_appointments',
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
  CONFIRM_APPOINTMENT: 'CONFIRM_APPOINTMENT_ACTION',
} as const;

export const SCHEDULE_TYPES = {
  DOSE_ALARM: 'DOSE_ALARM',
  REMINDER: 'REMINDER',
} as const;

// ─── Internal constants ───────────────────────────────────────────────────────

const LEAD_MINUTES_STORAGE_KEY = 'medicai_medication_reminder_lead_minutes_v1';
const DEFAULT_LEAD_MINUTES = 5;
const MAX_SCHEDULED = 500;
const LOOKAHEAD_DAYS = 30;
const SNOOZE_MINUTES = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

export type MedicationScheduleInput = {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  firstDoseTime?: string | null;
  times: string[];
  customIntervalHours?: number | null;
  customEndDate?: string | null;
  active: boolean;
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

const parseTime = (time: string): { hour: number; minute: number } | null => {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { hour: h, minute: m };
};

// ─── Low-level: schedule one REMINDER (expo-notifications only) ───────────────

const scheduleSingleReminder = async (
  medication: Pick<MedicationScheduleInput, 'id' | 'name' | 'dosage'>,
  triggerDate: Date,
): Promise<void> => {
  if (triggerDate.getTime() <= Date.now()) return;

  const reminderId = `${medication.id}_reminder_${triggerDate.getTime()}`;

  console.log('[MedicAI] Scheduling reminder:', reminderId, 'at', triggerDate.toISOString());
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Recordatorio: ${medication.name}`,
      body: `Tu dosis (${medication.dosage}) es en unos minutos.`,
      data: {
        id: medication.id,
        type: SCHEDULE_TYPES.REMINDER,
      },
      categoryIdentifier: NOTIFICATION_CATEGORIES.REMINDER,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
      sticky: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: CHANNELS.MEDICATION_REMINDERS,
    },
  });
};

// ─── Low-level: schedule one DOSE ALARM (native → expo fallback) ──────────────

const scheduleSingleDoseAlarm = async (
  medication: Pick<MedicationScheduleInput, 'id' | 'name' | 'dosage'>,
  triggerDate: Date,
): Promise<void> => {
  if (triggerDate.getTime() <= Date.now()) return;

  const alarmId = `${medication.id}_dose_${triggerDate.getTime()}`;
  const title = medication.name;
  const body = `Es hora de tu dosis: ${medication.dosage}`;

  // Path 1: native AlarmManager (Android, survives reboot)
  if (AlarmNative.isAvailable()) {
    try {
      console.log('[MedicAI] Scheduling dose alarm:', alarmId, 'at', triggerDate.toISOString());
      await AlarmNative.scheduleAlarm(alarmId, triggerDate.getTime(), title, body);
      console.log('[MedicAI] Dose alarm scheduled successfully:', alarmId);
      return;
    } catch (err) {
      console.warn('[MedicAI] Native dose alarm failed, falling back to expo-notifications:', err);
    }
  }

  // Path 2: expo-notifications fallback
  console.log('[MedicAI] Scheduling expo dose alarm:', alarmId, 'at', triggerDate.toISOString());
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        id: medication.id,
        type: SCHEDULE_TYPES.DOSE_ALARM,
      },
      categoryIdentifier: NOTIFICATION_CATEGORIES.DOSE_ALARM,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: CHANNELS.MEDICATION_ALARMS,
    },
  });
};

// ─── Scheduling strategies ────────────────────────────────────────────────────

const hasCustomRange = (
  medication: Pick<MedicationScheduleInput, 'customIntervalHours' | 'customEndDate'>,
): boolean =>
  typeof medication.customIntervalHours === 'number' &&
  medication.customIntervalHours > 0 &&
  typeof medication.customEndDate === 'string' &&
  medication.customEndDate.length > 0;

const scheduleCustomRangeAlarms = async (
  medication: MedicationScheduleInput,
  leadMinutes: number,
): Promise<void> => {
  const baseTime = medication.firstDoseTime ?? medication.times?.[0] ?? '00:00';
  const parsed = parseTime(baseTime);
  if (!parsed) return;

  const intervalMs = medication.customIntervalHours! * 3_600_000;
  const endDate = new Date(medication.customEndDate!);
  const now = new Date();

  const firstDose = new Date(now);
  firstDose.setHours(parsed.hour, parsed.minute, 0, 0);

  let next = firstDose;
  while (next <= now) next = new Date(next.getTime() + intervalMs);

  let count = 0;
  while (next <= endDate && count < MAX_SCHEDULED) {
    // Schedule dose alarm at exact dose time
    await scheduleSingleDoseAlarm(medication, next);
    count += 1;

    // Schedule reminder [leadMinutes] before dose time
    if (leadMinutes > 0) {
      const reminderDate = new Date(next.getTime() - leadMinutes * 60_000);
      if (reminderDate.getTime() > now.getTime()) {
        await scheduleSingleReminder(medication, reminderDate);
      }
    }

    next = new Date(next.getTime() + intervalMs);
  }
};

const scheduleRegularAlarms = async (
  medication: Pick<MedicationScheduleInput, 'id' | 'name' | 'dosage' | 'times'>,
  leadMinutes: number,
): Promise<void> => {
  if (!medication.times?.length) return;

  const now = new Date();
  let count = 0;

  for (const timeStr of medication.times) {
    const parsed = parseTime(timeStr);
    if (!parsed) continue;

    for (let day = 0; day < LOOKAHEAD_DAYS; day += 1) {
      if (count >= MAX_SCHEDULED) break;

      const doseDate = new Date(now);
      doseDate.setDate(now.getDate() + day);
      doseDate.setHours(parsed.hour, parsed.minute, 0, 0);

      if (doseDate.getTime() <= now.getTime()) continue;

      // Schedule dose alarm at exact dose time
      await scheduleSingleDoseAlarm(medication, doseDate);
      count += 1;

      // Schedule reminder [leadMinutes] before dose time
      if (leadMinutes > 0) {
        const reminderDate = new Date(doseDate.getTime() - leadMinutes * 60_000);
        if (reminderDate.getTime() > now.getTime()) {
          await scheduleSingleReminder(medication, reminderDate);
        }
      }
    }

    if (count >= MAX_SCHEDULED) break;
  }
};

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
      identifier: NOTIFICATION_ACTIONS.CONFIRM_APPOINTMENT,
      buttonTitle: 'Confirmar Asistencia',
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

/**
 * Cancels all existing alarms + reminders for a medication and schedules new ones.
 * Safe to call on create, update, and toggle-active operations.
 */
export async function scheduleMedicationNotifications(
  medication: MedicationScheduleInput,
): Promise<void> {
  await cancelNotificationsByDataId(medication.id);
  if (!medication.active) return;

  const permission = await registerForPushNotificationsAsync();
  if (permission !== 'granted') {
    console.warn('[MedicAI] scheduleMedicationNotifications: permission not granted, aborting schedule for', medication.id);
    return;
  }

  const leadMinutes = await getMedicationReminderLeadMinutes();

  if (hasCustomRange(medication)) {
    await scheduleCustomRangeAlarms(medication, leadMinutes);
  } else {
    await scheduleRegularAlarms(medication, leadMinutes);
  }
}

/**
 * Schedules a reminder notification 1 hour before an appointment.
 */
export async function scheduleAppointmentReminder(appointment: {
  id: string;
  title: string;
  scheduledAt: string;
}): Promise<void> {
  await cancelNotificationsByDataId(appointment.id);

  const appointmentDate = new Date(appointment.scheduledAt);
  const reminderDate = new Date(appointmentDate.getTime() - 3_600_000);
  if (reminderDate <= new Date()) return;

  if (AlarmNative.isAvailable()) {
    try {
      await AlarmNative.scheduleAlarm(appointment.id, reminderDate.getTime(), `Recordatorio: ${appointment.title}`, 'Tu cita médica es en 1 hora.');
      return;
    } catch (err) {
      console.warn('[MedicAI] Native alarm failed for appointment, falling back:', err);
    }
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Recordatorio: ${appointment.title}`,
      body: 'Tu cita médica es en 1 hora.',
      data: { id: appointment.id, type: 'APPOINTMENT' },
      categoryIdentifier: NOTIFICATION_CATEGORIES.APPOINTMENT,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderDate,
      channelId: CHANNELS.APPOINTMENTS,
    },
  });
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
): Promise<void> {
  const snoozeDate = new Date(Date.now() + minutes * 60_000);
  const snoozeId = `${medicationId}_dose_${snoozeDate.getTime()}`;
  const snoozeTitle = `[Pospuesto] ${medicationName}`;
  const snoozeBody = body ?? 'Recuerda tomar tu medicamento.';

  if (AlarmNative.isAvailable()) {
    try {
      await AlarmNative.scheduleAlarm(snoozeId, snoozeDate.getTime(), snoozeTitle, snoozeBody);
      return;
    } catch (err) {
      console.warn('[MedicAI] Native snooze failed, falling back:', err);
    }
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: snoozeTitle,
      body: snoozeBody,
      data: { id: medicationId, type: SCHEDULE_TYPES.DOSE_ALARM },
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

/**
 * Reschedules a dismissed dose alarm 10 minutes from now.
 */
export async function snoozeNotification(
  notificationData: Notifications.NotificationContent,
): Promise<void> {
  const data = notificationData.data as { id?: string } | undefined;
  const medicationId = data?.id ?? 'unknown';
  const medicationName = notificationData.title ?? 'Medicamento';
  await scheduleSnoozeAlarm(medicationId, medicationName, notificationData.body, SNOOZE_MINUTES);
}

/**
 * Reschedules with a custom duration.
 */
export async function snoozeNotificationWithDuration(
  notificationData: Notifications.NotificationContent,
  minutes: number,
): Promise<void> {
  const data = notificationData.data as { id?: string } | undefined;
  const medicationId = data?.id ?? 'unknown';
  const medicationName = notificationData.title ?? 'Medicamento';
  await scheduleSnoozeAlarm(medicationId, medicationName, notificationData.body, minutes);
}

// ─── Post-launch recovery ─────────────────────────────────────────────────────

/**
 * Re-schedules active medications that have NO pending notifications.
 *
 * Call on every app launch after medications are loaded.
 * Recovers from device reboots (clears native AlarmManager) and
 * ensures reminders (expo-only) are re-created.
 */
export async function rescheduleMedicationsAfterLaunch(
  medications: MedicationScheduleInput[],
): Promise<void> {
  const active = medications.filter(m => m.active);
  if (!active.length) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledMedIds = new Set(
    scheduled
      .map(n => n.content.data?.id)
      .filter((id): id is string => typeof id === 'string'),
  );

  for (const med of active) {
    // If we have NO scheduled events for this med, re-schedule everything
    if (!scheduledMedIds.has(med.id)) {
      console.log('[MedicAI] rescheduleMedicationsAfterLaunch: re-scheduling all events for', med.id);
      await scheduleMedicationNotifications(med);
    }
  }
}
