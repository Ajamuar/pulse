package io.github.adityaongit.pulse;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WidgetThemeTest {

    @Test
    public void systemFollowsThePhoneAndAnExplicitChoiceDoesNot() {
        assertFalse(WidgetTheme.light("system", false));
        assertTrue(WidgetTheme.light("system", true));
        assertTrue(WidgetTheme.light("light", false));
        assertFalse(WidgetTheme.light("dark", true));
    }

    @Test
    public void aMissingOrUnknownChoiceIsSystem() {
        assertEquals("system", WidgetTheme.choiceOf(null));
        assertEquals("system", WidgetTheme.choiceOf("null"));
        assertEquals("system", WidgetTheme.choiceOf("\"nope\""));
        assertEquals("light", WidgetTheme.choiceOf("\"light\""));
        assertEquals("dark", WidgetTheme.choiceOf("dark"));
    }

    @Test
    public void lightRingsUseTheLightDialTokens() {
        WidgetPalette light = WidgetPalette.of(true);
        assertEquals(0xFF6690AD, light.fill("sleep", 70));
        assertEquals(0xFF0093E7, light.fill("strain", 14));
        assertEquals(0xFF12C805, light.fill("recovery", 67));
        assertEquals(0xFFE5C300, light.fill("recovery", 66.9));
        assertEquals(0xFFE5C300, light.fill("recovery", 34));
        assertEquals(0xFFF20024, light.fill("recovery", 33.9));
        assertEquals(0xFF101518, light.number);
        assertEquals(0xFFE2E6E9, light.track);
    }

    @Test
    public void darkRingsStayOnTheOriginalColours() {
        WidgetPalette dark = WidgetPalette.of(false);
        assertEquals(DialGeometry.SLEEP, dark.fill("sleep", 70));
        assertEquals(DialGeometry.RECOVERY_GREEN, dark.fill("recovery", 85));
        assertEquals(DialGeometry.NUMBER, dark.number);
        assertEquals(DialGeometry.TRACK, dark.track);
    }
}
