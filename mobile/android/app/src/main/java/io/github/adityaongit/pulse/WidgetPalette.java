package io.github.adityaongit.pulse;

/**
 * Colours for one appearance. Dark matches the strip as first drawn. Light matches Home's light card, ink and
 * dial tokens in {@code globals.css}.
 */
final class WidgetPalette {

    final boolean light;
    final int track;
    final int target;
    final int tick;
    final int number;
    final int missing;
    final int sleep;
    final int strain;
    final int recoveryGreen;
    final int recoveryYellow;
    final int recoveryRed;
    final int label;
    final int message;
    final int icon;

    private WidgetPalette(boolean light, int track, int target, int tick, int number, int missing, int sleep, int strain, int recoveryGreen, int recoveryYellow, int recoveryRed, int label, int message, int icon) {
        this.light = light;
        this.track = track;
        this.target = target;
        this.tick = tick;
        this.number = number;
        this.missing = missing;
        this.sleep = sleep;
        this.strain = strain;
        this.recoveryGreen = recoveryGreen;
        this.recoveryYellow = recoveryYellow;
        this.recoveryRed = recoveryRed;
        this.label = label;
        this.message = message;
        this.icon = icon;
    }

    static WidgetPalette of(boolean light) {
        return light ? LIGHT : DARK;
    }

    /** Same bands as Home: ≥ 67 green, 34–66 yellow, below 34 red. */
    int fill(String kind, double value) {
        if ("recovery".equals(kind)) return value >= 67 ? recoveryGreen : value >= 34 ? recoveryYellow : recoveryRed;
        if ("strain".equals(kind)) return strain;
        return sleep;
    }

    private static final WidgetPalette DARK = new WidgetPalette(
        false,
        DialGeometry.TRACK,
        DialGeometry.TARGET,
        DialGeometry.TICK,
        DialGeometry.NUMBER,
        DialGeometry.MISSING,
        DialGeometry.SLEEP,
        DialGeometry.STRAIN,
        DialGeometry.RECOVERY_GREEN,
        DialGeometry.RECOVERY_YELLOW,
        DialGeometry.RECOVERY_RED,
        0xFFBABAC0,
        0xFFFFFFFF,
        0xFFBABAC0
    );

    private static final WidgetPalette LIGHT = new WidgetPalette(
        true,
        0xFFE2E6E9,
        0xFFB3BBC1,
        0xFF101518,
        0xFF101518,
        0xFF5A646B,
        0xFF6690AD,
        0xFF0093E7,
        0xFF12C805,
        0xFFE5C300,
        0xFFF20024,
        0xFF49535A,
        0xFF101518,
        0xFF49535A
    );
}
