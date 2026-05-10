import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { appStorage } from '../storage';

export const NOTIFICATION_CATEGORIES = {
  MEDICATION: 'MEDICATION_ACTION',
  APPOINTMENT: 'APPOINTMENT_REMINDER',
};

export const NOTIFICATION_ACTIONS = {
  TAKE: 'TAKE_ACTION',
  SNOOZE: 'SNOOZE_ACTION',
  SKIP: 'SKIP_ACTION',
  CONFIRM_APPOINTMENT: 'CONFIRM_APPOINTMENT_ACTION',
};

const MEDICATION_REMINDER_LEAD_MINUTES_KEY = 'medicai_medication_reminder_lead_minutes_v1';
const DEFAULT_REMINDER_LEAD_MINUTES = 0;

const MAX_SCHEDULED_NOTIFICATIONS = 500;
const REGULAR_LOOKAHEAD_DAYS = 30;

const parseTime = (time: string): { hour: number; minute: number } | null => {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
};

const applyLeadMinutes = (date: Date, leadMinutes: number) => {
  if (leadMinutes <= 0) {
    return date;
  }
  return new Date(date.getTime() - leadMinutes * 60 * 1000);
};

const scheduleMedicationNotificationAt = async (
  medication: {
    id: string;
    name: string;
    dosage: string;
  },
  triggerDate: Date,
  isReminderBeforeDose: boolean,
) => {
  if (triggerDate.getTime() <= Date.now()) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Alarma de Medicación: ${medication.name}`,
      body: isReminderBeforeDose
        ? `Tu dosis (${medication.dosage}) es en unos minutos.`
        : `Es hora de tu dosis: ${medication.dosage}`,
      data: {
        id: medication.id,
        type: 'MEDICATION',
        action: 'REMINDER',
        isReminderBeforeDose,
      },
      categoryIdentifier: NOTIFICATION_CATEGORIES.MEDICATION,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: 'default',
    },
  });
};

const hasCustomRangeConfig = (medication: {
  customIntervalHours?: number | null;
  customEndDate?: string | null;
}) => {
  return typeof medication.customIntervalHours === 'number'
    && medication.customIntervalHours > 0
    && typeof medication.customEndDate === 'string'
    && medication.customEndDate.length > 0;
};

const scheduleCustomRangeNotifications = async (
  medication: {
    id: string;
    name: string;
    dosage: string;
    firstDoseTime?: string | null;
    times: string[];
    customIntervalHours?: number | null;
    customEndDate?: string | null;
  },
  leadMinutes: number,
) => {
  const baseTime = medication.firstDoseTime || medication.times?.[0] || '00:00';
  const parsed = parseTime(baseTime);
  if (!parsed) return;

  const { hour, minute } = parsed;
  const intervalMs = medication.customIntervalHours! * 60 * 60 * 1000;
  const endDate = new Date(medication.customEndDate!);
  const now = new Date();

  const first = new Date(now);
  first.setHours(hour, minute, 0, 0);

  let next = first;
  while (next < now) {
    next = new Date(next.getTime() + intervalMs);
  }

  let scheduledCount = 0;
  while (next <= endDate && scheduledCount < MAX_SCHEDULED_NOTIFICATIONS) {
    const triggerDate = applyLeadMinutes(next, leadMinutes);
    await scheduleMedicationNotificationAt(medication, triggerDate, leadMinutes > 0);
    scheduledCount += 1;
    next = new Date(next.getTime() + intervalMs);
  }
};

const scheduleRegularMedicationNotifications = async (
  medication: {
    id: string;
    name: string;
    dosage: string;
    times: string[];
  },
  leadMinutes: number,
) => {
  if (!medication.times || medication.times.length === 0) {
    return;
  }

  const now = new Date();
  let scheduledCount = 0;

  for (const timeStr of medication.times) {
    const parsed = parseTime(timeStr);
    if (!parsed) {
      continue;
    }

    for (let dayOffset = 0; dayOffset < REGULAR_LOOKAHEAD_DAYS; dayOffset += 1) {
      if (scheduledCount >= MAX_SCHEDULED_NOTIFICATIONS) {
        break;
      }

      const doseDate = new Date(now);
      doseDate.setDate(now.getDate() + dayOffset);
      doseDate.setHours(parsed.hour, parsed.minute, 0, 0);

      const triggerDate = applyLeadMinutes(doseDate, leadMinutes);
      if (triggerDate.getTime() <= now.getTime()) {
        continue;
      }

      await scheduleMedicationNotificationAt(medication, triggerDate, leadMinutes > 0);
      scheduledCount += 1;
    }

    if (scheduledCount >= MAX_SCHEDULED_NOTIFICATIONS) {
      break;
    }
  }
};

export async function getMedicationReminderLeadMinutes() {
  const raw = await appStorage.getItem(MEDICATION_REMINDER_LEAD_MINUTES_KEY);
  if (!raw) {
    return DEFAULT_REMINDER_LEAD_MINUTES;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 120) {
    return DEFAULT_REMINDER_LEAD_MINUTES;
  }
  return parsed;
}

export async function setMedicationReminderLeadMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.min(120, Math.trunc(minutes)));
  await appStorage.setItem(MEDICATION_REMINDER_LEAD_MINUTES_KEY, String(safeMinutes));
}

// Initialize notification settings
export async function setupNotifications() {
  // Set handler for how to handle notifications when the app is in the foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  // Define categories for interactive notifications
  await Notifications.setNotificationCategoriesAsync([
    {
      identifier: NOTIFICATION_CATEGORIES.MEDICATION,
      actions: [
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
      ],
    },
    {
      identifier: NOTIFICATION_CATEGORIES.APPOINTMENT,
      actions: [
        {
          identifier: NOTIFICATION_ACTIONS.CONFIRM_APPOINTMENT,
          buttonTitle: 'Confirmar Asistencia',
          options: { opensAppToForeground: true },
        },
      ],
    },
  ]);
}

export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    // Skip for simulators but log it
    console.log('Must use physical device for push notifications');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return finalStatus;
}

/**
 * Schedules notifications for a medication based on its times and frequency.
 * Uses CalendarTrigger for daily precision (Real Alarms).
 */
export async function scheduleMedicationNotifications(medication: {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  firstDoseTime?: string | null;
  times: string[];
  customIntervalHours?: number | null;
  customEndDate?: string | null;
  active: boolean;
}) {
  // First, cancel any existing notifications for this medication
  await cancelNotificationsByDataId(medication.id);

  if (!medication.active) return;

  const permission = await registerForPushNotificationsAsync();
  if (permission !== 'granted') return;

  const leadMinutes = await getMedicationReminderLeadMinutes();

  if (hasCustomRangeConfig(medication)) {
    await scheduleCustomRangeNotifications(medication, leadMinutes);
    return;
  }

  await scheduleRegularMedicationNotifications(medication, leadMinutes);
}

/**
 * Schedules a reminder for an appointment (1 hour before).
 */
export async function scheduleAppointmentReminder(appointment: {
  id: string;
  title: string;
  scheduledAt: string;
}) {
  await cancelNotificationsByDataId(appointment.id);

  const appointmentDate = new Date(appointment.scheduledAt);
  const reminderDate = new Date(appointmentDate.getTime() - 60 * 60 * 1000); // 1 hour before

  const now = new Date();
  if (reminderDate < now) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Recordatorio de Cita: ${appointment.title}`,
      body: `Tu cita es en 1 hora.`,
      data: { id: appointment.id, type: 'APPOINTMENT' },
      categoryIdentifier: NOTIFICATION_CATEGORIES.APPOINTMENT,
    },
    trigger: reminderDate,
  });
}

/**
 * Cancels all scheduled notifications that match a specific ID in their data.
 */
export async function cancelNotificationsByDataId(id: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduled) {
    if (notification.content.data?.id === id) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
}

/**
 * Postpones a notification by 15 minutes.
 */
export async function snoozeNotification(notificationData: any) {
  const snoozeDate = new Date();
  snoozeDate.setMinutes(snoozeDate.getMinutes() + 15);

  await Notifications.scheduleNotificationAsync({
    content: {
      ...notificationData,
      title: `[POSPUESTO] ${notificationData.title}`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: snoozeDate,
      channelId: 'default',
    },
  });
}
