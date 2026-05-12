package com.william20.medicai;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

public class AlarmActivity extends Activity {
    private static final long AUTO_DISMISS_MS = 60_000;
    private static final long SNOOZE_MS = 10 * 60_000;
    private Handler autoDismissHandler;
    private Runnable autoDismissRunnable;
    private String alarmId;
    private String alarmTitle;
    private String alarmBody;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        Intent intent = getIntent();
        alarmId = intent.getStringExtra("id");
        alarmTitle = intent.getStringExtra("title");
        alarmBody = intent.getStringExtra("body");

        buildAlarmUI(
            alarmTitle != null ? alarmTitle : "MedicAI",
            alarmBody != null ? alarmBody : "Es hora de tu medicamento"
        );

        autoDismissHandler = new Handler(Looper.getMainLooper());
        autoDismissRunnable = () -> dismissAlarm();
        autoDismissHandler.postDelayed(autoDismissRunnable, AUTO_DISMISS_MS);
    }

    private void storePendingAction(String action) {
        try {
            SharedPreferences prefs = getSharedPreferences("MedicAI_alarm_actions", Context.MODE_PRIVATE);
            String key = "pending_" + alarmId + "_" + System.currentTimeMillis();
            JSONObject obj = new JSONObject();
            obj.put("medicationId", alarmId != null ? extractMedicationId(alarmId) : "");
            obj.put("action", action);
            obj.put("timestamp", System.currentTimeMillis());
            prefs.edit().putString(key, obj.toString()).apply();
        } catch (Exception e) {
            android.util.Log.w("MedicAI-Alarm", "Failed to store pending action: " + e.getMessage());
        }
    }

    private String extractMedicationId(String compoundId) {
        if (compoundId == null) return "";
        int idx = compoundId.lastIndexOf('_');
        if (idx > 0) {
            return compoundId.substring(0, idx);
        }
        return compoundId;
    }

    private void scheduleSnooze() {
        if (alarmId == null) return;
        long snoozeTime = System.currentTimeMillis() + SNOOZE_MS;
        java.util.Date when = new java.util.Date(snoozeTime);
        String snoozeTitle = "[Pospuesto] " + (alarmTitle != null ? alarmTitle : "Medicamento");
        String snoozeId = (extractMedicationId(alarmId)) + "_snooze_" + snoozeTime;
        AlarmScheduler.scheduleExactAlarm(this, snoozeId, when, snoozeTitle, alarmBody);
    }

    private void buildAlarmUI(String title, String body) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(0xFF1E1B4B);
        int pad = dpToPx(32);
        root.setPadding(pad, pad, pad, pad);

        TextView icon = new TextView(this);
        icon.setText("\u23F0");
        icon.setTextSize(TypedValue.COMPLEX_UNIT_SP, 64);
        icon.setGravity(Gravity.CENTER);
        root.addView(icon);

        View spacer1 = new View(this);
        spacer1.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dpToPx(24)));
        root.addView(spacer1);

        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        titleView.setTextColor(Color.WHITE);
        titleView.setTypeface(null, Typeface.BOLD);
        titleView.setGravity(Gravity.CENTER);
        root.addView(titleView);

        View spacer2 = new View(this);
        spacer2.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dpToPx(12)));
        root.addView(spacer2);

        TextView bodyView = new TextView(this);
        bodyView.setText(body);
        bodyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        bodyView.setTextColor(0xCCFFFFFF);
        bodyView.setGravity(Gravity.CENTER);
        root.addView(bodyView);

        View spacer3 = new View(this);
        spacer3.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dpToPx(48)));
        root.addView(spacer3);

        // "Ya tomé" button (green)
        Button takeButton = new Button(this);
        takeButton.setText("YA TOM\u00C9");
        takeButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        takeButton.setTextColor(Color.WHITE);
        takeButton.setTypeface(null, Typeface.BOLD);
        GradientDrawable takeBg = new GradientDrawable();
        takeBg.setColor(0xFF16A34A);
        takeBg.setCornerRadius(dpToPx(12));
        takeButton.setBackground(takeBg);
        takeButton.setPadding(dpToPx(24), dpToPx(16), dpToPx(24), dpToPx(16));
        LinearLayout.LayoutParams takeParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        takeParams.setMargins(0, 0, 0, dpToPx(12));
        takeButton.setLayoutParams(takeParams);
        takeButton.setOnClickListener(v -> {
            storePendingAction("TAKEN");
            dismissAlarm();
        });
        root.addView(takeButton);

        // "Posponer" button (blue)
        Button snoozeButton = new Button(this);
        snoozeButton.setText("POSPONER");
        snoozeButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        snoozeButton.setTextColor(Color.WHITE);
        snoozeButton.setTypeface(null, Typeface.BOLD);
        GradientDrawable snoozeBg = new GradientDrawable();
        snoozeBg.setColor(0xFF2563EB);
        snoozeBg.setCornerRadius(dpToPx(12));
        snoozeButton.setBackground(snoozeBg);
        snoozeButton.setPadding(dpToPx(24), dpToPx(16), dpToPx(24), dpToPx(16));
        LinearLayout.LayoutParams snoozeParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        snoozeParams.setMargins(0, 0, 0, dpToPx(12));
        snoozeButton.setLayoutParams(snoozeParams);
        snoozeButton.setOnClickListener(v -> {
            storePendingAction("SNOOZED");
            scheduleSnooze();
            dismissAlarm();
        });
        root.addView(snoozeButton);

        // "Omitir" button (red)
        Button skipButton = new Button(this);
        skipButton.setText("OMITIR");
        skipButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        skipButton.setTextColor(Color.WHITE);
        skipButton.setTypeface(null, Typeface.BOLD);
        GradientDrawable skipBg = new GradientDrawable();
        skipBg.setColor(0xFFDC2626);
        skipBg.setCornerRadius(dpToPx(12));
        skipButton.setBackground(skipBg);
        skipButton.setPadding(dpToPx(24), dpToPx(16), dpToPx(24), dpToPx(16));
        LinearLayout.LayoutParams skipParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        skipParams.setMargins(0, 0, 0, 0);
        skipButton.setLayoutParams(skipParams);
        skipButton.setOnClickListener(v -> {
            storePendingAction("SKIPPED");
            dismissAlarm();
        });
        root.addView(skipButton);

        setContentView(root);
    }

    private void dismissAlarm() {
        AlarmService.stopFromExternal(this);

        if (autoDismissHandler != null && autoDismissRunnable != null) {
            autoDismissHandler.removeCallbacks(autoDismissRunnable);
        }

        finish();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        AlarmService.stopFromExternal(this);
        if (autoDismissHandler != null && autoDismissRunnable != null) {
            autoDismissHandler.removeCallbacks(autoDismissRunnable);
        }
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }
}
