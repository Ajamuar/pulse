package io.github.adityaongit.pulse;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.Nullable;
import java.util.Locale;

/**
 * Loads Home in a WebView that is never attached to a window. Used when the plain response did not contain the
 * three dials, so the page can finish drawing, or a sign-in proxy can settle. The caller publishes whatever was saved.
 */
final class WidgetPage {

    private static final long TIMEOUT_MS = 20000;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static int generation;
    @Nullable private static WebView web;
    @Nullable private static Runnable giveUp;
    @Nullable private static Runnable whenDone;

    private WidgetPage() {}

    static void load(Context context, String origin, Runnable done) {
        Context app = context.getApplicationContext();
        MAIN.post(() -> open(app, origin, done));
    }

    private static void open(Context context, String origin, Runnable done) {
        abandon();
        int gen = ++generation;
        whenDone = done;
        try {
            openView(context, origin, gen);
        } catch (RuntimeException ex) {
            finish(gen, context, null);
        }
    }

    private static void openView(Context context, String origin, int gen) {
        WebView view = new WebView(context);
        web = view;
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(view, true);
        // A WebView with no window still needs a size, or some versions never run the page.
        int width = Math.max(1, context.getResources().getDisplayMetrics().widthPixels);
        int height = Math.max(1, context.getResources().getDisplayMetrics().heightPixels);
        view.layout(0, 0, width, height);
        view.setWebViewClient(new WebViewClient() {
            private boolean watching;

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (ServerStore.opensInApp(origin, url)) return false;
                if (gen == generation) finish(gen, context, null);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (gen != generation || watching) return;
                if (origin.equals(ServerStore.origin(url))) WidgetTheme.read(view, null);
                if (signInUrl(url)) {
                    finish(gen, context, "sign-in");
                    return;
                }
                if (!origin.equals(ServerStore.origin(url))) return;
                watching = true;
                HomeDials.watch(view, 8, json -> finish(gen, context, json), () -> {});
            }
        });
        giveUp = () -> finish(gen, context, null);
        MAIN.postDelayed(giveUp, TIMEOUT_MS);
        view.loadUrl(origin);
    }

    /** Drops an in-flight load without publishing. Its callback still runs so the refresh can finish. */
    private static void abandon() {
        generation++;
        Runnable done = whenDone;
        whenDone = null;
        if (giveUp != null) MAIN.removeCallbacks(giveUp);
        giveUp = null;
        destroy();
        if (done != null) done.run();
    }

    /** `body` is widget JSON, {@code "sign-in"}, or null to keep the previous strip. */
    private static void finish(int gen, Context context, @Nullable String body) {
        if (gen != generation) return;
        generation++;
        if (giveUp != null) MAIN.removeCallbacks(giveUp);
        giveUp = null;
        destroy();
        if ("sign-in".equals(body)) WidgetSnapshot.saveSignIn(context);
        else if (body != null) WidgetSnapshot.save(context, body);
        Runnable done = whenDone;
        whenDone = null;
        if (done != null) done.run();
    }

    private static void destroy() {
        if (web == null) return;
        web.stopLoading();
        web.destroy();
        web = null;
    }

    static boolean signInUrl(@Nullable String url) {
        if (url == null) return false;
        String lower = url.toLowerCase(Locale.ROOT);
        if (lower.contains(".cloudflareaccess.com")) return true;
        return HomePageRead.signInLocation(url);
    }
}
