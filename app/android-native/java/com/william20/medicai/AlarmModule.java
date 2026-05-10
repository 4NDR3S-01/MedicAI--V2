package com.william20.medicai;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

import java.util.Date;
import android.content.Context;
import android.content.SharedPreferences;
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
        try {
            Date when = new Date((long) timestampMs);
            AlarmScheduler.scheduleExactAlarm(getReactApplicationContext(), id, when, title, body);
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
                // non-fatal — alarm is already scheduled
            }
            promise.resolve("scheduled");
        } catch (Exception e) {
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
}
