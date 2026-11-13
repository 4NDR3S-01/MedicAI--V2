/**
 * Alarm Permissions Service — MedicAI
 *
 * Centralises all permission checks and system-settings navigation for the
 * alarm and notification stack. Covers:
 *  - Notification permission (both platforms)
 *  - Critical Alerts (iOS — requires Apple entitlement)
 *  - Exact-alarm permission (Android 12 / API 31+)
 *  - Battery-optimisation exemption (Android)
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Linking, Platform } from 'react-native';

import AlarmEnvironmentNative from '../native/AlarmEnvironmentNative';

type NotificationPermissionsResponse = Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;
type IosNotificationPermissions = NotificationPermissionsResponse['ios'];

// ─── Types ────────────────────────────────────────────────────────────────────

export type PermissionLevel = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export type AlarmPermissionsStatus = {
  /** Can the app show any notifications at all? */
  notifications: PermissionLevel;
  /**
   * iOS only — can the app play sound even in silent / DND mode?
   * Always 'unavailable' on Android.
   * Requires the com.apple.developer.usernotifications.critical-alerts entitlement
   * (configured in app.json) and Apple approval for App Store distribution.
   */
  criticalAlerts: PermissionLevel;
  /**
   * Android 12+ (API 31+) only — can the app schedule exact-time alarms?
   * Always 'unavailable' on iOS and Android < 12.
   * If 'denied', AlarmScheduler falls back to inexact alarms (±few minutes drift).
   */
  exactAlarms: PermissionLevel;
  /**
   * Android only — is the app exempted from Doze / battery optimisation?
   * True means the app is already exempted or the platform does not apply it.
   * False means the user should be guided to the battery optimisation screen.
   * Null means the state could not be read safely.
   */
  batteryOptimizationExempted: boolean | null;
  /** True when the minimum permissions for reliable alarm delivery are met. */
  isAlarmReady: boolean;
  /** True on Android when the user should be guided to exempt from battery optimisation. */
  shouldPromptBatteryOptimization: boolean;
  /** True on Android 12+ when the user should be guided to grant exact alarms. */
  shouldPromptExactAlarmPermission: boolean;
  /**
   * Android 14+ (API 34+) only — can the app use full-screen intents?
   * Required for alarm to show over lockscreen.
   * Always 'unavailable' on iOS and Android < 14.
   */
  fullScreenIntent: PermissionLevel;
  /** True on Android 14+ when the user should grant full-screen intent permission. */
  shouldPromptFullScreenIntent: boolean;
  /**
   * Android only — the user silenced MedicAI's alarm channel in system settings
   * (notifications stay on, but alarms would not sound).
   */
  alarmChannelBlocked: boolean;
};

const toPermissionLevel = (status: string): PermissionLevel => {
  if (status === 'granted') return 'granted';
  if (status === 'undetermined') return 'undetermined';
  return 'denied';
};

const getCriticalAlertsStatus = (
  notifications: PermissionLevel,
  ios: IosNotificationPermissions,
): PermissionLevel => {
  if (Platform.OS !== 'ios') return 'unavailable';
  if (ios?.allowsCriticalAlerts === true) return 'granted';
  if (notifications === 'undetermined') return 'undetermined';
  return 'denied';
};

const getExactAlarmsStatus = async (): Promise<PermissionLevel> => {
  if (Platform.OS !== 'android') return 'unavailable';
  if (Platform.Version < 31) return 'unavailable';

  const canScheduleExact = await AlarmEnvironmentNative.canScheduleExactAlarms();
  if (canScheduleExact === true) return 'granted';
  if (canScheduleExact === false) return 'denied';
  return 'undetermined';
};

const getBatteryOptimizationStatus = async (): Promise<boolean | null> => {
  if (Platform.OS !== 'android') return true;
  return AlarmEnvironmentNative.isIgnoringBatteryOptimizations();
};

const shouldPromptBatteryOptimization = (batteryOptimizationExempted: boolean | null): boolean =>
  Platform.OS === 'android' && batteryOptimizationExempted === false;

const shouldPromptExactAlarmPermission = (exactAlarms: PermissionLevel): boolean =>
  Platform.OS === 'android' && exactAlarms === 'denied';

const getFullScreenIntentStatus = async (): Promise<PermissionLevel> => {
  if (Platform.OS !== 'android') return 'unavailable';
  if (Platform.Version < 34) return 'unavailable';

  const canUse = await AlarmEnvironmentNative.canUseFullScreenIntent();
  if (canUse === true) return 'granted';
  if (canUse === false) return 'denied';
  return 'undetermined';
};

/**
 * Canales que hacen sonar las tomas: el del servicio nativo de alarmas y el de
 * expo-notifications (respaldo). Un canal que aún no existe no cuenta como bloqueado.
 */
const ALARM_CHANNEL_IDS = ['medicai_alarm_channel', 'medicai_medication_alarms'];

const isAlarmChannelBlocked = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return false;
  try {
    const channels = await Promise.all(ALARM_CHANNEL_IDS.map((id) => Notifications.getNotificationChannelAsync(id)));
    return channels.some((channel) => channel?.importance === Notifications.AndroidImportance.NONE);
  } catch {
    return false;
  }
};

const shouldPromptFullScreenIntent = (fullScreenIntent: PermissionLevel): boolean =>
  Platform.OS === 'android' && fullScreenIntent === 'denied';

const isAlarmReady = (
  notifications: PermissionLevel,
  exactAlarms: PermissionLevel,
  batteryOptimizationExempted: boolean | null,
  fullScreenIntentLevel: PermissionLevel,
  alarmChannelBlocked: boolean,
): boolean =>
  notifications === 'granted' &&
  !alarmChannelBlocked &&
  (Platform.OS !== 'android' || exactAlarms !== 'denied') &&
  (Platform.OS !== 'android' || fullScreenIntentLevel !== 'denied') &&
  !shouldPromptBatteryOptimization(batteryOptimizationExempted);

// ─── Status query ─────────────────────────────────────────────────────────────

/**
 * Returns the current alarm-permission status for the device.
 * Safe to call repeatedly — reads live OS state each time.
 */
export async function getAlarmPermissionsStatus(): Promise<AlarmPermissionsStatus> {
  if (!Device.isDevice) {
    // Simulators / emulators — treat as fully granted for development
    return {
      notifications: 'granted',
      criticalAlerts: 'unavailable',
      exactAlarms: 'unavailable',
      batteryOptimizationExempted: true,
      isAlarmReady: true,
      shouldPromptBatteryOptimization: false,
      shouldPromptExactAlarmPermission: false,
      fullScreenIntent: 'unavailable',
      shouldPromptFullScreenIntent: false,
      alarmChannelBlocked: false,
    };
  }

  const { status, ios } = await Notifications.getPermissionsAsync();
  const notifications = toPermissionLevel(status);
  const criticalAlerts = getCriticalAlertsStatus(notifications, ios);
  const exactAlarms = await getExactAlarmsStatus();
  const batteryOptimizationExempted = await getBatteryOptimizationStatus();
  const fullScreenIntent = await getFullScreenIntentStatus();
  const alarmChannelBlocked = await isAlarmChannelBlocked();

  const shouldPromptBatteryOptimizationFlag = shouldPromptBatteryOptimization(batteryOptimizationExempted);
  const shouldPromptExactAlarmPermissionFlag = shouldPromptExactAlarmPermission(exactAlarms);
  const shouldPromptFullScreenIntentFlag = shouldPromptFullScreenIntent(fullScreenIntent);
  const isAlarmReadyFlag = isAlarmReady(notifications, exactAlarms, batteryOptimizationExempted, fullScreenIntent, alarmChannelBlocked);

  return {
    notifications,
    criticalAlerts,
    exactAlarms,
    batteryOptimizationExempted,
    isAlarmReady: isAlarmReadyFlag,
    shouldPromptBatteryOptimization: shouldPromptBatteryOptimizationFlag,
    shouldPromptExactAlarmPermission: shouldPromptExactAlarmPermissionFlag,
    fullScreenIntent,
    shouldPromptFullScreenIntent: shouldPromptFullScreenIntentFlag,
    alarmChannelBlocked,
  };
}

// ─── Permission requests ──────────────────────────────────────────────────────

/**
 * Requests notification permission (and Critical Alerts on iOS).
 * Returns the resulting status — does NOT throw on denial.
 */
export async function requestNotificationPermission(): Promise<PermissionLevel> {
  if (!Device.isDevice) return 'granted';

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowCriticalAlerts: true,
      allowProvisional: false,
    },
  });

  return toPermissionLevel(status);
}

// ─── Settings navigation ──────────────────────────────────────────────────────

/** Opens the OS notification settings for the app (both platforms). */
export async function openNotificationSettings(): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
    } else {
      await Linking.openSettings();
    }
  } catch {
    // Fallback — openSettings() is always available
    await Linking.openSettings();
  }
}

/**
 * Android 12+ (API 31+): opens the system screen where the user can grant
 * exact-alarm permission to MedicAI.
 */
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    // ACTION_REQUEST_SCHEDULE_EXACT_ALARM (API 31+)
    await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
  } catch {
    await Linking.openSettings();
  }
}

/**
 * Android 14+ (API 34+): opens the system settings screen where the user
 * can grant USE_FULL_SCREEN_INTENT permission. Required for alarm to show
 * over lockscreen as a full-screen activity.
 */
export async function openFullScreenIntentSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const opened = await AlarmEnvironmentNative.openFullScreenIntentSettings();
  if (!opened) {
    await Linking.openSettings();
  }
}

/**
 * Android: opens the battery-optimisation settings list so the user can
 * add MedicAI to the "unrestricted / not optimised" list.
 * This is the most reliable way to ensure alarm delivery on OEM devices
 * (Samsung One UI, MIUI, ColorOS, etc.) that aggressively kill background apps.
 */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const openedDirectPrompt = await AlarmEnvironmentNative.requestIgnoreBatteryOptimizations();
  if (openedDirectPrompt) return;

  try {
    // Opens the per-app battery usage page — most direct path on most OEMs
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  } catch {
    await Linking.openSettings();
  }
}

/**
 * Android: opens the battery-optimisation settings so the user can exempt the app.
 * Falls back safely if the system intent is unavailable.
 */
export async function requestBatteryOptimizationExemption(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await openBatteryOptimizationSettings();
  } catch {
    await openBatteryOptimizationSettings();
  }
}

// ─── OEM autostart (MIUI, One UI, ColorOS, Funtouch, EMUI, etc.) ────────────

const OEM_AUTOSTART_MANUFACTURERS = [
  'xiaomi',
  'oppo',
  'realme',
  'vivo',
  'iqoo',
  'huawei',
  'honor',
  'samsung',
  'oneplus',
  'asus',
  'meizu',
];

/**
 * Returns the device manufacturer in lowercase, or null if unavailable.
 */
export async function getDeviceManufacturer(): Promise<string | null> {
  return AlarmEnvironmentNative.getManufacturer();
}

/**
 * Returns true if the device is from an OEM that requires autostart permission
 * for background alarm delivery (Xiaomi/MIUI, OPPO/ColorOS, Vivo, Huawei/Honor).
 */
export async function isOemAutostartRequired(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const manufacturer = await AlarmEnvironmentNative.getManufacturer();
  if (!manufacturer) return false;
  return OEM_AUTOSTART_MANUFACTURERS.includes(manufacturer);
}

/**
 * Attempts to open the OEM-specific autostart settings.
 * Returns true if the settings screen was opened, false otherwise.
 */
export async function openAutostartSettings(): Promise<boolean> {
  const opened = await AlarmEnvironmentNative.openAutostartSettings();
  if (opened) return true;

  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}
