package com.william20.medicai;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.content.pm.ServiceInfo;
import android.util.Log;

/**
 * Foreground Service that runs the alarm sound, vibration, and shows the
 * persistent full-screen notification.
 *
 * Unlike a BroadcastReceiver (which is killed after ~10 s), a foreground service
 * can keep running indefinitely, making it the correct approach for a real alarm
 * that needs to loop sound/vibration until the user dismisses it.
 *
 * Flow: AlarmReceiver → starts AlarmService → shows notification + sound + vibration
 *       AlarmActivity (dismiss) → stops AlarmService
 */
public class AlarmService extends Service {
    private static final String TAG = "MedicAI-Alarm";
    public static final String CHANNEL_ID = "medicai_alarm_channel";
    public static final String ACTION_START_ALARM = "com.william20.medicai.ACTION_START_ALARM";
    public static final String ACTION_STOP_ALARM = "com.william20.medicai.ACTION_STOP_ALARM";

    private static final long AUTO_STOP_MS = 120_000; // Auto-stop after 2 minutes

    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private Handler autoStopHandler;
    private Runnable autoStopRunnable;

    // Static reference so AlarmActivity and AlarmModule can stop the service
    private static AlarmService sInstance;

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;
        Log.d(TAG, "AlarmService.onCreate");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        Log.d(TAG, "AlarmService.onStartCommand action=" + action);

        if (ACTION_STOP_ALARM.equals(action)) {
            stopAlarmAndService();
            return START_NOT_STICKY;
        }

        // ACTION_START_ALARM or default
        String id = intent.getStringExtra("id");
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");

        // ── Step 1: Wake the device screen ──
        // Use FULL_WAKE_LOCK + ACQUIRE_CAUSES_WAKEUP to physically turn the screen on.
        // This is essential for the full-screen intent to trigger on the lockscreen.
        // PARTIAL_WAKE_LOCK alone does NOT turn the screen on.
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(
            PowerManager.FULL_WAKE_LOCK
                | PowerManager.ACQUIRE_CAUSES_WAKEUP
                | PowerManager.ON_AFTER_RELEASE,
            "MedicAI:AlarmServiceWakeLock"
        );
        wakeLock.acquire(AUTO_STOP_MS + 5000);
        Log.d(TAG, "WakeLock acquired (FULL + ACQUIRE_CAUSES_WAKEUP)");

        // ── Step 2: Create notification channel ──
        createNotificationChannel();

        // ── Step 3: Check full-screen intent permission (Android 14+) ──
        boolean canUseFullScreen = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            canUseFullScreen = nm.canUseFullScreenIntent();
            if (!canUseFullScreen) {
                Log.w(TAG, "USE_FULL_SCREEN_INTENT permission NOT granted. " +
                    "Alarm will show as heads-up notification instead of full-screen.");
            }
        }

        // ── Step 4: Build and show foreground notification with full-screen intent ──
        Notification notification = buildAlarmNotification(id, title, body);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(getNotificationId(id), notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(getNotificationId(id), notification);
            }
            Log.d(TAG, "AlarmService started in foreground for id=" + id);
        } catch (Exception e) {
            Log.e(TAG, "Failed to startForeground: " + e.getMessage());
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify(getNotificationId(id), notification);
        }

        // ── Step 5: Direct AlarmActivity launch (backup for OEMs that ignore fullScreenIntent) ──
        // The notification's fullScreenIntent is the primary mechanism, but some OEMs
        // (MIUI, ColorOS, One UI) may not honour it. A direct startActivity() from a
        // foreground service with a FULL_WAKE_LOCK works as a reliable fallback.
        try {
            Intent directLaunch = new Intent(this, AlarmActivity.class);
            directLaunch.putExtra("id", id);
            directLaunch.putExtra("title", title);
            directLaunch.putExtra("body", body);
            directLaunch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(directLaunch);
            Log.d(TAG, "Direct AlarmActivity launch attempted");
        } catch (Exception e) {
            Log.w(TAG, "Direct AlarmActivity launch failed (expected on some devices): " + e.getMessage());
        }

        // ── Step 6: Start alarm feedback (sound + vibration) ──
        startAlarmSound();
        startVibration();

        // ── Step 7: Auto-stop safety net ──
        autoStopHandler = new Handler(Looper.getMainLooper());
        autoStopRunnable = this::stopAlarmAndService;
        autoStopHandler.postDelayed(autoStopRunnable, AUTO_STOP_MS);

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "AlarmService.onDestroy");
        stopAlarmFeedback();
        if (autoStopHandler != null && autoStopRunnable != null) {
            autoStopHandler.removeCallbacks(autoStopRunnable);
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        sInstance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ─── Public static methods for external stop ─────────────────────────────────

    /** Stop the alarm from AlarmActivity or AlarmModule */
    public static void stopFromExternal(Context context) {
        Log.d(TAG, "stopFromExternal called");
        if (sInstance != null) {
            sInstance.stopAlarmAndService();
        } else {
            // Service might not be running, send stop intent just in case
            Intent stopIntent = new Intent(context, AlarmService.class);
            stopIntent.setAction(ACTION_STOP_ALARM);
            context.stopService(stopIntent);
        }
    }

    // ─── Private helpers ─────────────────────────────────────────────────────────

    private void stopAlarmAndService() {
        Log.d(TAG, "stopAlarmAndService");
        stopAlarmFeedback();
        stopForeground(true);
        stopSelf();
    }

    private void stopAlarmFeedback() {
        // Stop sound
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
                mediaPlayer.release();
            } catch (Exception e) {
                Log.w(TAG, "Error stopping MediaPlayer: " + e.getMessage());
            }
            mediaPlayer = null;
        }

        // Stop vibration
        if (vibrator != null) {
            try {
                vibrator.cancel();
            } catch (Exception e) {
                Log.w(TAG, "Error stopping Vibrator: " + e.getMessage());
            }
            vibrator = null;
        }
    }

    private void startAlarmSound() {
        try {
            Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmSound == null) {
                alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }
            if (alarmSound == null) {
                alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, alarmSound);
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            mediaPlayer.setAudioAttributes(attrs);
            mediaPlayer.setLooping(true);
            mediaPlayer.prepare();
            mediaPlayer.start();
            Log.d(TAG, "Alarm sound started (looping) in foreground service");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start alarm sound: " + e.getMessage());
        }
    }

    private void startVibration() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }

            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = new long[]{0, 800, 400, 800, 400, 800, 1000};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
                Log.d(TAG, "Vibration started (looping) in foreground service");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start vibration: " + e.getMessage());
        }
    }

    private Notification buildAlarmNotification(String id, String title, String body) {
        String notificationTitle = (title != null && !title.isEmpty()) ? title : "MedicAI";
        String notificationBody = (body != null) ? body : "Es hora de tu medicamento";

        // Full-screen intent
        Intent fullScreenIntent = new Intent(this, AlarmActivity.class);
        fullScreenIntent.putExtra("id", id);
        fullScreenIntent.putExtra("title", title);
        fullScreenIntent.putExtra("body", body);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_SINGLE_TOP
            | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int notifId = getNotificationId(id);
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            this, notifId, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Stop action
        Intent stopIntent = new Intent(this, AlarmService.class);
        stopIntent.setAction(ACTION_STOP_ALARM);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this, notifId + 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Icon
        int smallIconRes = getResources().getIdentifier("notification_icon", "drawable", getPackageName());
        if (smallIconRes == 0) {
            smallIconRes = getApplicationInfo().icon;
        }

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
            builder.setPriority(Notification.PRIORITY_MAX);
        }

        builder.setContentTitle(notificationTitle)
            .setContentText(notificationBody)
            .setSmallIcon(smallIconRes)
            .setColor(0xFF4F46E5)
            .setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(fullScreenPendingIntent)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setOngoing(true)
            .setAutoCancel(false);

        // Add stop action button directly on the notification
        Notification.Action stopAction = new Notification.Action.Builder(
            android.R.drawable.ic_menu_close_clear_cancel,
            "Detener",
            stopPendingIntent
        ).build();
        builder.addAction(stopAction);

        return builder.build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Alarmas MedicAI",
                NotificationManager.IMPORTANCE_MAX
            );
            channel.setDescription("Canal para alarmas médicas críticas con pantalla completa");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 800, 400, 800, 400, 800});
            channel.setBypassDnd(true);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.enableLights(true);
            channel.setLightColor(0xFF4F46E5);
            // Sound handled by MediaPlayer, set channel sound to none to avoid double-play
            channel.setSound(null, null);

            nm.createNotificationChannel(channel);
        }
    }

    private int getNotificationId(String id) {
        return id != null ? id.hashCode() : 99999;
    }
}
