package com.william20.medicai;

import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.KeyguardManager;
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
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
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
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
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
    private boolean userInteracted = false;
    private boolean playLocalFeedback = false;
    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;

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
            | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (keyguardManager != null) {
                keyguardManager.requestDismissKeyguard(this, null);
            }
        }

        Intent intent = getIntent();
        alarmId = intent.getStringExtra("id");
        alarmTitle = intent.getStringExtra("title");
        alarmBody = intent.getStringExtra("body");
        playLocalFeedback = intent.getBooleanExtra("playFeedback", false);

        buildAlarmUI(
            alarmTitle != null ? alarmTitle : "MedicAI",
            alarmBody != null ? alarmBody : "Es hora de tu medicamento"
        );

        if (playLocalFeedback) {
            startLocalAlarmFeedback();
        }

        // Auto-dismiss after 60 seconds — marks dose as SKIPPED
        autoDismissHandler = new Handler(Looper.getMainLooper());
        autoDismissRunnable = () -> {
            if (!userInteracted) {
                storePendingAction("SKIPPED");
                userInteracted = true;
            }
            dismissAlarm();
        };
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
        // Formatos: <med>_dose_<toma>  y  <med>_snooze_<pospuesta>_<toma>
        // (la alarma pospuesta conserva la hora original de la toma).
        String tail = null;
        int doseIndex = compoundId.indexOf("_dose_");
        if (doseIndex > 0) {
            tail = compoundId.substring(doseIndex + "_dose_".length());
        } else {
            int snoozeIndex = compoundId.indexOf("_snooze_");
            if (snoozeIndex > 0) {
                String[] snoozeParts = compoundId.substring(snoozeIndex + "_snooze_".length()).split("_");
                tail = snoozeParts.length == 2 ? snoozeParts[1] : null;
            }
        }
        if (tail == null) return -1;
        try {
            return Long.parseLong(tail);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    private String extractMedicationId(String compoundId) {
        if (compoundId == null) return "";
        // split() devuelve la cadena completa si no encuentra el separador, así
        // que hay que comprobar cuál de los dos formatos tiene el id.
        for (String separator : new String[] {"_dose_", "_snooze_"}) {
            int index = compoundId.indexOf(separator);
            if (index > 0) {
                return compoundId.substring(0, index);
            }
        }
        return compoundId;
    }

    private void scheduleSnooze() {
        if (alarmId == null) return;
        long snoozeTime = System.currentTimeMillis() + SNOOZE_MS;
        String snoozeTitle = "[Pospuesto] " + (alarmTitle != null ? alarmTitle : "Medicamento");
        long originalDose = extractDoseTimestamp(alarmId);
        String snoozeId = extractMedicationId(alarmId) + "_snooze_" + snoozeTime
            + (originalDose > 0 ? "_" + originalDose : "");
        AlarmScheduler.scheduleExactAlarm(this, snoozeId, new Date(snoozeTime), snoozeTitle, alarmBody);
    }

    // Paleta de la marca (teal), igual que la app y la web.
    private static final int COLOR_BG_TOP = 0xFF042F2E;
    private static final int COLOR_BG_BOTTOM = 0xFF020617;
    private static final int COLOR_ACCENT = 0xFF2DD4BF;
    private static final int COLOR_ACCENT_DARK = 0xFF0F766E;
    private static final int COLOR_ON_ACCENT = 0xFF042F2E;
    private static final int COLOR_TEXT_SOFT = 0xFFA7C4C2;
    private static final int COLOR_DANGER = 0xFFF87171;

    private void buildAlarmUI(String title, String body) {
        // ─── Root: full-screen teal → night gradient ───
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackground(new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[] {COLOR_BG_TOP, COLOR_BG_BOTTOM}
        ));
        int sidePad = dpToPx(28);
        root.setPadding(sidePad, dpToPx(40), sidePad, dpToPx(28));
        setContentView(root);

        getWindow().setStatusBarColor(COLOR_BG_TOP);
        getWindow().setNavigationBarColor(COLOR_BG_BOTTOM);

        // ─── Entrance fade-in ───
        root.setAlpha(0f);
        root.animate().alpha(1f).setDuration(400).setInterpolator(new AccelerateDecelerateInterpolator()).start();

        root.addView(flexSpacer());

        // ─── Current time + date (respeta el formato 12/24 h del teléfono) ───
        long now = System.currentTimeMillis();
        TextView clock = new TextView(this);
        clock.setText(android.text.format.DateFormat.getTimeFormat(this).format(new Date(now)));
        clock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 56);
        clock.setTextColor(Color.WHITE);
        clock.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        clock.setGravity(Gravity.CENTER);
        clock.setIncludeFontPadding(false);
        root.addView(clock);

        TextView date = new TextView(this);
        date.setText(android.text.format.DateUtils.formatDateTime(this, now,
            android.text.format.DateUtils.FORMAT_SHOW_WEEKDAY
                | android.text.format.DateUtils.FORMAT_SHOW_DATE
                | android.text.format.DateUtils.FORMAT_NO_YEAR));
        date.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        date.setTextColor(COLOR_TEXT_SOFT);
        date.setGravity(Gravity.CENTER);
        root.addView(date);

        root.addView(spacer(dpToPx(32)));

        // ─── App logo with pulsing rings (antes: emoji ⏰) ───
        root.addView(buildPulsingLogo());

        root.addView(spacer(dpToPx(28)));

        // ─── Kicker ───
        TextView kicker = new TextView(this);
        kicker.setText("HORA DE TU MEDICAMENTO");
        kicker.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        kicker.setTextColor(COLOR_ACCENT);
        kicker.setTypeface(null, Typeface.BOLD);
        kicker.setGravity(Gravity.CENTER);
        kicker.setLetterSpacing(0.12f);
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

        root.addView(spacer(dpToPx(6)));

        // ─── Dose body ───
        TextView bodyView = new TextView(this);
        bodyView.setText(body);
        bodyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        bodyView.setTextColor(COLOR_TEXT_SOFT);
        bodyView.setGravity(Gravity.CENTER);
        bodyView.setLineSpacing(0f, 1.35f);
        root.addView(bodyView);

        root.addView(flexSpacer());
        root.addView(spacer(dpToPx(24)));

        // ─── Buttons container ───
        LinearLayout btnContainer = new LinearLayout(this);
        btnContainer.setOrientation(LinearLayout.VERTICAL);
        btnContainer.setGravity(Gravity.CENTER);

        // ── YA TOMÉ (primary, brand teal) ──
        Button takeBtn = createActionButton(
            "YA TOM\u00C9",
            COLOR_ACCENT,
            COLOR_ACCENT_DARK,
            0.95f
        );
        takeBtn.setTextColor(COLOR_ON_ACCENT);
        takeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        takeBtn.getLayoutParams().height = dpToPx(64);
        takeBtn.setOnClickListener(v -> {
            userInteracted = true;
            storePendingAction("TAKEN");
            dismissAlarm();
        });
        btnContainer.addView(takeBtn);

        btnContainer.addView(spacer(dpToPx(12)));

        // ── POSPONER (secondary, translucent) ──
        Button snoozeBtn = createActionButton(
            "POSPONER 10 MIN",
            0x24FFFFFF,
            0x40FFFFFF,
            0.95f
        );
        snoozeBtn.setOnClickListener(v -> {
            userInteracted = true;
            storePendingAction("SNOOZED");
            scheduleSnooze();
            dismissAlarm();
        });
        btnContainer.addView(snoozeBtn);

        btnContainer.addView(spacer(dpToPx(12)));

        // ── OMITIR (destructive, outline) ──
        Button skipBtn = createOutlineButton(
            "OMITIR",
            COLOR_DANGER,
            COLOR_DANGER
        );
        skipBtn.setOnClickListener(v -> {
            userInteracted = true;
            storePendingAction("SKIPPED");
            dismissAlarm();
        });
        btnContainer.addView(skipBtn);

        root.addView(btnContainer);

        root.addView(spacer(dpToPx(20)));

        // ─── Brand footer ───
        TextView brand = new TextView(this);
        brand.setText("MedicAI");
        brand.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        brand.setTextColor(0x99FFFFFF);
        brand.setTypeface(null, Typeface.BOLD);
        brand.setGravity(Gravity.CENTER);
        brand.setLetterSpacing(0.04f);
        root.addView(brand);
    }

    /**
     * Logo de la app dentro de un círculo blanco, con dos anillos que se
     * expanden y desvanecen en bucle (sensación de «sonando»).
     */
    private View buildPulsingLogo() {
        int size = dpToPx(148);
        int badge = dpToPx(100);

        android.widget.FrameLayout frame = new android.widget.FrameLayout(this);
        LinearLayout.LayoutParams frameParams = new LinearLayout.LayoutParams(size, size);
        frameParams.gravity = Gravity.CENTER_HORIZONTAL;
        frame.setLayoutParams(frameParams);
        frame.setClipChildren(false);

        for (int i = 0; i < 2; i++) {
            View ring = new View(this);
            GradientDrawable ringBg = new GradientDrawable();
            ringBg.setShape(GradientDrawable.OVAL);
            ringBg.setColor(0x1A2DD4BF);
            ringBg.setStroke(dpToPx(2), COLOR_ACCENT);
            ring.setBackground(ringBg);
            android.widget.FrameLayout.LayoutParams rp = new android.widget.FrameLayout.LayoutParams(badge, badge, Gravity.CENTER);
            frame.addView(ring, rp);

            ObjectAnimator sx = ObjectAnimator.ofFloat(ring, "scaleX", 1f, 1.45f);
            ObjectAnimator sy = ObjectAnimator.ofFloat(ring, "scaleY", 1f, 1.45f);
            ObjectAnimator fade = ObjectAnimator.ofFloat(ring, "alpha", 0.9f, 0f);
            for (ObjectAnimator anim : new ObjectAnimator[] {sx, sy, fade}) {
                anim.setDuration(1800);
                anim.setRepeatCount(ValueAnimator.INFINITE);
                anim.setRepeatMode(ValueAnimator.RESTART);
            }
            AnimatorSet set = new AnimatorSet();
            set.playTogether(sx, sy, fade);
            set.setStartDelay(i * 900L);
            set.start();
        }

        // Círculo blanco con el ícono de la app (el mismo del lanzador).
        android.widget.ImageView logo = new android.widget.ImageView(this);
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setShape(GradientDrawable.OVAL);
        badgeBg.setColor(Color.WHITE);
        logo.setBackground(badgeBg);
        logo.setClipToOutline(true);
        logo.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
        logo.setElevation(dpToPx(8));
        try {
            logo.setImageDrawable(getPackageManager().getApplicationIcon(getApplicationInfo()));
        } catch (Exception e) {
            android.util.Log.w("MedicAI-Alarm", "App icon unavailable: " + e.getMessage());
        }
        frame.addView(logo, new android.widget.FrameLayout.LayoutParams(badge, badge, Gravity.CENTER));

        // Latido suave del logo.
        ObjectAnimator beatX = ObjectAnimator.ofFloat(logo, "scaleX", 1f, 1.06f);
        ObjectAnimator beatY = ObjectAnimator.ofFloat(logo, "scaleY", 1f, 1.06f);
        for (ObjectAnimator anim : new ObjectAnimator[] {beatX, beatY}) {
            anim.setDuration(900);
            anim.setInterpolator(new AccelerateDecelerateInterpolator());
            anim.setRepeatMode(ValueAnimator.REVERSE);
            anim.setRepeatCount(ValueAnimator.INFINITE);
        }
        AnimatorSet beat = new AnimatorSet();
        beat.playTogether(beatX, beatY);
        beat.start();

        return frame;
    }

    /** Espaciador elástico: reparte el alto sobrante (y se encoge en pantallas pequeñas). */
    private View flexSpacer() {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        return v;
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
        bg.setStroke(dpToPx(1), strokeColor);

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
        stopLocalAlarmFeedback();
        AlarmService.stopFromExternal(this);

        if (autoDismissHandler != null && autoDismissRunnable != null) {
            autoDismissHandler.removeCallbacks(autoDismissRunnable);
        }

        finish();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopLocalAlarmFeedback();
        if (!userInteracted) {
            storePendingAction("SKIPPED");
        }
        AlarmService.stopFromExternal(this);
        if (autoDismissHandler != null && autoDismissRunnable != null) {
            autoDismissHandler.removeCallbacks(autoDismissRunnable);
        }
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }

    private void startLocalAlarmFeedback() {
        startLocalAlarmSound();
        startLocalVibration();
    }

    private void stopLocalAlarmFeedback() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
                mediaPlayer.release();
            } catch (Exception e) {
                android.util.Log.w("MedicAI-Alarm", "Error stopping local MediaPlayer: " + e.getMessage());
            }
            mediaPlayer = null;
        }

        if (vibrator != null) {
            try {
                vibrator.cancel();
            } catch (Exception e) {
                android.util.Log.w("MedicAI-Alarm", "Error stopping local Vibrator: " + e.getMessage());
            }
            vibrator = null;
        }
    }

    private void startLocalAlarmSound() {
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
        } catch (Exception e) {
            android.util.Log.e("MedicAI-Alarm", "Failed to start local alarm sound: " + e.getMessage());
        }
    }

    private void startLocalVibration() {
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
            }
        } catch (Exception e) {
            android.util.Log.e("MedicAI-Alarm", "Failed to start local vibration: " + e.getMessage());
        }
    }
}
