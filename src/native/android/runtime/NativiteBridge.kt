import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebMessagePortCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

typealias NativiteHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

open class NativiteBridge {
    val chromeState: MutableState<Map<String, Any?>> = mutableStateOf(emptyMap())
    /** Controls the Android splash screen keep-on-screen condition. */
    val splashKeepOnScreen: MutableState<Boolean> = mutableStateOf(false)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val handlers = mutableMapOf<String, NativiteHandler>()
    private var applicationContext: Context? = null
    private var activity: ComponentActivity? = null
    private val permissionCompletions = mutableMapOf<Int, (Boolean) -> Unit>()

    private var primaryWebView: WebView? = null
    private var primaryPort: WebMessagePortCompat? = null
    private var primaryVars: NativiteVars? = null
    private val lastChromeRevisionByDocId = mutableMapOf<String, Int>()
    private val childWebViews = mutableMapOf<String, WebView>()
    private val childPorts = mutableMapOf<String, WebMessagePortCompat>()
    private val nclpLeafKinds = setOf("item", "title", "search", "separator", "spacer", "statusBar", "homeIndicator")
    private data class ChromeGeometry(
        val navHeightPx: Int = 0,
        val navVisible: Boolean = false,
        val tabHeightPx: Int = 0,
        val tabVisible: Boolean = false,
        val toolbarHeightPx: Int = 0,
        val toolbarVisible: Boolean = false,
    )
    private var chromeGeometry = ChromeGeometry()

    init {
        registerBuiltinHandlers()
    }

    fun register(namespace: String, method: String, handler: NativiteHandler) {
        handlers["$namespace.$method"] = handler
    }

    fun applicationContextOrNull(): Context? = applicationContext

    fun activityOrNull(): ComponentActivity? = activity

    fun requestPermission(permission: String, requestCode: Int, completion: (Boolean) -> Unit): Boolean {
        val currentActivity = activity ?: return false
        permissionCompletions[requestCode] = completion
        ActivityCompat.requestPermissions(currentActivity, arrayOf(permission), requestCode)
        return true
    }

    fun onRequestPermissionsResult(requestCode: Int, grantResults: IntArray): Boolean {
        val completion = permissionCompletions.remove(requestCode) ?: return false
        completion(grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED)
        return true
    }

    private fun registerBuiltinHandlers() {
        register(namespace = "__nativite__", method = "__ping__") { _, completion ->
            completion(Result.success("pong"))
        }

        register(namespace = "__nativite__", method = "__ota_check__") { _, completion ->
            completion(Result.success(mapOf("available" to false)))
        }

        register(namespace = "__background__", method = "schedule") { args, completion ->
            val context = applicationContext
            val request = args as? JSONObject
            val taskId = request?.optString("id") ?: ""
            if (context == null) {
                completion(Result.failure(IllegalStateException("Nativite background scheduler is not attached to a WebView context.")))
                return@register
            }
            val tasks = try {
                loadBackgroundTaskManifest(context)
            } catch (err: Exception) {
                completion(Result.failure(err))
                return@register
            }
            val task = tasks.firstOrNull { it.id == taskId }
            if (task == null) {
                completion(Result.failure(IllegalArgumentException("Unknown Nativite background task: $taskId")))
                return@register
            }
            val android = task.androidOptions
            if (android == null || !android.isSchedulable) {
                completion(Result.failure(IllegalArgumentException("Background task $taskId is not supported on Android.")))
                return@register
            }
            NativiteBackgroundWorkScheduler.schedule(context, task, request?.optString("payload", "null"))
            completion(Result.success(mapOf("id" to taskId, "state" to "scheduled", "platform" to "android")))
        }

        register(namespace = "__background__", method = "cancel") { args, completion ->
            val context = applicationContext
            val taskId = (args as? JSONObject)?.optString("id") ?: ""
            if (context == null) {
                completion(Result.failure(IllegalStateException("Nativite background scheduler is not attached to a WebView context.")))
                return@register
            }
            NativiteBackgroundWorkScheduler.cancel(context, taskId)
            completion(Result.success(mapOf("id" to taskId, "state" to "cancelled", "platform" to "android")))
        }

        register(namespace = "__background__", method = "getStatus") { args, completion ->
            val context = applicationContext
            val taskId = (args as? JSONObject)?.optString("id") ?: ""
            if (context == null) {
                completion(Result.failure(IllegalStateException("Nativite background scheduler is not attached to a WebView context.")))
                return@register
            }
            NativiteBackgroundWorkScheduler.status(context, taskId) { status ->
                completion(Result.success(status))
            }
        }
    }

    internal open fun loadBackgroundTaskManifest(context: Context): List<NativiteBackgroundTask> =
        NativiteBackgroundTasks.loadManifest(context)

    fun attachWebView(webView: WebView, instanceName: String = "main") {
        applicationContext = webView.context.applicationContext
        activity = webView.context.findActivity()
        if (instanceName == "main") {
            primaryWebView = webView
            primaryVars = NativiteVars(webView, this).also { it.startObserving() }
            updateRenderedChromeGeometry(
                navHeightPx = chromeGeometry.navHeightPx,
                navVisible = chromeGeometry.navVisible,
                tabHeightPx = chromeGeometry.tabHeightPx,
                tabVisible = chromeGeometry.tabVisible,
                toolbarHeightPx = chromeGeometry.toolbarHeightPx,
                toolbarVisible = chromeGeometry.toolbarVisible,
            )
        } else {
            childWebViews[instanceName] = webView
        }

        setupWebMessageChannel(webView, instanceName)
    }

    fun detachWebView(instanceName: String) {
        if (instanceName == "main") {
            primaryPort?.close()
            primaryPort = null
            primaryVars = null
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
            if (type == "chrome.snapshot") {
                if (!acceptChromeSnapshot(msg)) return
                mainHandler.post {
                    chromeState.value = legacyChromeStateFromSnapshot(msg)
                }
                return
            }
            if (type != "call") return

            val namespace = msg.optString("namespace")
            val method = msg.optString("method")
            val args = msg.opt("args")

            // Built-in chrome handlers
            when {
                namespace == "__chrome__" && method == "__chrome_set_state__" -> {
                    @Suppress("UNCHECKED_CAST")
                    val state = jsonToMap(msg.optJSONObject("args"))
                    mainHandler.post {
                        chromeState.value = state
                    }
                    if (id != null) replyPort.postMessage(WebMessageCompat(replyJson(id, null)))
                    return
                }
                namespace == "__chrome__" && method == "__chrome_splash_hide__" -> {
                    mainHandler.post { splashKeepOnScreen.value = false }
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

    private fun acceptChromeSnapshot(snapshot: JSONObject): Boolean {
        if (snapshot.optInt("nativite") != 2) return false
        if (snapshot.optString("type") != "chrome.snapshot") return false
        val docId = snapshot.optString("docId")
        if (docId.isEmpty()) return false
        val revision = snapshot.optInt("revision")
        if (revision <= 0) return false
        val rootId = snapshot.optString("root")
        if (rootId.isEmpty()) return false
        val nodes = snapshot.optJSONObject("nodes") ?: return false
        if (nodes.length() > MAX_CHROME_SNAPSHOT_NODES) return false
        val state = snapshot.optJSONObject("state") ?: return false
        for (bucket in listOf("selected", "disabled", "hidden", "badges", "values")) {
            if (state.optJSONObject(bucket) == null) return false
        }
        val root = nodes.optJSONObject(rootId) ?: return false
        if (root.optString("id") != rootId) return false
        val lastRevision = lastChromeRevisionByDocId[docId]
        if (lastRevision != null && revision <= lastRevision) return false
        val keys = nodes.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val node = nodes.optJSONObject(key) ?: return false
            val kind = node.optString("kind")
            if (key.isEmpty()) return false
            if (node.optString("id") != key) return false
            if (kind.isEmpty()) return false
            val children = node.optJSONArray("children")
            if (children != null) {
                if (children.length() > MAX_CHROME_SNAPSHOT_CHILDREN) return false
                if (nclpLeafKinds.contains(kind)) return false
                for (i in 0 until children.length()) {
                    val child = nodes.optJSONObject(children.optString(i)) ?: return false
                    if (!allowsChildKind(kind, child.optString("kind"))) return false
                }
            } else if (requiresChildren(kind)) {
                return false
            }
        }
        if (!isReachableAcyclicGraph(rootId, nodes)) return false
        lastChromeRevisionByDocId[docId] = revision
        return true
    }

    private fun requiresChildren(kind: String): Boolean {
        return setOf("window", "titleBar", "toolbar", "tabs", "sidebar", "menuBar", "menu", "section", "group", "keyboard", "stack", "split").contains(kind)
    }

    private fun allowsChildKind(parentKind: String, childKind: String): Boolean {
        return when (parentKind) {
            "tabs" -> childKind == "tab"
            "tab" -> childKind == "search"
            "action" -> childKind == "menu"
            "menuBar" -> childKind == "menu"
            "menu" -> setOf("action", "item", "separator", "section", "group").contains(childKind)
            "toolbar" -> setOf("action", "search", "spacer", "separator", "group").contains(childKind)
            "titleBar" -> setOf("title", "action", "search", "spacer", "separator").contains(childKind)
            "keyboard" -> setOf("action", "spacer", "separator").contains(childKind)
            else -> true
        }
    }

    private fun isReachableAcyclicGraph(rootId: String, nodes: JSONObject): Boolean {
        val visiting = mutableSetOf<String>()
        val visited = mutableSetOf<String>()

        fun visit(id: String): Boolean {
            if (visiting.contains(id)) return false
            if (visited.contains(id)) return true
            val node = nodes.optJSONObject(id) ?: return false
            visiting.add(id)
            val children = node.optJSONArray("children")
            if (children != null) {
                for (i in 0 until children.length()) {
                    if (!visit(children.optString(i))) return false
                }
            }
            visiting.remove(id)
            visited.add(id)
            return true
        }

        return visit(rootId) && visited.size == nodes.length()
    }

    // ─── Event dispatch ─────────────────────────────────────────────────────

    fun sendEvent(webView: WebView, name: String, data: Any?) {
        val event = chromeEventPayload(name, data) ?: JSONObject().apply {
            put("id", JSONObject.NULL)
            put("type", "event")
            put("event", name)
            put("data", toJsonValue(data))
        }
        val js = "window.nativiteReceive(${event})"
        mainHandler.post { webView.evaluateJavascript(js, null) }
    }

    fun sendEventToPrimary(name: String, data: Map<String, Any?>?) {
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

    // ─── Chrome geometry CSS vars ──────────────────────────────────────────

    fun updateRenderedChromeGeometry(
        navHeightPx: Int,
        navVisible: Boolean,
        tabHeightPx: Int,
        tabVisible: Boolean,
        toolbarHeightPx: Int,
        toolbarVisible: Boolean,
    ) {
        val next = ChromeGeometry(
            navHeightPx = navHeightPx,
            navVisible = navVisible,
            tabHeightPx = tabHeightPx,
            tabVisible = tabVisible,
            toolbarHeightPx = toolbarHeightPx,
            toolbarVisible = toolbarVisible,
        )
        if (next == chromeGeometry) return
        chromeGeometry = next

        val vars = primaryVars ?: return

        vars.pushCustomVars(mapOf(
            "--nv-nav-height" to "${navHeightPx}px",
            "--nv-nav-visible" to if (navVisible) "1" else "0",
            "--nv-tab-height" to "${tabHeightPx}px",
            "--nv-tab-visible" to if (tabVisible) "1" else "0",
            "--nv-toolbar-height" to "${toolbarHeightPx}px",
            "--nv-toolbar-visible" to if (toolbarVisible) "1" else "0",
        ))
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    fun getDefaultChromeState(): Map<String, Any?>? {
        val json: String = NativiteConfig.defaultChromeStateJSON ?: return null
        return try {
            jsonToMap(JSONObject(json))
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        private const val MAX_CHROME_SNAPSHOT_NODES = 500
        private const val MAX_CHROME_SNAPSHOT_CHILDREN = 200

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

        /** Convert a Kotlin value to a JSON-safe type for JSONObject.put(). */
        fun toJsonValue(value: Any?): Any {
            return when (value) {
                null -> JSONObject.NULL
                is JSONObject, is org.json.JSONArray -> value
                is Map<*, *> -> mapToJsonObject(value)
                is List<*> -> listToJsonArray(value)
                is Boolean, is Number, is String -> value
                else -> value.toString()
            }
        }

        private fun mapToJsonObject(map: Map<*, *>): JSONObject {
            val obj = JSONObject()
            for ((key, value) in map) {
                obj.put(key.toString(), toJsonValue(value))
            }
            return obj
        }

        private fun listToJsonArray(list: List<*>): org.json.JSONArray {
            val array = org.json.JSONArray()
            for (value in list) {
                array.put(toJsonValue(value))
            }
            return array
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

        fun legacyChromeStateFromSnapshot(snapshot: JSONObject): Map<String, Any?> {
            val nodes = snapshot.optJSONObject("nodes") ?: return emptyMap()
            val buckets = snapshot.optJSONObject("state")
            val selected = buckets?.optJSONObject("selected")
            val disabled = buckets?.optJSONObject("disabled")
            val hidden = buckets?.optJSONObject("hidden")
            val badges = buckets?.optJSONObject("badges")
            val values = buckets?.optJSONObject("values")
            val rootChildren = nodes.optJSONObject("root")?.optJSONArray("children") ?: return emptyMap()
            val state = mutableMapOf<String, Any?>()

            for (i in 0 until rootChildren.length()) {
                val area = rootChildren.optString(i)
                when (area) {
                    "titleBar" -> {
                        val title = nodes.optJSONObject("titleBar:title") ?: continue
                        val config = jsonToMap(title.optJSONObject("meta")).toMutableMap()
                        if (title.has("label")) config["title"] = title.opt("label")
                        val barChildren = nodes.optJSONObject("titleBar")?.optJSONArray("children") ?: org.json.JSONArray()
                        val leadingItems = mutableListOf<Map<String, Any?>>()
                        val trailingItems = mutableListOf<Map<String, Any?>>()
                        for (j in 0 until barChildren.length()) {
                            val nodeId = barChildren.optString(j)
                            val item = legacyBarItem(nodeId, nodes, disabled, badges) ?: continue
                            when {
                                nodeId.startsWith("titleBar:leading:") -> leadingItems.add(item)
                                nodeId.startsWith("titleBar:trailing:") -> trailingItems.add(item)
                            }
                        }
                        if (leadingItems.isNotEmpty()) config["leadingItems"] = leadingItems
                        if (trailingItems.isNotEmpty()) config["trailingItems"] = trailingItems
                        nodes.optJSONObject("titleBar:search")?.let { search ->
                            val searchBar = jsonToMap(search.optJSONObject("meta")).toMutableMap()
                            if (values?.has("titleBar:search") == true) searchBar["value"] = values.opt("titleBar:search")
                            config["searchBar"] = searchBar
                        }
                        if (hidden?.has("titleBar") == true) config["hidden"] = hidden.opt("titleBar")
                        state["titleBar"] = config
                    }
                    "navigation" -> {
                        val node = nodes.optJSONObject("navigation") ?: continue
                        val config = jsonToMap(node.optJSONObject("meta")).toMutableMap()
                        val children = node.optJSONArray("children") ?: org.json.JSONArray()
                        val items = mutableListOf<Map<String, Any?>>()
                        for (j in 0 until children.length()) {
                            val nodeId = children.optString(j)
                            val child = nodes.optJSONObject(nodeId) ?: continue
                            val item = jsonToMap(child.optJSONObject("meta")).toMutableMap()
                            item["id"] = nodeId.substringAfterLast(":")
                            item["nclpId"] = nodeId
                            item["label"] = child.opt("label")
                            item["icon"] = child.opt("icon")
                            if (disabled?.has(nodeId) == true) item["disabled"] = disabled.opt(nodeId)
                            if (badges?.has(nodeId) == true) item["badge"] = badges.opt(nodeId)
                            items.add(item)
                        }
                        config["items"] = items
                        if (selected?.has("navigation") == true) {
                            config["activeItem"] = selected.optString("navigation").substringAfterLast(":")
                        }
                        if (hidden?.has("navigation") == true) config["hidden"] = hidden.opt("navigation")
                        nodes.optJSONObject("navigation:search-field")?.let { search ->
                            val searchBar = jsonToMap(search.optJSONObject("meta")).toMutableMap()
                            if (values?.has("navigation:search-field") == true) {
                                searchBar["value"] = values.opt("navigation:search-field")
                            }
                            config["searchBar"] = searchBar
                        }
                        state["navigation"] = config
                    }
                    "toolbar" -> {
                        val node = nodes.optJSONObject("toolbar") ?: continue
                        val config = jsonToMap(node.optJSONObject("meta")).toMutableMap()
                        val children = node.optJSONArray("children") ?: org.json.JSONArray()
                        val hasGroups = children.length() > 0 && (0 until children.length()).all {
                            children.optString(it).startsWith("toolbar:group-")
                        }
                        if (hasGroups) {
                            val groups = mutableListOf<Map<String, Any?>>()
                            for (j in 0 until children.length()) {
                                val groupId = children.optString(j)
                                val group = nodes.optJSONObject(groupId) ?: continue
                                val itemIds = group.optJSONArray("children") ?: org.json.JSONArray()
                                val items = mutableListOf<Map<String, Any?>>()
                                for (k in 0 until itemIds.length()) {
                                    legacyBarItem(itemIds.optString(k), nodes, disabled, badges)?.let { items.add(it) }
                                }
                                groups.add(mapOf("placement" to group.opt("placement"), "items" to items))
                            }
                            config["groups"] = groups
                        } else {
                            val items = mutableListOf<Map<String, Any?>>()
                            for (j in 0 until children.length()) {
                                legacyBarItem(children.optString(j), nodes, disabled, badges)?.let { items.add(it) }
                            }
                            config["items"] = items
                        }
                        if (hidden?.has("toolbar") == true) config["hidden"] = hidden.opt("toolbar")
                        config.remove("toolbarId")?.let { config["id"] = it }
                        state["toolbar"] = config
                    }
                    "statusBar" -> {
                        val config = jsonToMap(nodes.optJSONObject("statusBar")?.optJSONObject("meta")).toMutableMap()
                        if (hidden?.has("statusBar") == true) config["hidden"] = hidden.opt("statusBar")
                        state["statusBar"] = config
                    }
                    "homeIndicator" -> {
                        state["homeIndicator"] = mapOf("hidden" to (hidden?.optBoolean("homeIndicator") ?: false))
                    }
                    "keyboard" -> {
                        val node = nodes.optJSONObject("keyboard") ?: continue
                        val config = jsonToMap(node.optJSONObject("meta")).toMutableMap()
                        val itemIds = node.optJSONArray("children") ?: org.json.JSONArray()
                        val items = mutableListOf<Map<String, Any?>>()
                        for (j in 0 until itemIds.length()) {
                            legacyBarItem(itemIds.optString(j), nodes, disabled, badges)?.let { items.add(it) }
                        }
                        if (items.isNotEmpty()) config["accessory"] = mapOf("items" to items)
                        state["keyboard"] = config
                    }
                    "menuBar" -> {
                        val node = nodes.optJSONObject("menuBar") ?: continue
                        val menuIds = node.optJSONArray("children") ?: org.json.JSONArray()
                        val menus = mutableListOf<Map<String, Any?>>()
                        for (j in 0 until menuIds.length()) {
                            val menuId = menuIds.optString(j)
                            val menu = legacyMenu(menuId, nodes, disabled)?.toMutableMap() ?: continue
                            menu["id"] = menuId.substringAfterLast(":")
                            menu["nclpId"] = menuId
                            menus.add(menu)
                        }
                        state["menuBar"] = mapOf("menus" to menus)
                    }
                    "tabBottomAccessory" -> {
                        val config = jsonToMap(nodes.optJSONObject("tabBottomAccessory")?.optJSONObject("meta")).toMutableMap()
                        config["presented"] = !(hidden?.optBoolean("tabBottomAccessory") ?: false)
                        state["tabBottomAccessory"] = config
                    }
                    "sheets", "drawers", "appWindows", "popovers" -> {
                        val group = nodes.optJSONObject(area) ?: continue
                        val children = group.optJSONArray("children") ?: org.json.JSONArray()
                        val collection = mutableMapOf<String, Any?>()
                        for (j in 0 until children.length()) {
                            val nodeId = children.optString(j)
                            val config = jsonToMap(nodes.optJSONObject(nodeId)?.optJSONObject("meta")).toMutableMap()
                            config["presented"] = !(hidden?.optBoolean(nodeId) ?: false)
                            collection[nodeId.substringAfterLast(":")] = config
                        }
                        state[area] = collection
                    }
                }
            }
            return state
        }

        private fun legacyBarItem(
            nodeId: String,
            nodes: JSONObject,
            disabled: JSONObject?,
            badges: JSONObject?,
        ): Map<String, Any?>? {
            val node = nodes.optJSONObject(nodeId) ?: return null
            if (node.optString("kind") == "spacer") {
                val meta = node.optJSONObject("meta")
                return if (meta?.optBoolean("fixed") == true) {
                    mapOf("type" to "fixed-space", "width" to meta.opt("width"))
                } else {
                    mapOf("type" to "flexible-space")
                }
            }
            val item = jsonToMap(node.optJSONObject("meta")).toMutableMap()
            item["id"] = nodeId.substringAfterLast(":")
            item["nclpId"] = nodeId
            if (node.has("label")) item["label"] = node.opt("label")
            if (node.has("icon")) item["icon"] = node.opt("icon")
            val role = node.optString("role")
            if (role == "primary" || role == "destructive") item["style"] = role
            if (disabled?.has(nodeId) == true) item["disabled"] = disabled.opt(nodeId)
            if (badges?.has(nodeId) == true) item["badge"] = badges.opt(nodeId)
            val children = node.optJSONArray("children")
            if (children != null && children.length() > 0) {
                legacyMenu(children.optString(0), nodes, disabled)?.let { item["menu"] = it }
            }
            return item
        }

        private fun legacyMenu(
            nodeId: String,
            nodes: JSONObject,
            disabled: JSONObject?,
        ): Map<String, Any?>? {
            val node = nodes.optJSONObject(nodeId) ?: return null
            val menu = mutableMapOf<String, Any?>()
            if (node.has("label")) menu["title"] = node.opt("label")
            val children = node.optJSONArray("children") ?: org.json.JSONArray()
            val items = mutableListOf<Map<String, Any?>>()
            for (i in 0 until children.length()) {
                val childId = children.optString(i)
                val child = nodes.optJSONObject(childId) ?: continue
                val item = jsonToMap(child.optJSONObject("meta")).toMutableMap()
                item["id"] = childId.substringAfterLast(":")
                item["nclpId"] = childId
                if (child.has("label")) item["label"] = child.opt("label")
                if (child.has("icon")) item["icon"] = child.opt("icon")
                if (child.optString("role") == "destructive") item["style"] = "destructive"
                if (disabled?.has(childId) == true) item["disabled"] = disabled.opt(childId)
                val nested = child.optJSONArray("children")
                if (nested != null && nested.length() > 0) {
                    val submenu = legacyMenu(nested.optString(0), nodes, disabled)
                    item["children"] = submenu?.get("items")
                }
                items.add(item)
            }
            menu["items"] = items
            return menu
        }

        fun chromeEventPayload(name: String, data: Any?): JSONObject? {
            val map = data as? Map<*, *>
            val id = map?.get("id")?.toString()
            val nclpId = map?.get("nclpId")?.toString()
            val instanceName = map?.get("name")?.toString()
            var event: String? = null
            var target: String? = null
            var value: Any? = JSONObject.NULL

            when (name) {
                "titleBar.leadingItemPressed" -> if (id != null) {
                    event = "activate"; target = nclpId ?: "titleBar:leading:$id"
                }
                "titleBar.trailingItemPressed" -> if (id != null) {
                    event = "activate"; target = nclpId ?: "titleBar:trailing:$id"
                }
                "titleBar.menuItemPressed" -> if (id != null) {
                    event = "activate"; target = nclpId ?: "titleBar:trailing:menu:$id"
                }
                "titleBar.backPressed" -> {
                    event = "back"; target = "titleBar"
                }
                "titleBar.searchChanged" -> {
                    event = "input"; target = "titleBar:search"; value = map?.get("value") ?: JSONObject.NULL
                }
                "titleBar.searchSubmitted" -> {
                    event = "submit"; target = "titleBar:search"; value = map?.get("value") ?: JSONObject.NULL
                }
                "titleBar.searchCancelled" -> {
                    event = "cancel"; target = "titleBar:search"
                }
                "navigation.backPressed" -> {
                    event = "back"; target = "navigation"
                }
                "navigation.itemPressed" -> if (id != null) {
                    event = "select"; target = "navigation"; value = nclpId ?: "navigation:$id"
                }
                "navigation.searchChanged" -> {
                    event = "input"; target = "navigation:search-field"; value = map?.get("value") ?: JSONObject.NULL
                }
                "navigation.searchSubmitted" -> {
                    event = "submit"; target = "navigation:search-field"; value = map?.get("value") ?: JSONObject.NULL
                }
                "navigation.searchCancelled" -> {
                    event = "cancel"; target = "navigation:search-field"
                }
                "toolbar.itemPressed" -> if (id != null) {
                    event = "activate"; target = nclpId ?: "toolbar:$id"
                }
                "toolbar.menuItemPressed" -> if (id != null) {
                    event = "activate"; target = nclpId ?: "toolbar:menu:$id"
                }
                "keyboard.itemPressed" -> if (id != null) {
                    event = "activate"; target = nclpId ?: "keyboard:$id"
                }
                "sidebarPanel.itemPressed" -> if (id != null) {
                    event = "activate"; target = nclpId ?: "sidebarPanel:$id"
                }
                "menuBar.itemPressed" -> if (id != null) {
                    event = "activate"; target = nclpId ?: "menuBar:$id"
                }
                "sheet.presented" -> if (instanceName != null) {
                    event = "open"; target = "sheets:$instanceName"
                }
                "sheet.dismissed" -> if (instanceName != null) {
                    event = "close"; target = "sheets:$instanceName"
                }
                "sheet.detentChanged" -> if (instanceName != null) {
                    event = "detent"; target = "sheets:$instanceName"; value = map?.get("detent") ?: JSONObject.NULL
                }
                "sheet.loadFailed" -> if (instanceName != null) {
                    event = "error"; target = "sheets:$instanceName"; value = data ?: JSONObject.NULL
                }
                "drawer.presented" -> if (instanceName != null) {
                    event = "open"; target = "drawers:$instanceName"
                }
                "drawer.dismissed" -> if (instanceName != null) {
                    event = "close"; target = "drawers:$instanceName"
                }
                "appWindow.presented" -> if (instanceName != null) {
                    event = "open"; target = "appWindows:$instanceName"
                }
                "appWindow.dismissed" -> if (instanceName != null) {
                    event = "close"; target = "appWindows:$instanceName"
                }
                "popover.presented" -> if (instanceName != null) {
                    event = "open"; target = "popovers:$instanceName"
                }
                "popover.dismissed" -> if (instanceName != null) {
                    event = "close"; target = "popovers:$instanceName"
                }
                "tabBottomAccessory.presented" -> {
                    event = "open"; target = "tabBottomAccessory"
                }
                "tabBottomAccessory.dismissed" -> {
                    event = "close"; target = "tabBottomAccessory"
                }
                "tabBottomAccessory.loadFailed" -> {
                    event = "error"; target = "tabBottomAccessory"; value = data ?: JSONObject.NULL
                }
            }

            if (event == null || target == null) return null
            return JSONObject().apply {
                put("nativite", 2)
                put("type", "chrome.event")
                put("docId", "main")
                put("event", event)
                put("target", target)
                put("value", toJsonValue(value))
            }
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

private tailrec fun Context.findActivity(): ComponentActivity? = when (this) {
    is ComponentActivity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
