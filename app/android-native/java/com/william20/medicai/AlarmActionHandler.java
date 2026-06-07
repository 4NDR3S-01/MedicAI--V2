package com.william20.medicai;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.util.Date;

public class AlarmActionHandler {
    private static final String TAG = "MedicAI-Alarm";
    private static final long SNOOZE_MS = 10 * 60_000;

    public static final String ACTION_TAKE_ALARM = "com.william20.medicai.ACTION_TAKE_ALARM";
    public static final String ACTION_SNOOZE_ALARM = "com.william20.medicai.ACTION_SNOOZE_ALARM";
    public static final String ACTION_SKIP_ALARM = "com.william20.medicai.ACTION_SKIP_ALARM";
    public static final String ACTION_DISMISS_ALARM = "com.william20.medicai.ACTION_DISMISS_ALARM";

    public static boolean isAlarmAction(String action) {
        return ACTION_TAKE_ALARM.equals(action)
            || ACTION_SNOOZE_ALARM.equals(action)
            || ACTION_SKIP_ALARM.equals(action)
            || ACTION_DISMISS_ALARM.equals(action);
    }

    public static boolean isMedicationAlarmId(String alarmId) {
        return alarmId != null && (alarmId.contains("_dose_") || alarmId.contains("_snooze_"));
    }

    public static void handleAction(Context context, Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        String alarmId = intent.getStringExtra("id");
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");

        if (!isMedicationAlarmId(alarmId)) {
            Log.w(TAG, "Ignoring alarm action for non-medication id=" + alarmId);
            AlarmService.stopFromExternal(context);
            cancelNotification(context, alarmId);
            return;
        }

        if (ACTION_TAKE_ALARM.equals(action)) {
            storePendingAction(context, alarmId, "TAKEN");
        } else if (ACTION_SNOOZE_ALARM.equals(action)) {
            storePendingAction(context, alarmId, "SNOOZED");
            scheduleSnooze(context, alarmId, title, body);
        } else if (ACTION_SKIP_ALARM.equals(action) || ACTION_DISMISS_ALARM.equals(action)) {
            storePendingAction(context, alarmId, "SKIPPED");
        }

        AlarmService.stopFromExternal(context);
        cancelNotification(context, alarmId);
    }

    public static void storePendingAction(Context context, String alarmId, String action) {
        if (!isMedicationAlarmId(alarmId)) return;

        try {
            SharedPreferences prefs = context.getSharedPreferences("MedicAI_alarm_actions", Context.MODE_PRIVATE);
            String key = "pending_" + alarmId + "_" + System.currentTimeMillis();
            JSONObject obj = new JSONObject();
            obj.put("medicationId", extractMedicationId(alarmId));
            obj.put("action", action);
            obj.put("timestamp", System.currentTimeMillis());
            long doseTimestamp = extractDoseTimestamp(alarmId);
            if (doseTimestamp > 0) {
                obj.put("doseTimestamp", doseTimestamp);
            }
            prefs.edit().putString(key, obj.toString()).apply();
            Log.d(TAG, "Stored pending alarm action=" + action + " for id=" + alarmId);
        } catch (Exception e) {
            Log.w(TAG, "Failed to store pending alarm action: " + e.getMessage());
        }
    }

    private static void scheduleSnooze(Context context, String alarmId, String title, String body) {
        long snoozeTime = System.currentTimeMillis() + SNOOZE_MS;
        String snoozeTitle = "[Pospuesto] " + (title != null ? title : "Medicamento");
        String snoozeId = extractMedicationId(alarmId) + "_snooze_" + snoozeTime;
        AlarmScheduler.scheduleExactAlarm(context, snoozeId, new Date(snoozeTime), snoozeTitle, body);
    }

    private static void cancelNotification(Context context, String alarmId) {
        if (alarmId == null) return;
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(alarmId.hashCode());
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to cancel alarm notification: " + e.getMessage());
        }
    }

    private static long extractDoseTimestamp(String compoundId) {
        if (compoundId == null) return -1;
        String[] parts = compoundId.split("_dose_");
        if (parts.length == 2) {
            try {
                return Long.parseLong(parts[1]);
            } catch (NumberFormatException e) {
                return -1;
            }
        }
        return -1;
    }

    private static String extractMedicationId(String compoundId) {
        if (compoundId == null) return "";
        String[] parts = compoundId.split("_dose_");
        if (parts.length > 0 && !parts[0].isEmpty()) {
            return parts[0];
        }
        parts = compoundId.split("_snooze_");
        if (parts.length > 0 && !parts[0].isEmpty()) {
            return parts[0];
        }
        return compoundId;
    }
}
