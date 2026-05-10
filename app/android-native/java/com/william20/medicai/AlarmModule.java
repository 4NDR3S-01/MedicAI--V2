package com.william20.medicai;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Callback;

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
    public void scheduleAlarm(String id, double timestampMs, String title, String body, Callback cb) {
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
                // non-fatal
            }
            cb.invoke((Object) null, "scheduled");
        } catch (Exception e) {
            cb.invoke(e.getMessage(), (Object) null);
        }
    }

    @ReactMethod
    public void cancelAlarm(String id, Callback cb) {
        try {
            AlarmScheduler.cancelAlarm(getReactApplicationContext(), id);
            try {
                SharedPreferences prefs = getReactApplicationContext().getSharedPreferences("MedicAI_alarms", Context.MODE_PRIVATE);
                prefs.edit().remove("alarm_" + id).apply();
            } catch (Exception ex) {
                // non-fatal
            }
            cb.invoke((Object) null, "cancelled");
        } catch (Exception e) {
            cb.invoke(e.getMessage(), (Object) null);
        }
    }
}
