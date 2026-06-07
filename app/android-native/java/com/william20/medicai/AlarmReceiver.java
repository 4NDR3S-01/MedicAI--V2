package com.william20.medicai;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

/**
 * BroadcastReceiver that fires when an AlarmManager alarm triggers.
 *
 * IMPORTANT: A BroadcastReceiver has a ~10-second execution limit before Android
 * kills the process. Therefore, this receiver does NOT play sound or vibration
 * directly. Instead, it starts AlarmService (a foreground service) which handles
 * the looping alarm sound, vibration, and full-screen notification.
 *
 * This architecture ensures the alarm works correctly even when the app is:
 *   - In the background
 *   - Completely killed / swiped away
 *   - Device is locked / in Doze mode
 */
public class AlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "MedicAI-Alarm";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        Log.d(TAG, "AlarmReceiver.onReceive FIRED! action=" + (action != null ? action : "null"));

        // Acquire a temporary WakeLock to ensure the service starts before CPU sleeps
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wl = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "MedicAI:AlarmReceiverWakeLock"
        );
        wl.acquire(5_000); // 5 seconds — just enough to start the service

        try {
            if (AlarmActionHandler.isAlarmAction(action)) {
                AlarmActionHandler.handleAction(context, intent);
                Log.d(TAG, "Alarm action handled: " + action);
                return;
            }

            String id = intent.getStringExtra("id");
            String title = intent.getStringExtra("title");
            String body = intent.getStringExtra("body");

            if (AlarmActionHandler.isMedicationAlarmId(id) && AlarmAppState.isAppForeground(context)) {
                try {
                    Intent activityIntent = new Intent(context, AlarmActivity.class);
                    activityIntent.putExtra("id", id);
                    activityIntent.putExtra("title", title);
                    activityIntent.putExtra("body", body);
                    activityIntent.putExtra("playFeedback", true);
                    activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    context.startActivity(activityIntent);
                    Log.d(TAG, "App foreground: launched AlarmActivity without foreground notification for id=" + id);
                    return;
                } catch (Exception e) {
                    Log.w(TAG, "Foreground AlarmActivity launch failed, falling back to AlarmService: " + e.getMessage());
                }
            }

            Log.d(TAG, "Starting AlarmService for id=" + id + ", title=" + title);

            Intent serviceIntent = new Intent(context, AlarmService.class);
            serviceIntent.setAction(AlarmService.ACTION_START_ALARM);
            serviceIntent.putExtra("id", id);
            serviceIntent.putExtra("title", title);
            serviceIntent.putExtra("body", body);

            // On Android 8+ (Oreo), must use startForegroundService for background starts
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }

            Log.d(TAG, "AlarmService start requested for id=" + id);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start AlarmService: " + e.getMessage(), e);
        } finally {
            if (wl.isHeld()) {
                wl.release();
            }
        }
    }
}
