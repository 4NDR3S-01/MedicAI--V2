package com.william20.medicai;

import android.app.AlarmManager;
import android.content.Context;
import android.os.Build;
import android.os.PowerManager;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class AlarmEnvironmentModule extends ReactContextBaseJavaModule {
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
}
