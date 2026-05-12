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
import { Alert, AppState, Linking, Platform } from 'react-native';

import AlarmEnvironmentNative from '../native/AlarmEnvironmentNative';
import { appStorage as _appStorage } from '../storage';

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

const shouldPromptFullScreenIntent = (fullScreenIntent: PermissionLevel): boolean =>
  Platform.OS === 'android' && fullScreenIntent === 'denied';

const isAlarmReady = (
  notifications: PermissionLevel,
  exactAlarms: PermissionLevel,
  batteryOptimizationExempted: boolean | null,
  fullScreenIntentLevel: PermissionLevel,
): boolean =>
  notifications === 'granted' &&
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
    };
  }

  const { status, ios } = await Notifications.getPermissionsAsync();
  const notifications = toPermissionLevel(status);
  const criticalAlerts = getCriticalAlertsStatus(notifications, ios);
  const exactAlarms = await getExactAlarmsStatus();
  const batteryOptimizationExempted = await getBatteryOptimizationStatus();
  const fullScreenIntent = await getFullScreenIntentStatus();

  const shouldPromptBatteryOptimizationFlag = shouldPromptBatteryOptimization(batteryOptimizationExempted);
  const shouldPromptExactAlarmPermissionFlag = shouldPromptExactAlarmPermission(exactAlarms);
  const shouldPromptFullScreenIntentFlag = shouldPromptFullScreenIntent(fullScreenIntent);
  const isAlarmReadyFlag = isAlarmReady(notifications, exactAlarms, batteryOptimizationExempted, fullScreenIntent);

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

// ─── Contextual permission flow (blocking gate) ─────────────────────────────

const BATTERY_PROMPTED_KEY = 'medicai_battery_opt_prompted_v1';
const AUTOSTART_PROMPTED_KEY = 'medicai_autostart_prompted_v1';

export type EnsurePermissionsResult = {
  /** True if ALL critical permissions are granted and alarms will work reliably. */
  ready: boolean;
  /** The full permission status snapshot after the flow completes. */
  status: AlarmPermissionsStatus;
};

// Promisified Alert.alert — resolves with the button index the user tapped.
const showAlertAsync = (
  title: string,
  message: string,
  buttons: { text: string; style?: 'cancel' | 'destructive' | 'default' }[],
): Promise<number> =>
  new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      buttons.map((b, i) => ({ ...b, onPress: () => resolve(i) })),
      { cancelable: false },
    );
  });

// Waits for the user to return from system settings by listening to AppState.
// Resolves once the app comes back to 'active' (max 60 s timeout).
const waitForReturnFromSettings = (): Promise<void> =>
  new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      sub.remove();
      clearTimeout(timer);
      resolve();
    };
    const sub = AppState.addEventListener('change', (state: string) => {
      if (state === 'active') done();
    });
    const timer = setTimeout(done, 60_000);
  });

/**
 * Blocking permission gate — call before scheduling alarms.
 *
 * Walks through each critical permission one-by-one:
 *  1. Notifications (programmatic request)
 *  2. Exact alarms (Android 12+) — settings redirect + re-check
 *  3. Full-screen intent (Android 14+) — settings redirect + re-check
 *  4. Battery optimization (Android) — settings redirect, once per install
 *  5. OEM autostart (Xiaomi/OPPO/etc.) — settings redirect, once per install
 *
 * For each missing permission the user sees ONE alert with "Configurar" / "Cancelar".
 * - "Configurar": opens system settings, waits for the user to return, re-checks.
 * - "Cancelar": stops the entire flow → returns { ready: false }.
 *
 * Permissions already granted are silently skipped.
 * Persistent flags (battery/autostart) are checked so we never re-ask after the
 * user has already been prompted once per installation.
 *
 * Returns `ready: true` only when ALL applicable permissions are satisfied.
 */
export async function ensureAlarmPermissions(): Promise<EnsurePermissionsResult> {
  // ── 1. Notifications (programmatic) ────────────────────────────────────────
  let notifLevel = await requestNotificationPermission();
  if (notifLevel !== 'granted') {
    const btn = await showAlertAsync(
      'Permiso de notificaciones',
      'MedicAI necesita permiso de notificaciones para enviar recordatorios de medicamentos.',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Abrir Configuración' }],
    );
    if (btn === 1) {
      await openNotificationSettings();
      await waitForReturnFromSettings();
      notifLevel = await requestNotificationPermission();
    }
    if (notifLevel !== 'granted') {
      return { ready: false, status: await getAlarmPermissionsStatus() };
    }
  }

  // ── 2. Exact alarms (Android 12+) ─────────────────────────────────────────
  let status = await getAlarmPermissionsStatus();
  if (status.shouldPromptExactAlarmPermission) {
    const btn = await showAlertAsync(
      'Alarmas exactas',
      'MedicAI necesita permiso para programar alarmas exactas y recordarte tus medicamentos a la hora precisa.',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Configurar' }],
    );
    if (btn === 1) {
      await openExactAlarmSettings();
      await waitForReturnFromSettings();
      status = await getAlarmPermissionsStatus();
    }
    if (status.shouldPromptExactAlarmPermission) {
      return { ready: false, status };
    }
  }

  // ── 3. Full-screen intent (Android 14+) ───────────────────────────────────
  status = await getAlarmPermissionsStatus();
  if (status.shouldPromptFullScreenIntent) {
    const btn = await showAlertAsync(
      'Pantalla completa',
      'Para que la alarma aparezca sobre la pantalla de bloqueo como una alarma real, MedicAI necesita el permiso de "Pantalla completa".',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Configurar' }],
    );
    if (btn === 1) {
      await openFullScreenIntentSettings();
      await waitForReturnFromSettings();
      status = await getAlarmPermissionsStatus();
    }
    if (status.shouldPromptFullScreenIntent) {
      return { ready: false, status };
    }
  }

  // ── 4. Battery optimization (Android) — once per installation ─────────────
  status = await getAlarmPermissionsStatus();
  if (status.shouldPromptBatteryOptimization) {
    const alreadyPrompted = await _appStorage.getItem(BATTERY_PROMPTED_KEY);
    if (!alreadyPrompted) {
      const btn = await showAlertAsync(
        'Optimización de batería',
        'Para que las alarmas suenen en segundo plano, MedicAI necesita estar excluida de la optimización de batería.',
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Configurar' }],
      );
      void _appStorage.setItem(BATTERY_PROMPTED_KEY, 'true');
      if (btn === 1) {
        await openBatteryOptimizationSettings();
        await waitForReturnFromSettings();
      }
      // We don't block on this — no reliable API to verify on all OEMs.
    }
  }

  // ── 5. OEM autostart — once per installation ──────────────────────────────
  const needsAutostart = await isOemAutostartRequired();
  if (needsAutostart) {
    const alreadyPrompted = await _appStorage.getItem(AUTOSTART_PROMPTED_KEY);
    if (!alreadyPrompted) {
      const btn = await showAlertAsync(
        'Inicio automático',
        'Tu dispositivo necesita que MedicAI tenga permiso de inicio automático para que las alarmas funcionen con la app cerrada.',
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Configurar' }],
      );
      void _appStorage.setItem(AUTOSTART_PROMPTED_KEY, 'true');
      if (btn === 1) {
        await openAutostartSettings();
        await waitForReturnFromSettings();
      }
      // We don't block on this — no API to verify actual status.
    }
  }

  // ── Final check ───────────────────────────────────────────────────────────
  const finalStatus = await getAlarmPermissionsStatus();
  return { ready: finalStatus.isAlarmReady, status: finalStatus };
}

// ─── OEM autostart (MIUI, OPPO, Vivo, Huawei, etc.) ─────────────────────────

const OEM_AUTOSTART_MANUFACTURERS = ['xiaomi', 'oppo', 'vivo', 'huawei', 'honor'];

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
  return AlarmEnvironmentNative.openAutostartSettings();
}
