package io.github.adityaongit.pulse;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class DialGeometryTest {

    @Test
    public void theArcLeavesAnEightDegreeGapAtTheTop() {
        assertEquals(274f, DialGeometry.START, 0f);
        assertEquals(352f, DialGeometry.SWEEP, 0f);
        assertEquals(274f, DialGeometry.angleAt(0, 100), 0f);
        assertEquals(274f + 352f, DialGeometry.angleAt(100, 100), 0f);
    }

    @Test
    public void sweepClampsToTheTrack() {
        assertEquals(0f, DialGeometry.sweep(0, 21), 0f);
        assertEquals(0f, DialGeometry.sweep(-1, 100), 0f);
        assertEquals(DialGeometry.SWEEP, DialGeometry.sweep(30, 21), 0f);
        assertEquals(DialGeometry.SWEEP / 2f, DialGeometry.sweep(50, 100), 0.01f);
    }

    @Test
    public void recoveryUsesTheHomeBands() {
        assertEquals(DialGeometry.RECOVERY_GREEN, DialGeometry.recoveryColor(67));
        assertEquals(DialGeometry.RECOVERY_YELLOW, DialGeometry.recoveryColor(66.9));
        assertEquals(DialGeometry.RECOVERY_YELLOW, DialGeometry.recoveryColor(34));
        assertEquals(DialGeometry.RECOVERY_RED, DialGeometry.recoveryColor(33.9));
    }

    @Test
    public void sleepAndStrainKeepOneHue() {
        assertEquals(DialGeometry.SLEEP, DialGeometry.fillColor("sleep", 10));
        assertEquals(DialGeometry.STRAIN, DialGeometry.fillColor("strain", 20));
        assertEquals(DialGeometry.RECOVERY_GREEN, DialGeometry.fillColor("recovery", 85));
    }
}
