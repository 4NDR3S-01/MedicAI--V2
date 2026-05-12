package com.william20.medicai;

import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.Date;

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

        // Auto-dismiss after 60 seconds
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
            long doseTimestamp = extractDoseTimestamp(alarmId);
            if (doseTimestamp > 0) {
                obj.put("doseTimestamp", doseTimestamp);
            }
            prefs.edit().putString(key, obj.toString()).apply();
        } catch (Exception e) {
            android.util.Log.w("MedicAI-Alarm", "Failed to store pending action: " + e.getMessage());
        }
    }

    private long extractDoseTimestamp(String compoundId) {
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

    private String extractMedicationId(String compoundId) {
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

    private void scheduleSnooze() {
        if (alarmId == null) return;
        long snoozeTime = System.currentTimeMillis() + SNOOZE_MS;
        String snoozeTitle = "[Pospuesto] " + (alarmTitle != null ? alarmTitle : "Medicamento");
        String snoozeId = extractMedicationId(alarmId) + "_snooze_" + snoozeTime;
        AlarmScheduler.scheduleExactAlarm(this, snoozeId, new Date(snoozeTime), snoozeTitle, alarmBody);
    }

    private void buildAlarmUI(String title, String body) {
        // ─── Root: full-screen dark gradient ───
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(0xFF0B0F19);
        int sidePad = dpToPx(28);
        root.setPadding(sidePad, dpToPx(48), sidePad, dpToPx(48));
        setContentView(root);

        // ─── Entrance fade-in ───
        root.setAlpha(0f);
        root.animate().alpha(1f).setDuration(400).setInterpolator(new AccelerateDecelerateInterpolator()).start();

        // ─── Top spacer ───
        root.addView(spacer(dpToPx(16)));

        // ─── Alarm icon (emoji with pulse animation) ───
        TextView icon = new TextView(this);
        icon.setText("\u23F0");
        icon.setTextSize(TypedValue.COMPLEX_UNIT_SP, 72);
        icon.setGravity(Gravity.CENTER);
        icon.setTextColor(Color.WHITE);
        icon.setAlpha(0.92f);
        root.addView(icon);

        // Pulse animation on the icon
        ObjectAnimator pulseX = ObjectAnimator.ofFloat(icon, "scaleX", 1f, 1.12f);
        ObjectAnimator pulseY = ObjectAnimator.ofFloat(icon, "scaleY", 1f, 1.12f);
        pulseX.setDuration(1200);
        pulseY.setDuration(1200);
        pulseX.setInterpolator(new AccelerateDecelerateInterpolator());
        pulseY.setInterpolator(new AccelerateDecelerateInterpolator());
        pulseX.setRepeatMode(ValueAnimator.REVERSE);
        pulseX.setRepeatCount(ValueAnimator.INFINITE);
        pulseY.setRepeatMode(ValueAnimator.REVERSE);
        pulseY.setRepeatCount(ValueAnimator.INFINITE);
        AnimatorSet pulse = new AnimatorSet();
        pulse.playTogether(pulseX, pulseY);
        pulse.start();

        root.addView(spacer(dpToPx(24)));

        // ─── "Recordatorio" label (small uppercase) ───
        TextView kicker = new TextView(this);
        kicker.setText("RECORDATORIO DE MEDICACI\u00D3N");
        kicker.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        kicker.setTextColor(0xFF60A5FA);
        kicker.setTypeface(null, Typeface.BOLD);
        kicker.setGravity(Gravity.CENTER);
        kicker.setLetterSpacing(0.08f);
        root.addView(kicker);

        root.addView(spacer(dpToPx(8)));

        // ─── Medication name ───
        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 30);
        titleView.setTextColor(Color.WHITE);
        titleView.setTypeface(null, Typeface.BOLD);
        titleView.setGravity(Gravity.CENTER);
        titleView.setLineSpacing(0f, 1.1f);
        root.addView(titleView);

        root.addView(spacer(dpToPx(8)));

        // ─── Dose body ───
        TextView bodyView = new TextView(this);
        bodyView.setText(body);
        bodyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        bodyView.setTextColor(0xFF94A3B8);
        bodyView.setGravity(Gravity.CENTER);
        bodyView.setLineSpacing(0f, 1.4f);
        root.addView(bodyView);

        root.addView(spacer(dpToPx(40)));

        // ─── Buttons container ───
        LinearLayout btnContainer = new LinearLayout(this);
        btnContainer.setOrientation(LinearLayout.VERTICAL);
        btnContainer.setGravity(Gravity.CENTER);
        btnContainer.setPadding(0, 0, 0, 0);

        // ── YA TOMÉ (primary, green) ──
        Button takeBtn = createActionButton(
            "YA TOM\u00C9",
            0xFF16A34A,
            0xFF15803D,
            0.95f
        );
        takeBtn.setOnClickListener(v -> {
            storePendingAction("TAKEN");
            dismissAlarm();
        });
        btnContainer.addView(takeBtn);

        btnContainer.addView(spacer(dpToPx(12)));

        // ── POSPONER (secondary, blue) ──
        Button snoozeBtn = createActionButton(
            "POSPONER 10 MIN",
            0xFF2563EB,
            0xFF1D4ED8,
            0.95f
        );
        snoozeBtn.setOnClickListener(v -> {
            storePendingAction("SNOOZED");
            scheduleSnooze();
            dismissAlarm();
        });
        btnContainer.addView(snoozeBtn);

        btnContainer.addView(spacer(dpToPx(12)));

        // ── OMITIR (destructive, red / outline style) ──
        Button skipBtn = createOutlineButton(
            "OMITIR",
            0xFFDC2626,
            0xFFDC2626
        );
        skipBtn.setOnClickListener(v -> {
            storePendingAction("SKIPPED");
            dismissAlarm();
        });
        btnContainer.addView(skipBtn);

        root.addView(btnContainer);

        // ─── Bottom spacer ───
        root.addView(spacer(dpToPx(24)));

        // ─── "Toca para abrir MedicAI" hint ───
        TextView hint = new TextView(this);
        hint.setText("Toca fuera para abrir la aplicaci\u00F3n");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        hint.setTextColor(0xFF475569);
        hint.setGravity(Gravity.CENTER);
        root.addView(hint);
    }

    /**
     * Creates a solid filled button with ripple feedback and press-scale animation.
     */
    private Button createActionButton(String text, int bgColor, int rippleColor, float pressScale) {
        Button btn = new Button(this);
        btn.setText(text);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        btn.setTextColor(Color.WHITE);
        btn.setTypeface(null, Typeface.BOLD);
        btn.setAllCaps(true);
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dpToPx(24), dpToPx(16), dpToPx(24), dpToPx(16));

        // Rounded background
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(bgColor);
        bg.setCornerRadius(dpToPx(16));

        // Ripple drawable wrapping bg
        RippleDrawable ripple = new RippleDrawable(
            ColorStateList.valueOf(rippleColor),
            bg,
            null
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            btn.setBackground(ripple);
        } else {
            btn.setBackground(bg);
        }

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dpToPx(56)
        );
        btn.setLayoutParams(params);

        // Press scale animation with haptic-style visual feedback
        btn.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    v.animate()
                        .scaleX(pressScale)
                        .scaleY(pressScale)
                        .setDuration(80)
                        .setInterpolator(new AccelerateDecelerateInterpolator())
                        .start();
                    v.setAlpha(0.85f);
                    return false;
                case MotionEvent.ACTION_UP:
                    v.performClick();
                    // fall through
                case MotionEvent.ACTION_CANCEL:
                    v.animate()
                        .scaleX(1f)
                        .scaleY(1f)
                        .alpha(1f)
                        .setDuration(150)
                        .setInterpolator(new AccelerateDecelerateInterpolator())
                        .start();
                    return true;
            }
            return false;
        });

        return btn;
    }

    /**
     * Creates an outline (stroke-only) button with ripple feedback.
     */
    private Button createOutlineButton(String text, int strokeColor, int rippleColor) {
        Button btn = new Button(this);
        btn.setText(text);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        btn.setTextColor(strokeColor);
        btn.setTypeface(null, Typeface.BOLD);
        btn.setAllCaps(true);
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dpToPx(24), dpToPx(16), dpToPx(24), dpToPx(16));

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.TRANSPARENT);
        bg.setCornerRadius(dpToPx(16));
        bg.setStroke(dpToPx(2), strokeColor);

        RippleDrawable ripple = new RippleDrawable(
            ColorStateList.valueOf(rippleColor | 0x33000000),
            bg,
            null
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            btn.setBackground(ripple);
        } else {
            btn.setBackground(bg);
        }

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dpToPx(56)
        );
        btn.setLayoutParams(params);

        btn.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    v.animate()
                        .scaleX(0.96f)
                        .scaleY(0.96f)
                        .setDuration(80)
                        .setInterpolator(new AccelerateDecelerateInterpolator())
                        .start();
                    v.setAlpha(0.7f);
                    return false;
                case MotionEvent.ACTION_UP:
                    v.performClick();
                case MotionEvent.ACTION_CANCEL:
                    v.animate()
                        .scaleX(1f)
                        .scaleY(1f)
                        .alpha(1f)
                        .setDuration(150)
                        .setInterpolator(new AccelerateDecelerateInterpolator())
                        .start();
                    return true;
            }
            return false;
        });

        return btn;
    }

    /**
     * Creates an empty spacer View with the given height.
     */
    private View spacer(int heightPx) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, heightPx));
        return v;
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
