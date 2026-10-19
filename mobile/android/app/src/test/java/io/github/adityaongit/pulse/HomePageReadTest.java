package io.github.adityaongit.pulse;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class HomePageReadTest {

    @Test
    public void readsTheThreeHomeDialsFromThePage() {
        String html = dial("strain", "Strain 14.2 of 21, target 12.0 to 15.0. Open Strain details", "14.2")
            + dial("sleep", "Sleep 74 percent. Open Sleep details", "74<span class=\"u\">%</span>")
            + dial("recovery", "Recovery unavailable: no data. Open Recovery details", "--");
        assertEquals(
            "{\"sleep\":{\"value\":74},\"recovery\":{\"value\":null},\"strain\":{\"value\":14.2,\"target\":[12.0,15.0]}}",
            HomePageRead.dials(html)
        );
    }

    @Test
    public void waitsWhenTheDialsAreNotInThePage() {
        assertNull(HomePageRead.dials("<html><body>Today</body></html>"));
        assertNull(HomePageRead.dials(dial("sleep", "Sleep 74 percent", "74")));
    }

    @Test
    public void loginAndTheAccessProxyAreSignInWalls() {
        assertTrue(HomePageRead.loginLocation("/login"));
        assertTrue(HomePageRead.loginLocation("https://pulse.example.com/login?from=/"));
        assertFalse(HomePageRead.loginLocation("https://pulse.example.com/"));
        assertFalse(HomePageRead.loginLocation("https://pulse.example.com/sleep"));
        assertTrue(HomePageRead.signInLocation("https://team.cloudflareaccess.com/cdn-cgi/access/login"));
        assertFalse(HomePageRead.loginLocation("https://team.cloudflareaccess.com/cdn-cgi/access/login"));
        assertFalse(HomePageRead.signInLocation("https://pulse.example.com/coach"));
    }

    private static String dial(String name, String aria, String value) {
        return "<a data-dial=\"" + name + "\" aria-label=\"" + aria + "\" href=\"/" + name + "\">"
            + "<span data-dial-part=\"value\">" + value + "</span></a>";
    }
}
