import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for NativiteVars.
 *
 * These tests validate the JS init-script generation logic that can be exercised
 * without an Android runtime (no Robolectric or instrumented test required).
 */
class NativiteVarsTest {

    @Test
    fun buildInitScript_containsStyleElementCreation() {
        val script = NativiteVars.buildInitScript()
        assertTrue("init script must create __nv_vars__ style element", script.contains("__nv_vars__"))
    }

    @Test
    fun buildInitScript_definesPatchHelper() {
        val script = NativiteVars.buildInitScript()
        assertTrue("init script must define __nv_patch", script.contains("__nv_patch"))
    }

    @Test
    fun buildInitScript_setsColorScheme() {
        val script = NativiteVars.buildInitScript()
        assertTrue("init script must set color-scheme", script.contains("color-scheme"))
    }

    @Test
    fun buildInitScript_setsDefaultSafeAreaZero() {
        val script = NativiteVars.buildInitScript()
        assertTrue("safe-top defaults to 0", script.contains("--nv-safe-top:0px"))
        assertTrue("safe-bottom defaults to 0", script.contains("--nv-safe-bottom:0px"))
    }

    @Test
    fun buildInitScript_setsKeyboardDefaults() {
        val script = NativiteVars.buildInitScript()
        assertTrue("keyboard height defaults to 0", script.contains("--nv-keyboard-height:0px"))
        assertTrue("keyboard visible defaults to 0", script.contains("--nv-keyboard-visible:0"))
    }

    @Test
    fun buildInitScript_setsDefaultsPlatformAndThemeAttributes() {
        val script = NativiteVars.buildInitScript()
        assertTrue("data-nv-theme attribute is set", script.contains("data-nv-theme"))
    }
}
