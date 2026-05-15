package dev.nativite.plugins.captureprotection

import android.view.WindowManager
import org.json.JSONObject

private typealias CaptureProtectionHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

private class CaptureProtectionState {
    val keys = mutableSetOf<String>()
}

private fun register(bridge: Any, method: String, handler: CaptureProtectionHandler) {
    val registerMethod = bridge.javaClass.methods.first {
        it.name == "register" && it.parameterTypes.size == 3
    }
    registerMethod.invoke(bridge, "captureProtection", method, handler)
}

private fun activityOrNull(bridge: Any): android.app.Activity? {
    val accessor = bridge.javaClass.methods.firstOrNull { it.name == "activityOrNull" }
    return accessor?.invoke(bridge) as? android.app.Activity
}

private fun captureProtectionError(code: String, message: String): IllegalStateException =
    IllegalStateException("$code: $message")

private fun keyFromArgs(args: Any?): String {
    val key = (args as? JSONObject)?.optString("key")?.trim().orEmpty()
    return key.ifEmpty { "default" }
}

private fun response(state: CaptureProtectionState): Map<String, Any?> =
    mapOf(
        "platform" to "android",
        "preventionActive" to state.keys.isNotEmpty(),
        "activeKeys" to state.keys.sorted(),
        "captured" to null,
    )

private fun setSecureFlag(activity: android.app.Activity, enabled: Boolean) {
    activity.runOnUiThread {
        if (enabled) {
            activity.window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE,
            )
        } else {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}

fun registerNativiteCaptureProtectionPlugin(bridge: Any) {
    val state = CaptureProtectionState()

    register(bridge, "getCapabilities") { _, completion ->
        completion(Result.success(mapOf(
            "platform" to "android",
            "prevention" to true,
            "screenshotDetection" to false,
            "captureStatus" to false,
        )))
    }

    register(bridge, "preventCapture") { args, completion ->
        val activity = activityOrNull(bridge)
        if (activity == null) {
            completion(Result.failure(captureProtectionError("native-unavailable", "Capture prevention requires a foreground Android activity.")))
            return@register
        }

        val next = synchronized(state) {
            state.keys.add(keyFromArgs(args))
            response(state)
        }
        setSecureFlag(activity, true)
        completion(Result.success(next))
    }

    register(bridge, "allowCapture") { args, completion ->
        val activity = activityOrNull(bridge)
        if (activity == null) {
            completion(Result.failure(captureProtectionError("native-unavailable", "Capture prevention requires a foreground Android activity.")))
            return@register
        }

        val next = synchronized(state) {
            state.keys.remove(keyFromArgs(args))
            response(state)
        }
        setSecureFlag(activity, next["preventionActive"] == true)
        completion(Result.success(next))
    }

    register(bridge, "getState") { _, completion ->
        completion(Result.success(synchronized(state) { response(state) }))
    }
}
