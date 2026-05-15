import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class NativiteBackgroundBridgeTest {
    @Test
    fun scheduleHandlerCompletesWithFailureWhenManifestLoadFails() {
        val bridge = NativiteBridge()
        val bridgeClass = bridge.javaClass
        val contextField = bridgeClass.getDeclaredField("applicationContext")
        contextField.isAccessible = true
        contextField.set(bridge, ApplicationProvider.getApplicationContext<Context>())

        registerNativiteBackgroundBridge(bridge) {
            throw IllegalStateException("manifest failed")
        }

        val handlerField = bridgeClass.getDeclaredField("handlers")
        handlerField.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val handlers = handlerField.get(bridge) as MutableMap<String, NativiteHandler>
        var completed: Result<Any?>? = null

        handlers["__background__.schedule"]?.invoke(JSONObject().apply { put("id", "sync-inbox") }) { result ->
            completed = result
        }

        val result = completed ?: throw AssertionError("Expected schedule handler to complete.")
        assertFalse(result.isSuccess)
        assertEquals("manifest failed", result.exceptionOrNull()?.message)
    }
}
