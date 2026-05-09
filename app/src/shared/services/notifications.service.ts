import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

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
  times: string[];
  active: boolean;
}) {
  // First, cancel any existing notifications for this medication
  await cancelNotificationsByDataId(medication.id);

  if (!medication.active || !medication.times || medication.times.length === 0) return;

  for (const timeStr of medication.times) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // We use a recurring Daily trigger for each time
    // This is more reliable for "alarms" than intervals
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Alarma de Medicación: ${medication.name}`,
        body: `Es hora de tu dosis: ${medication.dosage}`,
        data: { id: medication.id, type: 'MEDICATION', action: 'REMINDER' },
        categoryIdentifier: NOTIFICATION_CATEGORIES.MEDICATION,
        sound: true, // This will use the channel's sound
      },
      trigger: {
        hour: hours,
        minute: minutes,
        repeats: true,
      },
    });
    
    // If it's a "Cada 8 horas" or similar, we might need to calculate the offsets
    // But since the user wants to "configurar horarios", it's better if they provide all times.
  }
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
    trigger: snoozeDate,
  });
}
