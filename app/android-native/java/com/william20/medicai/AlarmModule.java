package com.william20.medicai;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

import java.util.Date;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import org.json.JSONObject;

public class AlarmModule extends ReactContextBaseJavaModule {
    public AlarmModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "AlarmModule";
    }

    @ReactMethod
    public void scheduleAlarm(String id, double timestampMs, String title, String body, Promise promise) {
        Log.d("MedicAI-Alarm", "scheduleAlarm called: id=" + id + ", time=" + (long) timestampMs + ", title=" + title);
        try {
            Date when = new Date((long) timestampMs);
            AlarmScheduler.scheduleExactAlarm(getReactApplicationContext(), id, when, title, body);
            Log.d("MedicAI-Alarm", "scheduleAlarm SUCCESS: id=" + id + ", triggerAt=" + when.toString());
            // persist alarm info so BootReceiver can re-schedule after reboot
            try {
                SharedPreferences prefs = getReactApplicationContext().getSharedPreferences("MedicAI_alarms", Context.MODE_PRIVATE);
                JSONObject obj = new JSONObject();
                obj.put("id", id);
                obj.put("timestamp", (long) timestampMs);
                obj.put("title", title);
                obj.put("body", body);
                prefs.edit().putString("alarm_" + id, obj.toString()).apply();
            } catch (Exception ex) {
                Log.w("MedicAI-Alarm", "Failed to persist alarm to SharedPreferences: " + ex.getMessage());
            }
            promise.resolve("scheduled");
        } catch (Exception e) {
            Log.e("MedicAI-Alarm", "scheduleAlarm FAILED: id=" + id + ", error=" + e.getMessage(), e);
            promise.reject("schedule_alarm_failed", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void cancelAlarm(String id, Promise promise) {
        try {
            AlarmScheduler.cancelAlarm(getReactApplicationContext(), id);
            try {
                SharedPreferences prefs = getReactApplicationContext().getSharedPreferences("MedicAI_alarms", Context.MODE_PRIVATE);
                prefs.edit().remove("alarm_" + id).apply();
            } catch (Exception ex) {
                // non-fatal
            }
            promise.resolve("cancelled");
        } catch (Exception e) {
            promise.reject("cancel_alarm_failed", e.getMessage(), e);
        }
    }

    /**
     * Cancels ALL alarms whose persisted key starts with the given medication ID prefix.
     * This handles compound IDs (format: medicationId_timestamp) used for multiple daily doses.
     */
    @ReactMethod
    public void cancelAlarmsForMedication(String medicationId, Promise promise) {
        try {
            SharedPreferences prefs = getReactApplicationContext().getSharedPreferences("MedicAI_alarms", Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            int cancelledCount = 0;

            for (String key : prefs.getAll().keySet()) {
                if (key != null && (key.equals("alarm_" + medicationId) || key.startsWith("alarm_" + medicationId + "_"))) {
                    // Extract the alarm ID from the key (remove "alarm_" prefix)
                    String alarmId = key.substring(6);
                    try {
                        AlarmScheduler.cancelAlarm(getReactApplicationContext(), alarmId);
                    } catch (Exception ex) {
                        Log.w("MedicAI-Alarm", "Failed to cancel alarm for key=" + key + ": " + ex.getMessage());
                    }
                    editor.remove(key);
                    cancelledCount++;
                }
            }

            editor.apply();
            Log.d("MedicAI-Alarm", "cancelAlarmsForMedication: cancelled " + cancelledCount + " alarms for " + medicationId);
            promise.resolve(cancelledCount);
        } catch (Exception e) {
            promise.reject("cancel_alarms_failed", e.getMessage(), e);
        }
    }
}
