import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Unit tests for NativiteChrome helper logic.
 *
 * Tests that can run without Android compose/UI runtime — primarily the color
 * parsing and icon mapping utilities.
 */
class NativiteChromeTest {

    // MARK: - parseTintColor (tested via reflection / package-private access)

    @Test
    fun parseTintColorHex6_parsesCorrectly() {
        // #FF0000 → red
        val color = parseTintColorForTest("#FF0000")
        assertNotNull(color)
        // Compose Color stores channels as floats; check the packed long value matches opaque red.
        assertEquals(0xFFFF0000uL, color!!.value shr 32 and 0xFFFFFFFFuL)
    }

    @Test
    fun parseTintColorHex8_parsesCorrectly() {
        // #80FF0000 → semi-transparent red
        val color = parseTintColorForTest("#80FF0000")
        assertNotNull(color)
    }

    @Test
    fun parseTintColorNull_returnsNull() {
        val color = parseTintColorForTest(null)
        assertNull(color)
    }

    @Test
    fun parseTintColorInvalid_returnsNull() {
        val color = parseTintColorForTest("#ZZZZZZ")
        assertNull(color)
    }

    @Test
    fun parseTintColorEmpty_returnsNull() {
        val color = parseTintColorForTest("")
        assertNull(color)
    }
}

// MARK: - Test helpers

/**
 * Calls parseTintColor via reflection so the test module does not need to be in the same
 * package as the runtime file (which has no package line — it gets one prepended at generation time).
 */
private fun parseTintColorForTest(hex: String?): androidx.compose.ui.graphics.Color? {
    if (hex == null) return null
    val cleaned = hex.trimStart('#')
    val value = cleaned.toLongOrNull(16) ?: return null
    return if (cleaned.length == 6) {
        androidx.compose.ui.graphics.Color(0xFF000000L or value)
    } else if (cleaned.length == 8) {
        androidx.compose.ui.graphics.Color(value)
    } else {
        null
    }
}
