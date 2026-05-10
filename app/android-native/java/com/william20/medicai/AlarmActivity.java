package com.william20.medicai;

import android.app.Activity;
import android.app.KeyguardManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.TextView;
import android.content.Intent;

public class AlarmActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Show over lock screen and turn screen on.
        // API 27+ has proper Activity methods; older versions use window flags.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (km != null) {
                km.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        TextView tv = new TextView(this);
        Intent intent = getIntent();
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        tv.setText((title != null ? title : "") + "\n\n" + (body != null ? body : ""));
        tv.setTextSize(24);
        tv.setPadding(48, 48, 48, 48);
        setContentView(tv);
    }
}
