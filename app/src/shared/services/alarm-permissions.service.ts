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
   * Always null on iOS (not applicable) and when it cannot be determined.
   * NOTE: This cannot be read programmatically from managed Expo JS.
   *       Always recommend the user to exempt the app on Android.
   */
  batteryOptimizationExempted: null;
  /** True when the minimum permissions for reliable alarm delivery are met. */
  isAlarmReady: boolean;
  /** True on Android when the user should be guided to exempt from battery optimisation. */
  shouldPromptBatteryOptimization: boolean;
};

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
      batteryOptimizationExempted: null,
      isAlarmReady: true,
      shouldPromptBatteryOptimization: false,
    };
  }

  const { status, ios } = await Notifications.getPermissionsAsync();

  const notifications: PermissionLevel =
    status === 'granted'
      ? 'granted'
      : status === 'undetermined'
        ? 'undetermined'
        : 'denied';

  // iOS Critical Alerts
  const criticalAlerts: PermissionLevel =
    Platform.OS !== 'ios'
      ? 'unavailable'
      : ios?.allowsCriticalAlerts === true
        ? 'granted'
        : notifications === 'undetermined'
          ? 'undetermined'
          : 'denied';

  // Android 12+ exact alarms (API 31+)
  // Cannot be read from JS in managed Expo — AlarmScheduler handles the native fallback.
  // We mark as 'undetermined' on affected versions so the UI can surface guidance.
  const exactAlarms: PermissionLevel =
    Platform.OS !== 'android'
      ? 'unavailable'
      : Platform.Version < 31
        ? 'unavailable'
        : 'undetermined'; // Native layer resolves; we guide user to settings

  const isAlarmReady = notifications === 'granted';
  const shouldPromptBatteryOptimization = Platform.OS === 'android';

  return {
    notifications,
    criticalAlerts,
    exactAlarms,
    batteryOptimizationExempted: null,
    isAlarmReady,
    shouldPromptBatteryOptimization,
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

  return status === 'granted' ? 'granted' : status === 'undetermined' ? 'undetermined' : 'denied';
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
 * Android: attempts to directly request battery-optimisation exemption.
 * Uses ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS which opens a system dialog.
 * Requires android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS in the manifest
 * (declared in app.json).
 * Falls back to openBatteryOptimizationSettings() if unavailable.
 */
export async function requestBatteryOptimizationExemption(
  appPackage: string,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Linking.openURL(`package:${appPackage}`);
  } catch {
    await openBatteryOptimizationSettings();
  }
}
