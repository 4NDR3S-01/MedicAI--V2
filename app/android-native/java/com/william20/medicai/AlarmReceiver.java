package com.william20.medicai;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.NotificationManager;
import android.app.NotificationChannel;
import android.os.Build;
import android.media.RingtoneManager;
import android.net.Uri;

public class AlarmReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "medicai_alarm_channel";

    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("id");
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String notificationTitle = title != null && !title.isEmpty() ? title : "MedicAI";
        String notificationBody = body != null ? body : "";

        createNotificationChannel(context);

        Intent fullScreenIntent = new Intent(context, AlarmActivity.class);
        fullScreenIntent.putExtra("id", id);
        fullScreenIntent.putExtra("title", title);
        fullScreenIntent.putExtra("body", body);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int notifId = id != null ? id.hashCode() : 0;
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            notifId,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (alarmSound == null) {
            alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        }

        Notification.Builder builder = new Notification.Builder(context)
            .setContentTitle(notificationTitle)
            .setContentText(notificationBody)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setCategory(Notification.CATEGORY_ALARM)
            .setContentIntent(fullScreenPendingIntent)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setSound(alarmSound)
            .setAutoCancel(true)
            .setOngoing(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.setChannelId(CHANNEL_ID);
        } else {
            // Pre-Oreo: set priority on the notification itself (channel importance used on O+)
            builder.setPriority(Notification.PRIORITY_HIGH);
        }

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(notifId, builder.build());
    }

    private void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Alarmas MedicAI", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Canal para alarmas con pantalla completa");
            channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), null);
            nm.createNotificationChannel(channel);
        }
    }
}
