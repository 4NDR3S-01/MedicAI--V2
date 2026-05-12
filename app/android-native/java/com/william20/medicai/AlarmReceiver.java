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
        Log.d(TAG, "AlarmReceiver.onReceive FIRED! action=" + (intent != null ? intent.getAction() : "null"));

        // Acquire a temporary WakeLock to ensure the service starts before CPU sleeps
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wl = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "MedicAI:AlarmReceiverWakeLock"
        );
        wl.acquire(5_000); // 5 seconds — just enough to start the service

        try {
            String id = intent.getStringExtra("id");
            String title = intent.getStringExtra("title");
            String body = intent.getStringExtra("body");
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
