package io.github.adityaongit.pulse;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import androidx.annotation.Nullable;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** The last strip: today's three scores, or a sign-in wall. */
final class WidgetSnapshot {

    private static final String PREFS = "pulse_widget";
    private static final String KEY = "snapshot";
    private static final String SIGN_IN = "{\"signIn\":true}";

    /** Bumped on every save in this process, so a slow refresh cannot overwrite a newer copy. */
    private static long revision;

    final boolean signIn;
    @Nullable final Double sleep;
    @Nullable final Double recovery;
    @Nullable final Double strain;
    @Nullable final Double targetLow;
    @Nullable final Double targetHigh;

    private WidgetSnapshot(boolean signIn, @Nullable Double sleep, @Nullable Double recovery, @Nullable Double strain, @Nullable Double targetLow, @Nullable Double targetHigh) {
        this.signIn = signIn;
        this.sleep = sleep;
        this.recovery = recovery;
        this.strain = strain;
        this.targetLow = targetLow;
        this.targetHigh = targetHigh;
    }

    static WidgetSnapshot empty() {
        return new WidgetSnapshot(false, null, null, null, null, null);
    }

    static WidgetSnapshot signIn() {
        return new WidgetSnapshot(true, null, null, null, null, null);
    }

    static long revision() {
        return revision;
    }

    /** Parses a stored body. Throws if it is not the widget shape or a sign-in marker. */
    static WidgetSnapshot parse(String json) throws JSONException {
        JSONObject o = new JSONObject(json);
        if (o.optBoolean("signIn", false)) return signIn();
        JSONObject strain = o.getJSONObject("strain");
        Double low = null;
        Double high = null;
        if (!strain.isNull("target")) {
            JSONArray target = strain.getJSONArray("target");
            if (target.length() >= 2 && !target.isNull(0) && !target.isNull(1)) {
                double a = target.getDouble(0);
                double b = target.getDouble(1);
                if (Double.isFinite(a) && Double.isFinite(b) && a <= b) {
                    low = a;
                    high = b;
                }
            }
        }
        return new WidgetSnapshot(false, number(o.getJSONObject("sleep")), number(o.getJSONObject("recovery")), number(strain), low, high);
    }

    @Nullable
    private static Double number(JSONObject dial) throws JSONException {
        if (dial.isNull("value")) return null;
        double v = dial.getDouble("value");
        return Double.isFinite(v) ? v : null;
    }

    static void save(Context context, String json) {
        revision++;
        prefs(context).edit().putString(KEY, json).apply();
    }

    static void saveSignIn(Context context) {
        save(context, SIGN_IN);
    }

    static void clear(Context context) {
        revision++;
        prefs(context).edit().remove(KEY).apply();
    }

    /** The stored body, or an empty strip when there is none or it cannot be read. */
    static WidgetSnapshot load(Context context) {
        String json = prefs(context).getString(KEY, null);
        if (json == null) return empty();
        try {
            return parse(json);
        } catch (JSONException ex) {
            return empty();
        }
    }

    String spoken() {
        if (signIn) return "Sign in required";
        return speak("Sleep", sleep, true) + ", " + speak("Recovery", recovery, true) + ", " + speak("Strain", strain, false);
    }

    private static String speak(String label, @Nullable Double value, boolean percent) {
        if (value == null) return label + " unavailable";
        return label + " " + text(value, percent) + (percent ? " percent" : "");
    }

    static String text(@Nullable Double value, boolean percent) {
        if (value == null) return "--";
        if (percent) return String.valueOf(Math.round(value));
        return String.format(Locale.US, "%.1f", value);
    }

    Bitmap ring(String kind, int sizePx, WidgetPalette palette) {
        Double value = "recovery".equals(kind) ? recovery : "strain".equals(kind) ? strain : sleep;
        Bitmap bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        float stroke = sizePx * (6f / 72f);
        float cx = sizePx / 2f;
        float radius = cx - stroke / 2f - 1f;
        RectF oval = new RectF(cx - radius, cx - radius, cx + radius, cx + radius);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.BUTT);
        paint.setStrokeWidth(stroke);

        paint.setColor(palette.track);
        canvas.drawArc(oval, DialGeometry.START, DialGeometry.SWEEP, false, paint);
        if ("strain".equals(kind) && targetLow != null && targetHigh != null) {
            paint.setColor(palette.target);
            canvas.drawArc(oval, DialGeometry.angleAt(targetLow, 21), DialGeometry.sweep(targetHigh, 21) - DialGeometry.sweep(targetLow, 21), false, paint);
        }
        if (value != null && value > 0) {
            double max = "strain".equals(kind) ? 21 : 100;
            paint.setColor(palette.fill(kind, value));
            canvas.drawArc(oval, DialGeometry.START, DialGeometry.sweep(value, max), false, paint);
        }
        if ("strain".equals(kind) && targetLow != null && targetHigh != null) {
            float angle = DialGeometry.angleAt((targetLow + targetHigh) / 2.0, 21);
            double rad = Math.toRadians(angle);
            float inner = radius - stroke / 2f;
            float outer = radius + stroke / 2f;
            paint.setColor(palette.tick);
            paint.setStrokeWidth(Math.max(2f, sizePx * 0.028f));
            canvas.drawLine(
                cx + (float) Math.cos(rad) * inner,
                cx + (float) Math.sin(rad) * inner,
                cx + (float) Math.cos(rad) * outer,
                cx + (float) Math.sin(rad) * outer,
                paint
            );
        }
        drawNumber(canvas, sizePx, value, !"strain".equals(kind), palette);
        return bitmap;
    }

    private static void drawNumber(Canvas canvas, int size, @Nullable Double value, boolean percent, WidgetPalette palette) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
        paint.setColor(value == null ? palette.missing : palette.number);
        String main = text(value, percent);
        float mainSize = size * (percent ? 0.28f : 0.24f);
        paint.setTextSize(mainSize);
        Paint.FontMetrics fm = paint.getFontMetrics();
        float baseline = size / 2f - (fm.ascent + fm.descent) / 2f;
        if (value == null || !percent) {
            paint.setTextAlign(Paint.Align.CENTER);
            canvas.drawText(main, size / 2f, baseline, paint);
            return;
        }
        Paint unit = new Paint(paint);
        unit.setTextSize(mainSize * 0.55f);
        float width = paint.measureText(main) + unit.measureText("%");
        float x = (size - width) / 2f;
        canvas.drawText(main, x, baseline, paint);
        canvas.drawText("%", x + paint.measureText(main), baseline, unit);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
