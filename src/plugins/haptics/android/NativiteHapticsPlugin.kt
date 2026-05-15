package dev.nativite.plugins.haptics

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import org.json.JSONObject

private typealias HapticsHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

private fun hapticsError(code: String, message: String, operation: String): IllegalStateException =
    IllegalStateException(
        JSONObject(
            mapOf(
                "code" to code,
                "message" to message,
                "platform" to "android",
                "operation" to operation,
            ),
        ).toString(),
    )

private fun register(bridge: Any, method: String, handler: HapticsHandler) {
    val registerMethod = bridge.javaClass.methods.firstOrNull {
        it.name == "register" && it.parameterTypes.size == 3
    } ?: throw hapticsError(
        "native-unavailable",
        "Nativite bridge does not expose the expected plugin registration method.",
        "register",
    )
    registerMethod.invoke(bridge, "haptics", method, handler)
}

private fun applicationContextOrNull(bridge: Any): Context? {
    val accessor = bridge.javaClass.methods.firstOrNull { it.name == "applicationContextOrNull" }
    return accessor?.invoke(bridge) as? Context
}

private fun activityOrNull(bridge: Any): Activity? {
    val accessor = bridge.javaClass.methods.firstOrNull { it.name == "activityOrNull" }
    val direct = accessor?.invoke(bridge) as? Activity
    if (direct != null) return direct
    return applicationContextOrNull(bridge)?.findActivity()
}

private fun Context.findActivity(): Activity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return null
}

private fun impactConstant(style: String, operation: String): Int =
    when (style) {
        "light" -> HapticFeedbackConstants.KEYBOARD_TAP
        "medium" -> HapticFeedbackConstants.VIRTUAL_KEY
        "heavy" -> HapticFeedbackConstants.LONG_PRESS
        "rigid" ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                HapticFeedbackConstants.CONTEXT_CLICK
            } else {
                HapticFeedbackConstants.LONG_PRESS
            }
        "soft" -> HapticFeedbackConstants.CLOCK_TICK
        else -> throw hapticsError("invalid-impact-style", "Unsupported impact feedback style: $style.", operation)
    }

private fun notificationConstant(style: String, operation: String): Int =
    when (style) {
        "success" ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                HapticFeedbackConstants.CONFIRM
            } else {
                HapticFeedbackConstants.VIRTUAL_KEY
            }
        "warning" ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                HapticFeedbackConstants.CONTEXT_CLICK
            } else {
                HapticFeedbackConstants.VIRTUAL_KEY
            }
        "error" ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                HapticFeedbackConstants.REJECT
            } else {
                HapticFeedbackConstants.LONG_PRESS
            }
        else -> throw hapticsError("invalid-notification-style", "Unsupported notification feedback style: $style.", operation)
    }

private fun perform(view: View, constant: Int): Boolean = view.performHapticFeedback(constant)

fun registerNativiteHapticsPlugin(bridge: Any) {
    register(bridge, "getCapabilities") { _, completion ->
        val available = activityOrNull(bridge) != null
        completion(
            Result.success(
                mapOf(
                    "platform" to "android",
                    "available" to available,
                    "selection" to available,
                    "impact" to listOf("light", "medium", "heavy", "rigid", "soft"),
                    "notification" to listOf("success", "warning", "error"),
                ),
            ),
        )
    }

    register(bridge, "selection") { _, completion ->
        val activity = activityOrNull(bridge)
            ?: return@register completion(Result.failure(hapticsError("native-unavailable", "Selection feedback requires an attached Android activity.", "selection")))
        activity.runOnUiThread {
            val performed = perform(activity.window.decorView, HapticFeedbackConstants.CLOCK_TICK)
            completion(Result.success(mapOf("performed" to performed)))
        }
    }

    register(bridge, "impact") { args, completion ->
        val activity = activityOrNull(bridge)
            ?: return@register completion(Result.failure(hapticsError("native-unavailable", "Impact feedback requires an attached Android activity.", "impact")))
        val style = (args as? JSONObject)?.optString("style").orEmpty().ifBlank { "medium" }
        try {
            val constant = impactConstant(style, "impact")
            activity.runOnUiThread {
                val performed = perform(activity.window.decorView, constant)
                completion(Result.success(mapOf("performed" to performed, "style" to style)))
            }
        } catch (err: Exception) {
            completion(Result.failure(err))
        }
    }

    register(bridge, "notification") { args, completion ->
        val activity = activityOrNull(bridge)
            ?: return@register completion(Result.failure(hapticsError("native-unavailable", "Notification feedback requires an attached Android activity.", "notification")))
        val style = (args as? JSONObject)?.optString("style").orEmpty()
        try {
            val constant = notificationConstant(style, "notification")
            activity.runOnUiThread {
                val performed = perform(activity.window.decorView, constant)
                completion(Result.success(mapOf("performed" to performed, "style" to style)))
            }
        } catch (err: Exception) {
            completion(Result.failure(err))
        }
    }
}
