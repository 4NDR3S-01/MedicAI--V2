package com.william20.medicai;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONObject;
import java.util.Date;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        // Re-schedule persisted alarms after boot / package replaced
        try {
            SharedPreferences prefs = context.getSharedPreferences("MedicAI_alarms", Context.MODE_PRIVATE);
            for (String key : prefs.getAll().keySet()) {
                if (key != null && key.startsWith("alarm_")) {
                    String json = prefs.getString(key, null);
                    if (json == null) continue;
                    try {
                        JSONObject obj = new JSONObject(json);
                        String id = obj.optString("id", null);
                        long ts = obj.optLong("timestamp", -1);
                        String title = obj.optString("title", "");
                        String body = obj.optString("body", "");
                        if (id != null && ts > 0) {
                            if (ts > System.currentTimeMillis()) {
                                AlarmScheduler.scheduleExactAlarm(context, id, new Date(ts), title, body);
                            } else {
                                // Alarm already in the past — remove stale entry
                                prefs.edit().remove(key).apply();
                            }
                        }
                    } catch (Exception ex) {
                        // skip malformed
                    }
                }
            }
        } catch (Exception e) {
            // ignore failures during boot
        }
    }
}
