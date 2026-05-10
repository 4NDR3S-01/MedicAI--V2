/**
 * MedicAI — Notification & Alarm Service
 *
 * Scheduling strategy (in priority order):
 *  1. Android + native AlarmModule available (EAS/prebuild build):
 *       → AlarmManager.setExactAndAllowWhileIdle() + full-screen intent.
 *       → Works when app is killed AND after device reboot (BootReceiver).
 *  2. Fallback — expo-notifications scheduled local notifications:
 *       → Works in background and when app is killed on both platforms.
 *       → Android: AlarmManager used internally by Expo.
 *       → iOS: UNUserNotificationCenter (OS-guaranteed delivery).
 *       → Reboot gap: handled by rescheduleMedicationsAfterLaunch().
 *
 * iOS Critical Alerts:
 *   Requires the `com.apple.developer.usernotifications.critical-alerts` entitlement
 *   (configured in app.json) and Apple approval for production App Store distribution.
 *   Works in development / TestFlight once the entitlement is included in the build.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, PermissionsAndroid } from 'react-native';

import { appStorage } from '../storage';
import AlarmNative from '../native/AlarmNative';

// ─── Public constants ─────────────────────────────────────────────────────────

export const CHANNELS = {
  MEDICATION_ALARMS: 'medicai_medication_alarms',
  APPOINTMENTS: 'medicai_appointments',
} as const;

export const NOTIFICATION_CATEGORIES = {
  MEDICATION: 'MEDICATION_ACTION',
  APPOINTMENT: 'APPOINTMENT_REMINDER',
} as const;

export const NOTIFICATION_ACTIONS = {
  TAKE: 'TAKE_ACTION',
  SNOOZE: 'SNOOZE_ACTION',
  SKIP: 'SKIP_ACTION',
  CONFIRM_APPOINTMENT: 'CONFIRM_APPOINTMENT_ACTION',
} as const;

// ─── Internal constants ───────────────────────────────────────────────────────

const LEAD_MINUTES_STORAGE_KEY = 'medicai_medication_reminder_lead_minutes_v1';
const DEFAULT_LEAD_MINUTES = 0;
const MAX_SCHEDULED = 500;
const LOOKAHEAD_DAYS = 30;

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

const applyLeadMinutes = (date: Date, leadMinutes: number): Date =>
  leadMinutes > 0 ? new Date(date.getTime() - leadMinutes * 60_000) : date;

// ─── Low-level: schedule one notification ─────────────────────────────────────

const scheduleSingleMedicationNotification = async (
  medication: Pick<MedicationScheduleInput, 'id' | 'name' | 'dosage'>,
  triggerDate: Date,
  isLeadReminder: boolean,
): Promise<void> => {
  if (triggerDate.getTime() <= Date.now()) return;

  const title = medication.name;
  const body = isLeadReminder
    ? `Tu dosis (${medication.dosage}) es en unos minutos.`
    : `Es hora de tu dosis: ${medication.dosage}`;

  // Generate a unique alarm ID per medication+time to avoid PendingIntent overwrites
  // when the same medication has multiple daily doses.
  const alarmId = `${medication.id}_${triggerDate.getTime()}`;

  // ── Path 1: native AlarmManager (Android only, requires EAS/prebuild build) ──
  if (AlarmNative.isAvailable()) {
    try {
      console.log('[MedicAI] Scheduling native alarm:', alarmId, 'at', triggerDate.toISOString());
      await AlarmNative.scheduleAlarm(alarmId, triggerDate.getTime(), title, body);
      console.log('[MedicAI] Native alarm scheduled successfully:', alarmId);
      return;
    } catch (err) {
      console.warn('[MedicAI] Native alarm failed, falling back to expo-notifications:', err);
    }
  } else {
    console.log('[MedicAI] Native AlarmModule not available, using expo-notifications fallback');
  }

  // ── Path 2: expo-notifications (cross-platform, works in background & killed app) ──
  console.log('[MedicAI] Scheduling expo-notification:', medication.id, 'at', triggerDate.toISOString());
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        id: medication.id,
        type: 'MEDICATION',
        isLeadReminder,
      },
      categoryIdentifier: NOTIFICATION_CATEGORIES.MEDICATION,
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

const scheduleCustomRangeNotifications = async (
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
    await scheduleSingleMedicationNotification(
      medication,
      applyLeadMinutes(next, leadMinutes),
      leadMinutes > 0,
    );
    count += 1;
    next = new Date(next.getTime() + intervalMs);
  }
};

const scheduleRegularNotifications = async (
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

      const trigger = applyLeadMinutes(doseDate, leadMinutes);
      if (trigger.getTime() <= now.getTime()) continue;

      await scheduleSingleMedicationNotification(medication, trigger, leadMinutes > 0);
      count += 1;
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
 * Call once at app startup (before mounting the root component).
 * Sets the foreground notification handler and registers interactive categories.
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

  // Create Android notification channels early — notifications scheduled without
  // a valid channel are silently dropped on Android 8+.
  // These MUST exist before any scheduleNotificationAsync call.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNELS.MEDICATION_ALARMS, {
      name: 'Alarmas de Medicación',
      description: 'Recordatorios críticos para la toma de medicamentos',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#4F46E5',
      bypassDnd: true,
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

  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.MEDICATION, [
    {
      identifier: NOTIFICATION_ACTIONS.TAKE,
      buttonTitle: 'Tomar',
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTIONS.SNOOZE,
      buttonTitle: 'Posponer (15m)',
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTIONS.SKIP,
      buttonTitle: 'Omitir',
      options: { isDestructive: true, opensAppToForeground: false },
    },
  ]);

  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.APPOINTMENT, [
    {
      identifier: NOTIFICATION_ACTIONS.CONFIRM_APPOINTMENT,
      buttonTitle: 'Confirmar Asistencia',
      options: { opensAppToForeground: true },
    },
  ]);
}

/**
 * Requests notification permissions and creates Android notification channels.
 * On iOS, requests Critical Alerts authorization (requires Apple entitlement).
 * Returns 'granted' on success, null if permission was denied or device is a simulator.
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
        // Critical Alerts bypass silent/DND. Requires the entitlement from Apple.
        // Works in development and TestFlight once the entitlement is in the build.
        allowCriticalAlerts: true,
        allowProvisional: false,
      },
    });
    finalStatus = status;
  }

  // Android 13+ (API 33): POST_NOTIFICATIONS requires an explicit runtime prompt.
  // Only request via PermissionsAndroid if expo's requestPermissionsAsync didn't already
  // resolve it — on MIUI/OEM devices, a duplicate request can return inconsistent results.
  if (Platform.OS === 'android' && Platform.Version >= 33 && finalStatus !== 'granted') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        // Re-read through expo to get proper PermissionStatus enum value
        const { status: recheckStatus } = await Notifications.getPermissionsAsync();
        finalStatus = recheckStatus;
      }
    } catch (err) {
      console.warn('[MedicAI] POST_NOTIFICATIONS permission request failed:', err);
    }
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    // HIGH-PRIORITY channel for medication alarms (attempts DND bypass)
    await Notifications.setNotificationChannelAsync(CHANNELS.MEDICATION_ALARMS, {
      name: 'Alarmas de Medicación',
      description: 'Recordatorios críticos para la toma de medicamentos',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#4F46E5',
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: true,
    });

    // Standard channel for appointment reminders
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
 * Cancels all existing alarms for a medication and schedules new ones.
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
    await scheduleCustomRangeNotifications(medication, leadMinutes);
  } else {
    await scheduleRegularNotifications(medication, leadMinutes);
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

  const title = `Recordatorio: ${appointment.title}`;
  const body = 'Tu cita médica es en 1 hora.';

  if (AlarmNative.isAvailable()) {
    try {
      await AlarmNative.scheduleAlarm(appointment.id, reminderDate.getTime(), title, body);
      return;
    } catch (err) {
      console.warn('[MedicAI] Native alarm failed for appointment, falling back:', err);
    }
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
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
 * Cancels all scheduled expo-notifications and native alarms matching the given ID.
 * Uses cancelAlarmsForMedication to bulk-cancel all compound-ID native alarms
 * (format: id_timestamp) that belong to this medication/appointment.
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
      // Non-critical — expo-notification entries already removed above
    }
  }
}

/**
 * Reschedules a dismissed notification 15 minutes from now.
 */
export async function snoozeNotification(
  notificationData: Notifications.NotificationContent,
): Promise<void> {
  const snoozeDate = new Date(Date.now() + 15 * 60_000);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `[Pospuesto] ${notificationData.title ?? 'Medicamento'}`,
      body: notificationData.body ?? 'Recuerda tomar tu medicamento.',
      data: notificationData.data,
      categoryIdentifier:
        notificationData.categoryIdentifier ?? NOTIFICATION_CATEGORIES.MEDICATION,
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
 * Re-schedules active medications that have no pending scheduled notifications.
 *
 * Call this on every app launch after medications are loaded.
 * This recovers from device reboots, which clear Android AlarmManager entries.
 * On iOS, local notifications survive reboots automatically, but calling this
 * function is still safe (it will find existing entries and skip rescheduling).
 */
export async function rescheduleMedicationsAfterLaunch(
  medications: MedicationScheduleInput[],
): Promise<void> {
  const active = medications.filter(m => m.active);
  if (!active.length) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledIds = new Set(
    scheduled
      .map(n => n.content.data?.id)
      .filter((id): id is string => typeof id === 'string'),
  );

  for (const med of active) {
    if (!scheduledIds.has(med.id)) {
      // No notifications found for this medication — likely lost after reboot
      await scheduleMedicationNotifications(med);
    }
  }
}
