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

    @Test
    fun buildInitScript_includesSharedKeyboardAndAppearanceDefaults() {
        val script = NativiteVars.buildInitScript()
        assertTrue("keyboard floating defaults to 0", script.contains("--nv-keyboard-floating:0"))
        assertTrue("keyboard duration defaults to 250ms", script.contains("--nv-keyboard-duration:250ms"))
        assertTrue("keyboard curve defaults to ease-in-out", script.contains("--nv-keyboard-curve:ease-in-out"))
        assertTrue("display scale default is present", script.contains("--nv-display-scale:2"))
        assertTrue("accent default is present", script.contains("--nv-accent:rgb(var(--nv-accent-r),var(--nv-accent-g),var(--nv-accent-b))"))
    }

    @Test
    fun buildInitScript_doesNotIncludeUndocumentedSidebarVariables() {
        val script = NativiteVars.buildInitScript()
        assertTrue("sidebar width css var should not be emitted", !script.contains("--nv-sidebar-width"))
        assertTrue("sidebar visible css var should not be emitted", !script.contains("--nv-sidebar-visible"))
    }
}
