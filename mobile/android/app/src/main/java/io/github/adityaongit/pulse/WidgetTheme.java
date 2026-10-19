package io.github.adityaongit.pulse;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.webkit.WebView;
import androidx.annotation.Nullable;

/**
 * Settings › Appearance, stored on the phone as {@code pulse-theme}: system, light or dark. The widget remembers
 * the last choice it read from the page. System follows the phone. Until a choice is read, System is the default,
 * which is also the page's default.
 */
final class WidgetTheme {

    private static final String PREFS = "pulse_widget";
    private static final String KEY = "theme";
    private static final String SCRIPT = "(function(){try{var t=localStorage.getItem('pulse-theme');return t==='light'||t==='dark'?t:'system'}catch(e){return 'system'}})()";

    private WidgetTheme() {}

    /** Reads the page's choice and, when it changed, repaints the strip. `then` runs after the read. */
    static void read(WebView view, @Nullable Runnable then) {
        view.evaluateJavascript(SCRIPT, value -> {
            if (save(view.getContext(), choiceOf(value))) PulseWidget.repaint(view.getContext());
            if (then != null) then.run();
        });
    }

    static boolean isLight(Context context) {
        return light(stored(context), systemLight(context));
    }

    static boolean followsSystem(Context context) {
        return "system".equals(stored(context));
    }

    static void clear(Context context) {
        prefs(context).edit().remove(KEY).apply();
    }

    /** The choice inside an evaluateJavascript result. Anything else is System. */
    static String choiceOf(@Nullable String encoded) {
        if (encoded == null || "null".equals(encoded)) return "system";
        String value = encoded.trim();
        if (value.length() >= 2 && value.charAt(0) == '"' && value.charAt(value.length() - 1) == '"') {
            value = value.substring(1, value.length() - 1);
        }
        if ("light".equals(value) || "dark".equals(value) || "system".equals(value)) return value;
        return "system";
    }

    /** Light when the choice says so. System uses the phone. */
    static boolean light(String choice, boolean systemLight) {
        if ("light".equals(choice)) return true;
        if ("dark".equals(choice)) return false;
        return systemLight;
    }

    private static boolean save(Context context, String choice) {
        if (choice.equals(stored(context))) return false;
        prefs(context).edit().putString(KEY, choice).apply();
        return true;
    }

    private static String stored(Context context) {
        String value = prefs(context).getString(KEY, "system");
        return "light".equals(value) || "dark".equals(value) ? value : "system";
    }

    private static boolean systemLight(Context context) {
        int night = context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return night == Configuration.UI_MODE_NIGHT_NO;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
