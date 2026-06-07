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
import {
  type MedicationLog,
  logMedicationAction,
  fetchMedicationLogs,
} from '../../features/tabs/services/medications.service';

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
const MAX_SCHEDULED = 500;
const IOS_MAX_SCHEDULED = 64;
const LOOKAHEAD_DAYS = 30;
const SNOOZE_MINUTES = 10;
const APPOINTMENT_SNOOZE_MINUTES = 10;

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
        scheduledFor: triggerDate.toISOString(),
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
        scheduledFor: triggerDate.toISOString(),
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
  maxSlots: number,
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
  while (next <= endDate && count < maxSlots) {
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
  maxSlots: number,
): Promise<void> => {
  if (!medication.times?.length) return;

  const now = new Date();
  let count = 0;

  for (const timeStr of medication.times) {
    const parsed = parseTime(timeStr);
    if (!parsed) continue;

    for (let day = 0; day < LOOKAHEAD_DAYS; day += 1) {
      if (count >= maxSlots) break;

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

    if (count >= maxSlots) break;
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

const formatLeadMinutes = (minutes: number): string => {
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

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  if (Platform.OS === 'ios' && scheduled.length >= IOS_MAX_SCHEDULED) {
    console.warn('[MedicAI] iOS notification limit reached (' + IOS_MAX_SCHEDULED + '), aborting schedule for', medication.id);
    return;
  }

  const remainingSlots = Platform.OS === 'ios' ? IOS_MAX_SCHEDULED - scheduled.length : MAX_SCHEDULED;

  const leadMinutes = await getMedicationReminderLeadMinutes();

  if (hasCustomRange(medication)) {
    await scheduleCustomRangeAlarms(medication, leadMinutes, remainingSlots);
  } else {
    await scheduleRegularAlarms(medication, leadMinutes, remainingSlots);
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
  if (Number.isNaN(appointmentDate.getTime()) || appointmentDate.getTime() <= Date.now()) return;

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
      data: { id: medicationId, type: SCHEDULE_TYPES.DOSE_ALARM, scheduledFor: snoozeDate.toISOString() },
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

const isToday = (date: Date): boolean => {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
};

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

  const hasDoseAlarmScheduled = (medId: string): boolean =>
    scheduled.some(n =>
      n.content.data?.id === medId
      && n.content.data?.type === SCHEDULE_TYPES.DOSE_ALARM);

  for (const med of active) {
    if (!hasDoseAlarmScheduled(med.id)) {
      console.log('[MedicAI] rescheduleMedicationsAfterLaunch: missing dose alarms for', med.id, '— re-scheduling');
      await scheduleMedicationNotifications(med);
    }
  }
}

export async function rescheduleAppointmentsAfterLaunch(
  appointments: Array<{
    id: string;
    title: string;
    doctorName?: string | null;
    scheduledAt: string;
    active?: boolean;
    attendanceStatus?: 'PENDING' | 'ATTENDED' | 'MISSED';
  }>,
): Promise<void> {
  const active = appointments.filter((appointment) => appointment.active !== false);
  if (!active.length) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const hasAppointmentReminderScheduled = (appointmentId: string): boolean =>
    scheduled.some(n =>
      n.content.data?.id === appointmentId
      && n.content.data?.type === 'APPOINTMENT');

  for (const appointment of active) {
    if (appointment.attendanceStatus && appointment.attendanceStatus !== 'PENDING') continue;

    const appointmentDate = new Date(appointment.scheduledAt);
    if (Number.isNaN(appointmentDate.getTime()) || appointmentDate.getTime() <= Date.now()) continue;
    if (!hasAppointmentReminderScheduled(appointment.id)) {
      console.log('[MedicAI] rescheduleAppointmentsAfterLaunch: missing reminder for', appointment.id, '- re-scheduling');
      await scheduleAppointmentReminder(appointment);
    }
  }
}

/**
 * Detects timezone changes since the last known recording and, when a change
 * is detected, re-schedules alarms for ALL active medications so that dose
 * times remain correct at the user's new local time.
 */
export async function detectTimezoneChangeAndReschedule(
  medications: MedicationScheduleInput[],
): Promise<boolean> {
  const TZ_STORAGE_KEY = 'medicai_last_known_timezone_v1';
  const currentTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const lastTz = await appStorage.getItem(TZ_STORAGE_KEY);
  await appStorage.setItem(TZ_STORAGE_KEY, currentTz);

  if (!lastTz || lastTz === currentTz) return false;

  console.log(`[MedicAI] Timezone changed from ${lastTz} to ${currentTz} — re-scheduling all alarms`);

  for (const med of medications) {
    await scheduleMedicationNotifications(med);
  }

  return true;
}

/**
 * Reconciles missed doses for all active medications by checking today's
 * past dose times against the existing MedicationLog records.
 *
 * If a scheduled dose time has already passed and no TAKEN or SKIPPED log
 * exists for it, the dose is automatically logged as SKIPPED.
 *
 * Call this once on app launch after medications are loaded and
 * pending alarm actions have been processed.
 */
export async function reconcileMissedDoses(
  medications: MedicationScheduleInput[],
  accessToken: string,
): Promise<void> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  for (const med of medications) {
    if (!med.active) continue;
    if (!med.times || med.times.length === 0) continue;

    let logs: MedicationLog[] = [];
    try {
      logs = await fetchMedicationLogs(med.id, accessToken);
    } catch {
      continue;
    }

    const todayLogs = logs.filter(l => l.scheduledFor
      ? new Date(l.scheduledFor).toISOString().slice(0, 10) === todayStr
      : false);

    for (const timeStr of med.times) {
      const parsed = parseTime(timeStr);
      if (!parsed) continue;

      const doseDate = new Date(now);
      doseDate.setHours(parsed.hour, parsed.minute, 0, 0);

      if (doseDate.getTime() > now.getTime()) continue;

      const alreadyLogged = todayLogs.some(l => {
        if (!l.scheduledFor) return false;
        const logDate = new Date(l.scheduledFor);
        return logDate.getHours() === parsed.hour
          && logDate.getMinutes() === parsed.minute;
      });

      if (!alreadyLogged) {
        try {
          const scheduledFor = doseDate.toISOString();
          await logMedicationAction(med.id, accessToken, 'SKIPPED', scheduledFor);
          console.log(`[MedicAI] reconcileMissedDoses: auto-marked SKIPPED for ${med.name} at ${timeStr}`);
        } catch (err) {
          console.warn(`[MedicAI] reconcileMissedDoses: failed for ${med.id} at ${timeStr}:`, err);
        }
      }
    }
  }
}
