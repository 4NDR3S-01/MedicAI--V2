package com.william20.medicai;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.net.Uri;

import android.util.Log;
import java.util.Date;

public class AlarmScheduler {
    private static final String ACTION_ALARM = "com.william20.medicai.ACTION_ALARM";

    private static Intent buildAlarmIntent(Context context, String id, String title, String body) {
        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.setAction(ACTION_ALARM + "." + id);
        intent.setData(Uri.parse("medicai://alarm/" + Uri.encode(id)));
        intent.putExtra("id", id);
        if (title != null) {
            intent.putExtra("title", title);
        }
        if (body != null) {
            intent.putExtra("body", body);
        }
        return intent;
    }

    private static PendingIntent buildPendingIntent(Context context, Intent intent, String id) {
        int requestCode = id != null ? id.hashCode() : 0;
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    public static void scheduleExactAlarm(Context context, String id, Date when, String title, String body) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = buildAlarmIntent(context, id, title, body);
        PendingIntent pi = buildPendingIntent(context, intent, id);

        long time = when.getTime();
        long delayMs = time - System.currentTimeMillis();
        Log.d("MedicAI-Alarm", "scheduleExactAlarm: id=" + id + ", triggerIn=" + (delayMs / 1000) + "s, SDK=" + Build.VERSION.SDK_INT);

        // Android 12+ requires explicit permission to schedule exact alarms.
        // Fall back to inexact if the permission was not granted by the user.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (!am.canScheduleExactAlarms()) {
                Log.w("MedicAI-Alarm", "canScheduleExactAlarms=false, using inexact alarm for id=" + id);
                am.set(AlarmManager.RTC_WAKEUP, time, pi);
                return;
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, pi);
            Log.d("MedicAI-Alarm", "setExactAndAllowWhileIdle set for id=" + id);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, time, pi);
            Log.d("MedicAI-Alarm", "setExact set for id=" + id);
        }
    }

    public static void cancelAlarm(Context context, String id) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = buildAlarmIntent(context, id, null, null);
        PendingIntent pi = buildPendingIntent(context, intent, id);
        am.cancel(pi);
    }
}
