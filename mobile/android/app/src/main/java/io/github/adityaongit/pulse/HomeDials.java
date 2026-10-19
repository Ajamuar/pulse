package io.github.adityaongit.pulse;

import android.webkit.WebView;
import androidx.annotation.Nullable;
import java.util.function.Consumer;
import org.json.JSONException;

/**
 * Copies today's three Home dials out of the page the WebView just showed. The widget's own request can fail
 * while the server has no {@code /api/widget} yet, or while Cloudflare Access answers it; the page already has
 * the numbers. The script is ours. The page only supplies the text we parse as numbers.
 */
final class HomeDials {

    private static final String SCRIPT = ""
        + "(function () {"
        + "  function from(name) {"
        + "    var el = document.querySelector('[data-dial=\"' + name + '\"]');"
        + "    if (!el) {"
        + "      var links = document.querySelectorAll('a[href]');"
        + "      for (var i = 0; i < links.length; i++) {"
        + "        if (links[i].pathname === '/' + name && /\\d/.test(links[i].textContent || '')) { el = links[i]; break; }"
        + "      }"
        + "    }"
        + "    if (!el) return null;"
        + "    var node = el.querySelector('[data-dial-part=\"value\"]');"
        + "    var raw = node ? node.textContent : (el.textContent || '');"
        + "    var label = el.getAttribute('aria-label') || '';"
        + "    var missing = raw.indexOf('--') !== -1 || /unavailable/i.test(label);"
        + "    var match = raw.match(/-?\\d+(?:\\.\\d+)?/);"
        + "    var value = !missing && match ? Number(match[0]) : null;"
        + "    var target = null;"
        + "    var range = label.match(/target\\s+(-?\\d+(?:\\.\\d+)?)\\s+to\\s+(-?\\d+(?:\\.\\d+)?)/);"
        + "    if (range) target = [Number(range[1]), Number(range[2])];"
        + "    return { value: value, target: target, missing: missing };"
        + "  }"
        + "  var sleep = from('sleep'), recovery = from('recovery'), strain = from('strain');"
        + "  if (!sleep || !recovery || !strain) return null;"
        + "  if (sleep.value == null && recovery.value == null && strain.value == null && !sleep.missing && !recovery.missing && !strain.missing) return null;"
        + "  return { sleep: { value: sleep.value }, recovery: { value: recovery.value }, strain: { value: strain.value, target: strain.target } };"
        + "})()";

    private HomeDials() {}

    static void capture(WebView view) {
        WidgetTheme.read(view, null);
        watch(view, 2, json -> {
            WidgetSnapshot.save(view.getContext(), json);
            PulseWidget.refresh(view.getContext());
        }, () -> {});
    }

    /** Asks the page for the three dials, retrying while it is still streaming. `found` receives widget JSON. */
    static void watch(WebView view, int attempts, Consumer<String> found, Runnable missed) {
        view.evaluateJavascript(SCRIPT, value -> deliver(view, attempts, value, found, missed));
    }

    private static void deliver(WebView view, int attempts, @Nullable String value, Consumer<String> found, Runnable missed) {
        if (!valid(value)) {
            // A streamed page can finish before the dials are in the document.
            if (attempts > 1) view.postDelayed(() -> watch(view, attempts - 1, found, missed), 1000);
            else missed.run();
            return;
        }
        found.accept(value);
    }

    private static boolean valid(@Nullable String value) {
        if (value == null || "null".equals(value)) return false;
        try {
            WidgetSnapshot parsed = WidgetSnapshot.parse(value);
            return !parsed.signIn;
        } catch (JSONException ex) {
            return false;
        }
    }
}
