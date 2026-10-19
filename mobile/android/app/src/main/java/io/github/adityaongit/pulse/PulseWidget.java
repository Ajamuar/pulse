package io.github.adityaongit.pulse;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.BroadcastReceiver;
import android.content.ComponentCallbacks;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.widget.RemoteViews;
import androidx.annotation.Nullable;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import org.json.JSONException;

/**
 * The slim strip: Sleep, Recovery and Strain. A refresh asks {@code /api/widget}, then Home's HTML, then loads
 * Home off screen when the dials are not in that HTML yet. A sign-in wall replaces the rings. The page itself
 * cannot call native code.
 */
public class PulseWidget extends AppWidgetProvider {

    static final String ACTION_REFRESH = "io.github.adityaongit.pulse.action.WIDGET_REFRESH";

    private static final int MAX_API = 8192;
    private static final int MAX_PAGE = 2_000_000;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final ArrayList<BroadcastReceiver.PendingResult> WAITING = new ArrayList<>();

    private static boolean busy;
    private static boolean watchingConfig;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && ACTION_REFRESH.equals(intent.getAction())) {
            refresh(context, goAsync());
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        refresh(context, goAsync());
    }

    /** Paints the stored strip now, then fetches a new one. Safe to call from the activity. */
    static void refresh(Context context) {
        refresh(context, null);
    }

    /** Paints the stored strip in the current appearance, without asking the server. */
    static void repaint(Context context) {
        Context app = context.getApplicationContext();
        MAIN.post(() -> {
            watchConfig(app);
            AppWidgetManager manager = AppWidgetManager.getInstance(app);
            int[] ids = manager.getAppWidgetIds(new ComponentName(app, PulseWidget.class));
            if (ids.length == 0) return;
            publish(app, manager, ids, WidgetSnapshot.load(app), busy);
        });
    }

    private static void refresh(Context context, @Nullable BroadcastReceiver.PendingResult pending) {
        Context app = context.getApplicationContext();
        MAIN.post(() -> begin(app, pending));
    }

    private static void begin(Context app, @Nullable BroadcastReceiver.PendingResult pending) {
        watchConfig(app);
        if (pending != null) WAITING.add(pending);
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        int[] ids = manager.getAppWidgetIds(new ComponentName(app, PulseWidget.class));
        if (ids.length == 0) {
            finishWaiting();
            return;
        }
        String origin = ServerStore.url(app);
        if (origin == null) {
            WidgetSnapshot.clear(app);
            WidgetTheme.clear(app);
            publish(app, manager, ids, WidgetSnapshot.empty(), false);
            finishWaiting();
            return;
        }
        publish(app, manager, ids, WidgetSnapshot.load(app), true);
        if (busy) return;
        busy = true;
        String cookie = null;
        String agent = null;
        boolean cookiesReady = true;
        try {
            CookieManager cookies = CookieManager.getInstance();
            cookies.setAcceptCookie(true);
            cookie = cookies.getCookie(origin);
            agent = WebSettings.getDefaultUserAgent(app);
        } catch (RuntimeException ignored) {
            // The cookie store is not ready yet. The strip keeps what it last showed.
            cookiesReady = false;
        }
        if (!cookiesReady) {
            busy = false;
            publish(app, manager, ids, WidgetSnapshot.load(app), false);
            finishWaiting();
            return;
        }
        final String header = cookie;
        final String userAgent = agent;
        final long seen = WidgetSnapshot.revision();
        new Thread(() -> {
            Outcome outcome;
            try {
                outcome = header == null || header.isEmpty()
                    ? Outcome.signIn()
                    : fetch(origin, header, userAgent);
            } catch (Exception ex) {
                outcome = Outcome.keep();
            }
            Outcome result = outcome;
            MAIN.post(() -> apply(app, manager, ids, seen, result));
        }).start();
    }

    private static void apply(Context app, AppWidgetManager manager, int[] ids, long seen, Outcome outcome) {
        String origin = ServerStore.url(app);
        if (outcome.page && origin != null && WidgetSnapshot.revision() == seen) {
            WidgetPage.load(app, origin, () -> settle(app, manager, ids));
            return;
        }
        if (outcome.snap != null && WidgetSnapshot.revision() == seen) {
            if (outcome.snap.signIn) WidgetSnapshot.saveSignIn(app);
            else WidgetSnapshot.save(app, outcome.body);
        }
        settle(app, manager, ids);
    }

    private static void settle(Context app, AppWidgetManager manager, int[] ids) {
        busy = false;
        int[] current = manager.getAppWidgetIds(new ComponentName(app, PulseWidget.class));
        if (current.length > 0) publish(app, manager, current, WidgetSnapshot.load(app), false);
        finishWaiting();
    }

    private static void finishWaiting() {
        for (BroadcastReceiver.PendingResult pending : WAITING) pending.finish();
        WAITING.clear();
    }

    /**
     * A 200 from {@code /api/widget} is the strip. A 401 is signed out. Anything else tries Home's HTML.
     * A page with no dials asks the caller to load Home. Other failures keep the last strip.
     */
    private static Outcome fetch(String origin, String cookie, @Nullable String userAgent) throws Exception {
        HttpResult api = request(origin + "api/widget", cookie, userAgent, "application/json", MAX_API);
        if (api.status == 401) return Outcome.signIn();
        if (api.status == 200) {
            try {
                WidgetSnapshot.parse(api.body);
                return Outcome.scores(api.body);
            } catch (JSONException ex) {
                // A 200 that is not the widget document. Home may still have the dials.
            }
        }
        HttpResult page = request(origin, cookie, userAgent, "text/html", MAX_PAGE);
        if (page.status == 401) return Outcome.signIn();
        if (page.redirect && HomePageRead.loginLocation(page.location)) return Outcome.signIn();
        if (page.status == 200) {
            String dials = HomePageRead.dials(page.body);
            if (dials != null) {
                WidgetSnapshot.parse(dials);
                return Outcome.scores(dials);
            }
            return Outcome.page();
        }
        // Cloudflare Access often challenges this client and still lets the WebView through.
        if (page.redirect && HomePageRead.signInLocation(page.location)) return Outcome.page();
        return Outcome.keep();
    }

    private static HttpResult request(String url, String cookie, @Nullable String userAgent, String accept, int max) throws Exception {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("Accept", accept);
            conn.setRequestProperty("Cookie", cookie);
            if (userAgent != null) conn.setRequestProperty("User-Agent", userAgent);
            int status = conn.getResponseCode();
            boolean redirect = status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
            if (redirect) return HttpResult.redirect(conn.getHeaderField("Location"));
            if (status != 200) return HttpResult.status(status);
            InputStream in = conn.getInputStream();
            return HttpResult.ok(read(in, max));
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String read(InputStream in, int max) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        int total = 0;
        while ((n = in.read(buf)) != -1) {
            total += n;
            if (total > max) throw new JSONException("body");
            out.write(buf, 0, n);
        }
        return out.toString(StandardCharsets.UTF_8.name());
    }

    private static void watchConfig(Context app) {
        if (watchingConfig) return;
        watchingConfig = true;
        app.registerComponentCallbacks(new ComponentCallbacks() {
            @Override
            public void onConfigurationChanged(Configuration newConfig) {
                if (WidgetTheme.followsSystem(app)) repaint(app);
            }

            @Override
            public void onLowMemory() {}
        });
    }

    private static void publish(Context context, AppWidgetManager manager, int[] ids, WidgetSnapshot snap, boolean refreshing) {
        WidgetPalette palette = WidgetPalette.of(WidgetTheme.isLight(context));
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        views.setInt(R.id.widget_root, "setBackgroundResource", palette.light ? R.drawable.widget_background_light : R.drawable.widget_background);
        views.setTextColor(R.id.widget_message, palette.message);
        views.setTextColor(R.id.sleep_label, palette.label);
        views.setTextColor(R.id.recovery_label, palette.label);
        views.setTextColor(R.id.strain_label, palette.label);
        views.setInt(R.id.widget_refresh, "setColorFilter", palette.icon);
        if (snap.signIn) {
            views.setViewVisibility(R.id.sleep_column, View.GONE);
            views.setViewVisibility(R.id.recovery_column, View.GONE);
            views.setViewVisibility(R.id.strain_column, View.GONE);
            views.setViewVisibility(R.id.widget_message, View.VISIBLE);
        } else {
            float density = context.getResources().getDisplayMetrics().density;
            int size = Math.max(1, Math.round(64f * density));
            views.setImageViewBitmap(R.id.sleep_dial, snap.ring("sleep", size, palette));
            views.setImageViewBitmap(R.id.recovery_dial, snap.ring("recovery", size, palette));
            views.setImageViewBitmap(R.id.strain_dial, snap.ring("strain", size, palette));
            views.setViewVisibility(R.id.sleep_column, View.VISIBLE);
            views.setViewVisibility(R.id.recovery_column, View.VISIBLE);
            views.setViewVisibility(R.id.strain_column, View.VISIBLE);
            views.setViewVisibility(R.id.widget_message, View.GONE);
        }
        views.setViewVisibility(R.id.widget_refresh, refreshing ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_refreshing, refreshing ? View.VISIBLE : View.GONE);
        views.setContentDescription(R.id.widget_root, snap.spoken());
        Intent open = new Intent(context, MainActivity.class);
        PendingIntent openPending = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, openPending);
        views.setOnClickPendingIntent(R.id.widget_message, openPending);
        views.setOnClickPendingIntent(R.id.sleep_column, openPending);
        views.setOnClickPendingIntent(R.id.recovery_column, openPending);
        views.setOnClickPendingIntent(R.id.strain_column, openPending);
        Intent refresh = new Intent(context, PulseWidget.class).setAction(ACTION_REFRESH);
        PendingIntent refreshPending = PendingIntent.getBroadcast(context, 1, refresh, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_refresh_hit, refreshPending);
        views.setOnClickPendingIntent(R.id.widget_refresh, refreshPending);
        views.setOnClickPendingIntent(R.id.widget_refreshing, refreshPending);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    private static final class Outcome {
        @Nullable final WidgetSnapshot snap;
        @Nullable final String body;
        final boolean page;

        private Outcome(@Nullable WidgetSnapshot snap, @Nullable String body, boolean page) {
            this.snap = snap;
            this.body = body;
            this.page = page;
        }

        static Outcome scores(String body) {
            return new Outcome(WidgetSnapshot.empty(), body, false);
        }

        static Outcome signIn() {
            return new Outcome(WidgetSnapshot.signIn(), null, false);
        }

        static Outcome page() {
            return new Outcome(null, null, true);
        }

        static Outcome keep() {
            return new Outcome(null, null, false);
        }
    }

    private static final class HttpResult {
        final int status;
        final boolean redirect;
        @Nullable final String location;
        @Nullable final String body;

        private HttpResult(int status, boolean redirect, @Nullable String location, @Nullable String body) {
            this.status = status;
            this.redirect = redirect;
            this.location = location;
            this.body = body;
        }

        static HttpResult ok(String body) {
            return new HttpResult(200, false, null, body);
        }

        static HttpResult status(int status) {
            return new HttpResult(status, false, null, null);
        }

        static HttpResult redirect(String location) {
            return new HttpResult(302, true, location, null);
        }
    }
}
