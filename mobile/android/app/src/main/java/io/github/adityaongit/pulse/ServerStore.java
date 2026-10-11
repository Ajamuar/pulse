package io.github.adityaongit.pulse;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.annotation.Nullable;
import com.getcapacitor.CapConfig;
import com.getcapacitor.Logger;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

final class ServerStore {

    private static final String PREFS = "pulse_shell";
    private static final String KEY_URL = "server_url";
    private static final String KEY_PICK = "show_picker";
    // Sign-in hosts a Pulse server may sit behind; every other host opens in the browser.
    private static final String[] AUTH_HOSTS = { "*.cloudflareaccess.com" };

    private ServerStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @Nullable
    static String url(Context context) {
        return prefs(context).getString(KEY_URL, null);
    }

    static void save(Context context, String origin) {
        prefs(context).edit().putString(KEY_URL, origin).remove(KEY_PICK).apply();
    }

    static void requestPicker(Context context) {
        prefs(context).edit().putBoolean(KEY_PICK, true).apply();
    }

    private static boolean consumePicker(Context context) {
        SharedPreferences prefs = prefs(context);
        boolean pick = prefs.getBoolean(KEY_PICK, false);
        if (pick) prefs.edit().remove(KEY_PICK).apply();
        return pick;
    }

    @Nullable
    static String origin(@Nullable String raw) {
        if (raw == null) return null;
        Uri uri = Uri.parse(raw.trim());
        String host = uri.getHost();
        if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || host.isEmpty()) return null;
        return "https://" + host.toLowerCase() + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
    }

    /** The bundled picker when no server is saved (or one was asked for), else the saved server with the bundled config's other settings. */
    static CapConfig config(Context context) {
        String url = consumePicker(context) ? null : url(context);
        if (url == null) return CapConfig.loadDefault(context);
        try (InputStream in = context.getAssets().open("capacitor.config.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            for (int n; (n = in.read(buffer)) != -1; ) bytes.write(buffer, 0, n);
            JSONObject json = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            JSONObject server = json.optJSONObject("server");
            if (server == null) server = new JSONObject();
            JSONArray allow = new JSONArray();
            for (String host : AUTH_HOSTS) allow.put(host);
            server.put("url", url).put("allowNavigation", allow);
            json.put("server", server);
            File dir = new File(context.getFilesDir(), "pulse-shell");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("no config dir");
            try (FileOutputStream out = new FileOutputStream(new File(dir, "capacitor.config.json"))) {
                out.write(json.toString().getBytes(StandardCharsets.UTF_8));
            }
            return CapConfig.loadFromFile(context, dir.getAbsolutePath());
        } catch (Exception ex) {
            Logger.error("PulseServer", "Could not build the server config; showing the picker", ex);
            return CapConfig.loadDefault(context);
        }
    }
}
