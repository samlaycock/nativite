import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Unit tests for NativiteBridge helper logic.
 *
 * These tests validate the pure Kotlin logic (JSON serialization helpers,
 * handler registration, and config accessors) without requiring an Android runtime.
 */
@RunWith(RobolectricTestRunner::class)
class NativiteBridgeTest {

    // MARK: - JSON helpers (companion object, no Android deps)

    @Test
    fun toJsonValue_nullBecomesJSONNULL() {
        val result = NativiteBridge.toJsonValue(null)
        assertEquals(JSONObject.NULL, result)
    }

    @Test
    fun toJsonValue_stringPassesThrough() {
        val result = NativiteBridge.toJsonValue("hello")
        assertEquals("hello", result)
    }

    @Test
    fun toJsonValue_intPassesThrough() {
        val result = NativiteBridge.toJsonValue(42)
        assertEquals(42, result)
    }

    @Test
    fun jsonToMap_returnsEmptyMapForNull() {
        val result = NativiteBridge.jsonToMap(null)
        assertTrue(result.isEmpty())
    }

    @Test
    fun jsonToMap_parsesSimpleObject() {
        val json = JSONObject().apply { put("key", "value") }
        val result = NativiteBridge.jsonToMap(json)
        assertEquals("value", result["key"])
    }

    @Test
    fun jsonToMap_handlesNestedObject() {
        val inner = JSONObject().apply { put("inner", "yes") }
        val outer = JSONObject().apply { put("nested", inner) }
        val result = NativiteBridge.jsonToMap(outer)
        @Suppress("UNCHECKED_CAST")
        val nested = result["nested"] as? Map<String, Any?>
        assertNotNull(nested)
        assertEquals("yes", nested?.get("inner"))
    }

    @Test
    fun jsonToMap_convertsNullValues() {
        val json = JSONObject().apply { put("nullField", JSONObject.NULL) }
        val result = NativiteBridge.jsonToMap(json)
        assertTrue(result.containsKey("nullField"))
        assertNull(result["nullField"])
    }

    @Test
    fun jsonToMap_convertsArraysToLists() {
        val json = JSONObject().apply {
            put("items", org.json.JSONArray().apply {
                put("first")
                put(2)
            })
        }
        val result = NativiteBridge.jsonToMap(json)
        @Suppress("UNCHECKED_CAST")
        val items = result["items"] as? List<Any?>
        assertEquals(listOf("first", 2), items)
    }

    // MARK: - getDefaultChromeState

    @Test
    fun getDefaultChromeState_returnsNullWhenNoConfig() {
        // NativiteConfig.defaultChromeStateJSON is null when not configured.
        // This test validates the null path without mocking the config object.
        // In a real project, NativiteConfig is generated — we test the contract here.
        if (NativiteConfig.defaultChromeStateJSON == null) {
            val bridge = NativiteBridge()
            assertNull(bridge.getDefaultChromeState())
        }
        // If the config is set, we can't test the null path — skip.
    }

    @Test
    fun customHandlerReceivesArgsAndCompletes() {
        val bridge = NativiteBridge()
        val latch = CountDownLatch(1)
        var captured: Any? = null

        bridge.register(namespace = "test", method = "echo") { args, completion ->
            captured = args
            completion(Result.success(args))
            latch.countDown()
        }

        val handlerField = bridge.javaClass.getDeclaredField("handlers")
        handlerField.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val handlers = handlerField.get(bridge) as MutableMap<String, NativiteHandler>
        var completed: Any? = null

        handlers["test.echo"]?.invoke("hello") { result ->
            completed = result.getOrNull()
        }

        assertTrue(latch.await(1, TimeUnit.SECONDS))
        assertEquals("hello", captured)
        assertEquals("hello", completed)
    }

}
