package io.github.adityaongit.pulse;

/**
 * The Home ring, in canvas degrees. Canvas 0° is 3 o'clock and positive sweep is clockwise, which is the same
 * 352° arc ScoreDial draws (a 4° gap each side of 12 o'clock). Recovery bands match {@code recoveryBand}.
 */
final class DialGeometry {

    static final float GAP_DEGREES = 8f;
    static final float SWEEP = 360f - GAP_DEGREES;
    /** 4° clockwise from 12 o'clock. */
    static final float START = 270f + GAP_DEGREES / 2f;

    static final int TRACK = 0xFF33383C;
    static final int TARGET = 0xFF5A5E61;
    static final int TICK = 0xFFFFFFFF;
    static final int NUMBER = 0xFFFFFFFF;
    static final int MISSING = 0xFF8B9196;
    static final int SLEEP = 0xFF7BA1BB;
    static final int STRAIN = 0xFF0093E7;
    static final int RECOVERY_GREEN = 0xFF16EC06;
    static final int RECOVERY_YELLOW = 0xFFFFDE00;
    static final int RECOVERY_RED = 0xFFFF0026;

    private DialGeometry() {}

    /** ≥ 67 green, 34–66 yellow, below 34 red. */
    static int recoveryColor(double value) {
        if (value >= 67) return RECOVERY_GREEN;
        if (value >= 34) return RECOVERY_YELLOW;
        return RECOVERY_RED;
    }

    static int fillColor(String kind, double value) {
        if ("recovery".equals(kind)) return recoveryColor(value);
        if ("strain".equals(kind)) return STRAIN;
        return SLEEP;
    }

    /** Clockwise degrees of a value on a 0..max track, clamped. */
    static float sweep(double value, double max) {
        if (!(max > 0) || !(value > 0)) return 0f;
        return (float) (Math.min(value, max) / max * SWEEP);
    }

    /** Canvas angle where `value` sits, for the Strain Target tick. */
    static float angleAt(double value, double max) {
        return START + sweep(value, max);
    }
}
