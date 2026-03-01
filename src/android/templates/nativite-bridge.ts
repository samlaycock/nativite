import type { NativiteConfig } from "../../index.ts";

export function nativiteBridgeTemplate(config: NativiteConfig): string {
  const pkg = config.app.bundleId;
  const defaultChromeJson = config.defaultChrome
    ? JSON.stringify(JSON.stringify(config.defaultChrome))
    : "null";

  return `package ${pkg}

import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebMessagePortCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

typealias NativiteHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

class NativiteBridge {
    val chromeState: MutableState<Map<String, Any?>> = mutableStateOf(emptyMap())
    private val mainHandler = Handler(Looper.getMainLooper())
    private val handlers = mutableMapOf<String, NativiteHandler>()

    private var primaryWebView: WebView? = null
    private var primaryPort: WebMessagePortCompat? = null
    private val childWebViews = mutableMapOf<String, WebView>()
    private val childPorts = mutableMapOf<String, WebMessagePortCompat>()

    fun register(namespace: String, method: String, handler: NativiteHandler) {
        handlers["$namespace.$method"] = handler
    }

    fun attachWebView(webView: WebView, instanceName: String = "main") {
        if (instanceName == "main") {
            primaryWebView = webView
        } else {
            childWebViews[instanceName] = webView
        }

        setupWebMessageChannel(webView, instanceName)
    }

    fun detachWebView(instanceName: String) {
        if (instanceName == "main") {
            primaryPort?.close()
            primaryPort = null
            primaryWebView = null
        } else {
            childPorts[instanceName]?.close()
            childPorts.remove(instanceName)
            childWebViews.remove(instanceName)
        }
    }

    private fun setupWebMessageChannel(webView: WebView, instanceName: String) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL)) return
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE)) return
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_PORT_SET_MESSAGE_CALLBACK)) return

        val channel = WebViewCompat.createWebMessageChannel(webView)
        val nativePort = channel[0]
        val jsPort = channel[1]

        if (instanceName == "main") {
            primaryPort = nativePort
        } else {
            childPorts[instanceName] = nativePort
        }

        nativePort.setWebMessageCallback(object : WebMessagePortCompat.WebMessageCallbackCompat() {
            override fun onMessage(port: WebMessagePortCompat, message: WebMessageCompat?) {
                val data = message?.data ?: return
                handleMessage(data, instanceName, nativePort)
            }
        })

        // Transfer the JS port to the web page
        WebViewCompat.postWebMessage(
            webView,
            WebMessageCompat("__nativite_port__", arrayOf(jsPort)),
            android.net.Uri.parse("*"),
        )
    }

    private fun handleMessage(json: String, senderInstance: String, replyPort: WebMessagePortCompat) {
        try {
            val msg = JSONObject(json)
            val id = if (msg.isNull("id")) null else msg.optString("id")
            val type = msg.optString("type")
            if (type != "call") return

            val namespace = msg.optString("namespace")
            val method = msg.optString("method")
            val args = msg.opt("args")

            // Built-in chrome handlers
            when {
                namespace == "__chrome__" && method == "__chrome_set_state__" -> {
                    @Suppress("UNCHECKED_CAST")
                    val state = jsonToMap(msg.optJSONObject("args"))
                    mainHandler.post { chromeState.value = state }
                    if (id != null) replyPort.postMessage(WebMessageCompat(replyJson(id, null)))
                    return
                }
                namespace == "__chrome__" && method == "__chrome_messaging_post_to_parent__" -> {
                    postMessageToParent(senderInstance, args)
                    if (id != null) replyPort.postMessage(WebMessageCompat(replyJson(id, null)))
                    return
                }
                namespace == "__chrome__" && method == "__chrome_messaging_post_to_child__" -> {
                    val childArgs = msg.optJSONObject("args")
                    val name = childArgs?.optString("name") ?: ""
                    val payload = childArgs?.opt("payload")
                    postMessageToChild(name, payload)
                    if (id != null) replyPort.postMessage(WebMessageCompat(replyJson(id, null)))
                    return
                }
                namespace == "__chrome__" && method == "__chrome_messaging_broadcast__" -> {
                    broadcastMessage(senderInstance, args)
                    if (id != null) replyPort.postMessage(WebMessageCompat(replyJson(id, null)))
                    return
                }
            }

            // Plugin handlers
            val key = "$namespace.$method"
            val handler = handlers[key]
            if (handler != null) {
                handler(args) { result ->
                    if (id != null) {
                        val reply = result.fold(
                            onSuccess = { replyJson(id, it) },
                            onFailure = { errorJson(id, it.message ?: "Unknown error") },
                        )
                        replyPort.postMessage(WebMessageCompat(reply))
                    }
                }
            } else if (id != null) {
                replyPort.postMessage(WebMessageCompat(errorJson(id, "No handler for $key")))
            }
        } catch (e: Exception) {
            // Silently ignore malformed messages
        }
    }

    // ─── Event dispatch ─────────────────────────────────────────────────────

    fun sendEvent(webView: WebView, name: String, data: Any?) {
        val event = JSONObject().apply {
            put("id", JSONObject.NULL)
            put("type", "event")
            put("event", name)
            put("data", data ?: JSONObject.NULL)
        }
        val js = "window.nativiteReceive(\${event})"
        mainHandler.post { webView.evaluateJavascript(js, null) }
    }

    fun sendEventToPrimary(name: String, data: Any?) {
        primaryWebView?.let { sendEvent(it, name, data) }
    }

    // ─── Inter-webview messaging ────────────────────────────────────────────

    private fun postMessageToParent(senderInstance: String, payload: Any?) {
        val eventData = JSONObject().apply {
            put("from", senderInstance)
            put("payload", payload ?: JSONObject.NULL)
        }
        primaryWebView?.let { sendEvent(it, "message", eventData) }
    }

    private fun postMessageToChild(name: String, payload: Any?) {
        val child = childWebViews[name] ?: return
        val eventData = JSONObject().apply {
            put("from", "main")
            put("payload", payload ?: JSONObject.NULL)
        }
        sendEvent(child, "message", eventData)
    }

    private fun broadcastMessage(senderInstance: String, payload: Any?) {
        val eventData = JSONObject().apply {
            put("from", senderInstance)
            put("payload", payload ?: JSONObject.NULL)
        }
        // Send to primary if sender is not primary
        if (senderInstance != "main") {
            primaryWebView?.let { sendEvent(it, "message", eventData) }
        }
        // Send to all children except sender
        for ((name, webView) in childWebViews) {
            if (name != senderInstance) {
                sendEvent(webView, "message", eventData)
            }
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    fun getDefaultChromeState(): Map<String, Any?>? {
        val json = ${defaultChromeJson} ?: return null
        return try {
            jsonToMap(JSONObject(json))
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        private fun replyJson(id: String, result: Any?): String {
            val obj = JSONObject().apply {
                put("id", id)
                put("result", result ?: JSONObject.NULL)
            }
            return obj.toString()
        }

        private fun errorJson(id: String, message: String): String {
            val obj = JSONObject().apply {
                put("id", id)
                put("error", message)
            }
            return obj.toString()
        }

        fun jsonToMap(json: JSONObject?): Map<String, Any?> {
            if (json == null) return emptyMap()
            val map = mutableMapOf<String, Any?>()
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = json.opt(key)
                map[key] = when (value) {
                    JSONObject.NULL -> null
                    is JSONObject -> jsonToMap(value)
                    is org.json.JSONArray -> jsonArrayToList(value)
                    else -> value
                }
            }
            return map
        }

        private fun jsonArrayToList(array: org.json.JSONArray): List<Any?> {
            val list = mutableListOf<Any?>()
            for (i in 0 until array.length()) {
                val value = array.opt(i)
                list.add(
                    when (value) {
                        JSONObject.NULL -> null
                        is JSONObject -> jsonToMap(value)
                        is org.json.JSONArray -> jsonArrayToList(value)
                        else -> value
                    }
                )
            }
            return list
        }
    }
}
`;
}
