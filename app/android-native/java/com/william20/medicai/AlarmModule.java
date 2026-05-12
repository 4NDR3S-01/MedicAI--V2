package com.william20.medicai;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.util.Date;
import java.util.Map;
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
     * Stops the currently playing alarm (sound, vibration, foreground service).
     * Called from JS when the user dismisses the alarm from the in-app overlay.
     */
    @ReactMethod
    public void stopAlarm(Promise promise) {
        try {
            AlarmService.stopFromExternal(getReactApplicationContext());
            promise.resolve("stopped");
        } catch (Exception e) {
            promise.reject("stop_alarm_failed", e.getMessage(), e);
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

    /**
     * Returns all pending alarm actions stored by AlarmActivity and clears them.
     * Each action contains medicationId, action (TAKEN/SKIPPED/SNOOZED), and timestamp.
     */
    @ReactMethod
    public void getPendingAlarmActions(Promise promise) {
        try {
            SharedPreferences prefs = getReactApplicationContext().getSharedPreferences("MedicAI_alarm_actions", Context.MODE_PRIVATE);
            Map<String, ?> all = prefs.getAll();
            WritableArray actions = Arguments.createArray();

            if (all != null) {
                for (Map.Entry<String, ?> entry : all.entrySet()) {
                    if (entry.getKey() != null && entry.getKey().startsWith("pending_") && entry.getValue() instanceof String) {
                        try {
                            JSONObject obj = new JSONObject((String) entry.getValue());
                            WritableMap item = Arguments.createMap();
                            item.putString("medicationId", obj.optString("medicationId", ""));
                            item.putString("action", obj.optString("action", ""));
                            item.putDouble("timestamp", obj.optDouble("timestamp", 0));
                            actions.pushMap(item);
                        } catch (Exception ex) {
                            Log.w("MedicAI-Alarm", "Failed to parse pending action: " + ex.getMessage());
                        }
                    }
                }
            }

            // Clear all pending actions after reading
            prefs.edit().clear().apply();

            promise.resolve(actions);
        } catch (Exception e) {
            Log.e("MedicAI-Alarm", "getPendingAlarmActions failed: " + e.getMessage(), e);
            promise.reject("get_pending_actions_failed", e.getMessage(), e);
        }
    }
}
