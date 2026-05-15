import org.json.JSONObject

fun registerNativiteBackgroundBridge(bridge: NativiteBridge) {
    bridge.register(namespace = "__background__", method = "schedule") { args, completion ->
        val context = bridge.applicationContextOrNull()
        val request = args as? JSONObject
        val taskId = request?.optString("id") ?: ""
        if (context == null) {
            completion(Result.failure(IllegalStateException("Nativite background scheduler is not attached to a WebView context.")))
            return@register
        }
        val tasks = try {
            NativiteBackgroundTasks.loadManifest(context)
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

    bridge.register(namespace = "__background__", method = "cancel") { args, completion ->
        val context = bridge.applicationContextOrNull()
        val taskId = (args as? JSONObject)?.optString("id") ?: ""
        if (context == null) {
            completion(Result.failure(IllegalStateException("Nativite background scheduler is not attached to a WebView context.")))
            return@register
        }
        NativiteBackgroundWorkScheduler.cancel(context, taskId)
        completion(Result.success(mapOf("id" to taskId, "state" to "cancelled", "platform" to "android")))
    }

    bridge.register(namespace = "__background__", method = "getStatus") { args, completion ->
        val context = bridge.applicationContextOrNull()
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
