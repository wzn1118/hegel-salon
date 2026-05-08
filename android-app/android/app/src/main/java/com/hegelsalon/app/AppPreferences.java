package com.hegelsalon.app;

import android.content.Context;
import android.content.SharedPreferences;

final class AppPreferences {
    private static final String PREFS_NAME = "hegel_salon_app";
    private static final String KEY_SERVER_URL = "server_url";

    static final String DEFAULT_EMULATOR_URL = "http://10.0.2.2:3087";
    static final String DEFAULT_LOCAL_URL = "http://127.0.0.1:3087";

    private AppPreferences() {
    }

    static String getServerUrl(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return normalizeUrl(prefs.getString(KEY_SERVER_URL, DEFAULT_EMULATOR_URL));
    }

    static void setServerUrl(Context context, String url) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_SERVER_URL, normalizeUrl(url))
                .apply();
    }

    static String normalizeUrl(String rawUrl) {
        String candidate = rawUrl == null ? "" : rawUrl.trim();
        if (candidate.isEmpty()) {
            return "";
        }

        if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) {
            candidate = "http://" + candidate;
        }

        while (candidate.endsWith("/")) {
            candidate = candidate.substring(0, candidate.length() - 1);
        }

        return candidate;
    }
}
