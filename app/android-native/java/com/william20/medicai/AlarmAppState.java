package com.william20.medicai;

import android.content.Context;
public class AlarmAppState {
    private static volatile boolean sAppForeground = false;

    public static void setAppForeground(Context context, boolean foreground) {
        sAppForeground = foreground;
    }

    public static boolean isAppForeground(Context context) {
        return sAppForeground;
    }
}
