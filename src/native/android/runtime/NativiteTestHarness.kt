import android.content.Context
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.time.Instant
import java.util.UUID
import kotlin.concurrent.thread

private const val NATIVITE_TEST_PROTOCOL_VERSION = 1
private val NATIVITE_TEST_CAPABILITIES = listOf(
    "runtime.ready",
    "chrome.snapshot.read",
    "chrome.areas.read",
    "logs.read",
    "viewTree.read",
    "screenshot.capture",
)

object NativiteTestHarness {
    val isEnabled: Boolean
        get() = BuildConfig.DEBUG &&
            BuildConfig.NATIVITE_TEST_HARNESS &&
            BuildConfig.NATIVITE_TEST_URL.isNotBlank() &&
            BuildConfig.NATIVITE_COORDINATOR_URL.isNotBlank() &&
            BuildConfig.NATIVITE_TEST_SESSION_TOKEN.isNotBlank()

    val testUrl: String?
        get() = if (isEnabled) normalizeHarnessUrl(BuildConfig.NATIVITE_TEST_URL) else null

    fun register(context: Context) {
        if (!BuildConfig.DEBUG || !BuildConfig.NATIVITE_TEST_HARNESS) return
        if (!isEnabled) {
            println("[NativiteTestHarness] Disabled: missing test URL, coordinator URL, or session token.")
            return
        }

        thread(name = "NativiteTestHarness.register") {
            postEvent(
                type = "harness.register",
                payload = JSONObject().apply {
                    put("appId", context.packageName)
                    put("runtimeVersion", "1.0.0")
                    put("protocolVersion", NATIVITE_TEST_PROTOCOL_VERSION)
                    put("platform", "android")
                    put("deviceId", Build.FINGERPRINT)
                    put("deviceName", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                    put("targetId", BuildConfig.NATIVITE_TEST_TARGET_ID)
                    put("testUrl", testUrl)
                    put("capabilities", JSONArray(NATIVITE_TEST_CAPABILITIES))
                    put("timeouts", timeoutPayload())
                },
            )
            postEvent(
                type = "runtime.ready",
                payload = JSONObject().apply {
                    put("platform", "android")
                    put("appId", context.packageName)
                    put("debug", BuildConfig.DEBUG)
                    put("packageName", context.packageName)
                },
            )
        }
    }

    fun webViewReady(url: String?) {
        if (!isEnabled) return
        thread(name = "NativiteTestHarness.webviewReady") {
            postEvent(
                type = "webview.ready",
                payload = JSONObject().apply {
                    put("url", url)
                },
            )
        }
    }

    private fun postEvent(type: String, payload: JSONObject) {
        val endpoint = normalizeHarnessUrl(BuildConfig.NATIVITE_COORDINATOR_URL)
        val connection = URL(endpoint).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = BuildConfig.NATIVITE_COORDINATOR_TIMEOUT_MS
        connection.readTimeout = BuildConfig.NATIVITE_COORDINATOR_TIMEOUT_MS
        connection.doOutput = true
        connection.setRequestProperty("content-type", "application/json")

        val envelope = JSONObject().apply {
            put("protocol", "nativite.test")
            put("version", NATIVITE_TEST_PROTOCOL_VERSION)
            put("sessionId", BuildConfig.NATIVITE_TEST_SESSION_ID)
            put("requestId", UUID.randomUUID().toString())
            put("timestamp", Instant.now().toString())
            put("type", type)
            put("token", BuildConfig.NATIVITE_TEST_SESSION_TOKEN)
            put("payload", payload)
        }

        try {
            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(envelope.toString())
            }

            val responseCode = connection.responseCode
            if (responseCode in 200..299) {
                connection.inputStream.close()
            } else {
                connection.errorStream?.close()
                println("[NativiteTestHarness] Coordinator rejected $type with HTTP $responseCode.")
            }
        } catch (error: Exception) {
            println("[NativiteTestHarness] Failed to send $type: ${error.message ?: error.javaClass.simpleName}.")
        } finally {
            connection.disconnect()
        }
    }

    private fun timeoutPayload(): JSONObject {
        return JSONObject().apply {
            put("launchMs", BuildConfig.NATIVITE_TEST_LAUNCH_TIMEOUT_MS)
            put("webViewReadyMs", BuildConfig.NATIVITE_TEST_WEBVIEW_READY_TIMEOUT_MS)
            put("coordinatorMs", BuildConfig.NATIVITE_COORDINATOR_TIMEOUT_MS)
        }
    }
}

private fun normalizeHarnessUrl(rawUrl: String): String {
    return try {
        val uri = URI(rawUrl)
        val host = uri.host ?: return rawUrl
        if (host != "localhost" && host != "127.0.0.1" && host != "::1") return rawUrl
        URI(uri.scheme, uri.userInfo, "10.0.2.2", uri.port, uri.path, uri.query, uri.fragment)
            .toString()
    } catch (_: Exception) {
        rawUrl
    }
}
