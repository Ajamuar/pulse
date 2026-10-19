package io.github.adityaongit.pulse;

import androidx.annotation.Nullable;
import java.net.URI;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads Sleep, Recovery and Strain out of Home's HTML. The page is rendered on the server, so a single response
 * can carry the three dials. Returns null when they are not in the document yet.
 */
final class HomePageRead {

    private static final Pattern NUMBER = Pattern.compile("-?\\d+(?:\\.\\d+)?");
    private static final Pattern TARGET = Pattern.compile("target\\s+(-?\\d+(?:\\.\\d+)?)\\s+to\\s+(-?\\d+(?:\\.\\d+)?)");
    private static final String[] NAMES = { "sleep", "recovery", "strain" };

    private HomePageRead() {}

    /** Widget JSON, or null when the three dials are absent or still empty shells. */
    @Nullable
    static String dials(String html) {
        Dial sleep = dial(html, "sleep");
        Dial recovery = dial(html, "recovery");
        Dial strain = dial(html, "strain");
        if (sleep == null || recovery == null || strain == null) return null;
        if (sleep.value == null && recovery.value == null && strain.value == null && !sleep.missing && !recovery.missing && !strain.missing) return null;
        return "{\"sleep\":" + sleep.json(false) + ",\"recovery\":" + recovery.json(false) + ",\"strain\":" + strain.json(true) + "}";
    }

    /** Pulse's own sign-in page. A proxy challenge is separate: the WebView may already be signed in there. */
    static boolean loginLocation(@Nullable String location) {
        String path = pathOf(location);
        return path != null && ("/login".equals(path) || path.startsWith("/login/"));
    }

    /** A redirect to Pulse's sign-in page, or to Cloudflare Access. */
    static boolean signInLocation(@Nullable String location) {
        if (location == null || location.trim().isEmpty()) return false;
        URI uri = uriOf(location);
        if (uri == null) return false;
        String host = uri.getHost();
        if (host != null && host.toLowerCase(Locale.ROOT).endsWith(".cloudflareaccess.com")) return true;
        return loginLocation(location);
    }

    @Nullable
    private static String pathOf(@Nullable String location) {
        URI uri = uriOf(location);
        if (uri == null) return null;
        String path = uri.getPath();
        if (path == null || path.isEmpty()) path = "/";
        return path;
    }

    @Nullable
    private static URI uriOf(@Nullable String location) {
        if (location == null || location.trim().isEmpty()) return null;
        try {
            return URI.create(location.trim());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    @Nullable
    private static Dial dial(String html, String name) {
        String marker = "data-dial=\"" + name + "\"";
        int at = html.indexOf(marker);
        if (at < 0) return null;
        int end = html.length();
        for (String other : NAMES) {
            int next = html.indexOf("data-dial=\"" + other + "\"", at + marker.length());
            if (next >= 0 && next < end) end = next;
        }
        if (end - at > 20000) end = at + 20000;
        String region = html.substring(at, end);
        String raw = valueText(region);
        if (raw == null) return null;
        String aria = attribute(openingTag(html, at), "aria-label");
        boolean missing = raw.contains("--") || (aria != null && aria.toLowerCase(Locale.ROOT).contains("unavailable"));
        String value = null;
        if (!missing) {
            Matcher match = NUMBER.matcher(raw);
            if (match.find()) value = match.group();
        }
        String low = null;
        String high = null;
        if (aria != null) {
            Matcher range = TARGET.matcher(aria);
            if (range.find()) {
                low = range.group(1);
                high = range.group(2);
            }
        }
        return new Dial(value, missing, low, high);
    }

    @Nullable
    private static String valueText(String region) {
        int at = region.indexOf("data-dial-part=\"value\"");
        if (at < 0) return null;
        int open = region.indexOf('>', at);
        int close = region.indexOf("</span>", open + 1);
        if (open < 0 || close < 0) return null;
        return region.substring(open + 1, close).replaceAll("<[^>]*>", "").trim();
    }

    private static String openingTag(String html, int attrAt) {
        int start = html.lastIndexOf('<', attrAt);
        int end = html.indexOf('>', attrAt);
        if (start < 0 || end < 0) return "";
        return html.substring(start, end);
    }

    @Nullable
    private static String attribute(String tag, String name) {
        String needle = name + "=\"";
        int at = tag.indexOf(needle);
        if (at < 0) return null;
        int start = at + needle.length();
        int end = tag.indexOf('"', start);
        if (end < 0) return null;
        return tag.substring(start, end);
    }

    private static final class Dial {
        @Nullable final String value;
        final boolean missing;
        @Nullable final String low;
        @Nullable final String high;

        Dial(@Nullable String value, boolean missing, @Nullable String low, @Nullable String high) {
            this.value = value;
            this.missing = missing;
            this.low = low;
            this.high = high;
        }

        String json(boolean strain) {
            String valueJson = value == null ? "null" : value;
            if (!strain) return "{\"value\":" + valueJson + "}";
            String target = low == null || high == null ? "null" : "[" + low + "," + high + "]";
            return "{\"value\":" + valueJson + ",\"target\":" + target + "}";
        }
    }
}
