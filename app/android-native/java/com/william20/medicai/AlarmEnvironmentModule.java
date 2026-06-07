package com.william20.medicai;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class AlarmEnvironmentModule extends ReactContextBaseJavaModule {
    private static final String TAG = "MedicAI-Alarm";

    public AlarmEnvironmentModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "AlarmEnvironmentModule";
    }

    @ReactMethod
    public void isIgnoringBatteryOptimizations(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true);
                return;
            }

            PowerManager powerManager = (PowerManager) getReactApplicationContext().getSystemService(Context.POWER_SERVICE);
            boolean ignoring = powerManager != null
                && powerManager.isIgnoringBatteryOptimizations(getReactApplicationContext().getPackageName());
            promise.resolve(ignoring);
        } catch (Exception ex) {
            promise.reject("battery_optimization_check_failed", ex);
        }
    }

    @ReactMethod
    public void canScheduleExactAlarms(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                promise.resolve(true);
                return;
            }

            AlarmManager alarmManager = (AlarmManager) getReactApplicationContext().getSystemService(Context.ALARM_SERVICE);
            boolean canSchedule = alarmManager != null && alarmManager.canScheduleExactAlarms();
            promise.resolve(canSchedule);
        } catch (Exception ex) {
            promise.reject("exact_alarm_check_failed", ex);
        }
    }

    /**
     * Android 14+ (API 34+): checks if the app can use full-screen intents.
     * On older versions, this is always true (permission auto-granted).
     * On Android 14+, the user must explicitly grant USE_FULL_SCREEN_INTENT.
     */
    @ReactMethod
    public void canUseFullScreenIntent(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                promise.resolve(true);
                return;
            }

            NotificationManager nm = (NotificationManager)
                getReactApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);
            boolean can = nm != null && nm.canUseFullScreenIntent();
            promise.resolve(can);
        } catch (Exception ex) {
            promise.reject("full_screen_intent_check_failed", ex);
        }
    }

    /**
     * Android 14+ (API 34+): opens the system settings screen where the user
     * can grant USE_FULL_SCREEN_INTENT permission to this app.
     */
    @ReactMethod
    public void openFullScreenIntentSettings(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                    Uri.parse("package:" + getReactApplicationContext().getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getReactApplicationContext().startActivity(intent);
                promise.resolve(true);
            } else {
                promise.resolve(false);
            }
        } catch (Exception ex) {
            Log.w(TAG, "Failed to open full-screen intent settings: " + ex.getMessage());
            promise.resolve(false);
        }
    }

    /**
     * Opens Android's direct battery-optimisation exemption prompt for this app.
     * This is more reliable than sending the user to the generic settings list.
     */
    @ReactMethod
    public void requestIgnoreBatteryOptimizations(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true);
                return;
            }

            Context context = getReactApplicationContext();
            String packageName = context.getPackageName();
            PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (powerManager != null && powerManager.isIgnoringBatteryOptimizations(packageName)) {
                promise.resolve(true);
                return;
            }

            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + packageName));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            promise.resolve(true);
        } catch (Exception ex) {
            Log.w(TAG, "Failed to request battery optimization exemption: " + ex.getMessage());
            promise.resolve(false);
        }
    }

    /**
     * Returns the device manufacturer in lowercase (e.g. "xiaomi", "samsung", "oppo", "huawei").
     * Used by JS to detect OEM-specific restrictions that require user guidance.
     */
    @ReactMethod
    public void getManufacturer(Promise promise) {
        promise.resolve(Build.MANUFACTURER.toLowerCase());
    }

    /**
     * Attempts to open the OEM-specific autostart/background manager settings.
     * On MIUI (Xiaomi), this opens the Autostart manager where the user must enable
     * the app for alarms to fire when the app is killed.
     * Returns true if an intent was launched, false if no known OEM intent is available.
     */
    @ReactMethod
    public void openAutostartSettings(Promise promise) {
        try {
            String manufacturer = Build.MANUFACTURER.toLowerCase();
            Intent[] intents = new Intent[0];

            switch (manufacturer) {
                case "xiaomi":
                    intents = new Intent[]{
                        componentIntent("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
                        componentIntent("com.miui.securitycenter", "com.miui.powerkeeper.ui.HiddenAppsConfigActivity")
                    };
                    break;
                case "oppo":
                case "realme":
                    intents = new Intent[]{
                        componentIntent("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
                        componentIntent("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
                        componentIntent("com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity")
                    };
                    break;
                case "vivo":
                case "iqoo":
                    intents = new Intent[]{
                        componentIntent("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
                        componentIntent("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")
                    };
                    break;
                case "huawei":
                case "honor":
                    intents = new Intent[]{
                        componentIntent("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
                        componentIntent("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")
                    };
                    break;
                case "samsung":
                    intents = new Intent[]{
                        componentIntent("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"),
                        componentIntent("com.samsung.android.sm", "com.samsung.android.sm.battery.ui.BatteryActivity")
                    };
                    break;
                case "oneplus":
                    intents = new Intent[]{
                        componentIntent("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"),
                        componentIntent("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchActivity")
                    };
                    break;
                case "asus":
                    intents = new Intent[]{
                        componentIntent("com.asus.mobilemanager", "com.asus.mobilemanager.powersaver.PowerSaverSettings"),
                        componentIntent("com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity")
                    };
                    break;
                case "meizu":
                    intents = new Intent[]{
                        componentIntent("com.meizu.safe", "com.meizu.safe.security.SHOW_APPSEC")
                    };
                    break;
            }

            PackageManager pm = getReactApplicationContext().getPackageManager();
            for (Intent intent : intents) {
                if (intent != null && intent.resolveActivity(pm) != null) {
                    startIntent(intent);
                    Log.d(TAG, "Opened OEM settings for " + manufacturer);
                    promise.resolve(true);
                    return;
                }
            }

            Log.w(TAG, "No OEM settings intent resolvable for " + manufacturer);
            promise.resolve(false);
        } catch (Exception ex) {
            Log.w(TAG, "Failed to open autostart settings: " + ex.getMessage());
            promise.resolve(false);
        }
    }

    private Intent componentIntent(String packageName, String className) {
        Intent intent = new Intent();
        intent.setComponent(new ComponentName(packageName, className));
        return intent;
    }

    private void startIntent(Intent intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getReactApplicationContext().startActivity(intent);
    }
}
