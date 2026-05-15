package dev.nativite.plugins.systemcontrols

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.view.Surface
import android.view.WindowManager
import org.json.JSONObject

private typealias SystemControlsHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

private const val DEFAULT_KEEP_AWAKE_KEY = "default"

private class SystemControlsState {
    val keepAwakeKeys = mutableSetOf<String>()
    var orientationLock: String? = null
    var originalBrightness: Float? = null
}

private fun systemControlsError(code: String, message: String, operation: String): IllegalStateException =
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

private fun register(bridge: Any, method: String, handler: SystemControlsHandler) {
    val registerMethod = bridge.javaClass.methods.firstOrNull {
        it.name == "register" && it.parameterTypes.size == 3
    } ?: throw systemControlsError(
        "native-unavailable",
        "Nativite bridge does not expose the expected plugin registration method.",
        "register",
    )
    registerMethod.invoke(bridge, "systemControls", method, handler)
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

private fun keepAwakeKey(args: Any?): String {
    val value = (args as? JSONObject)?.optString("key")
    return if (value.isNullOrBlank()) DEFAULT_KEEP_AWAKE_KEY else value
}

private fun Activity.applyKeepAwakeState(state: SystemControlsState) {
    runOnUiThread {
        val keepAwakeActive = synchronized(state) { state.keepAwakeKeys.isNotEmpty() }
        if (keepAwakeActive) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}

@Suppress("DEPRECATION")
private fun orientationName(activity: Activity): String {
    val rotation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        activity.display?.rotation ?: activity.windowManager.defaultDisplay.rotation
    } else {
        activity.windowManager.defaultDisplay.rotation
    }
    return when (rotation) {
        Surface.ROTATION_90, Surface.ROTATION_270 -> "landscape"
        Surface.ROTATION_0, Surface.ROTATION_180 -> "portrait"
        else -> "unknown"
    }
}

private fun orientationRequest(lock: String, operation: String): Int =
    when (lock) {
        "portrait", "portrait-up" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        "portrait-down" -> ActivityInfo.SCREEN_ORIENTATION_REVERSE_PORTRAIT
        "landscape", "landscape-left" -> ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        "landscape-right" -> ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE
        "all" -> ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
        else -> throw systemControlsError("invalid-orientation-lock", "Unsupported orientation lock: $lock.", operation)
    }

private fun orientationState(activity: Activity, state: SystemControlsState): Map<String, Any?> =
    mapOf("orientation" to orientationName(activity), "lock" to synchronized(state) { state.orientationLock })

private fun Activity.brightnessState(state: SystemControlsState): Map<String, Any?> {
    val value = window.attributes.screenBrightness
    return mapOf(
        "brightness" to if (value < 0f) 1.0 else value.toDouble(),
        "canRestore" to synchronized(state) { state.originalBrightness != null },
    )
}

private fun batteryState(status: Int): String =
    when (status) {
        BatteryManager.BATTERY_STATUS_CHARGING -> "charging"
        BatteryManager.BATTERY_STATUS_FULL -> "full"
        BatteryManager.BATTERY_STATUS_DISCHARGING, BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "unplugged"
        else -> "unknown"
    }

fun registerNativiteSystemControlsPlugin(bridge: Any) {
    val state = SystemControlsState()

    register(bridge, "getCapabilities") { _, completion ->
        completion(
            Result.success(
                mapOf(
                    "platform" to "android",
                    "keepAwake" to (activityOrNull(bridge) != null),
                    "orientation" to (activityOrNull(bridge) != null),
                    "appBrightness" to (activityOrNull(bridge) != null),
                    "powerStatus" to (applicationContextOrNull(bridge) != null),
                ),
            ),
        )
    }

    register(bridge, "activateKeepAwake") { args, completion ->
        val activity = activityOrNull(bridge)
            ?: return@register completion(Result.failure(systemControlsError("native-unavailable", "Keep awake requires an attached Android activity.", "activateKeepAwake")))
        val key = keepAwakeKey(args)
        synchronized(state) { state.keepAwakeKeys.add(key) }
        activity.applyKeepAwakeState(state)
        completion(Result.success(mapOf("active" to true, "key" to key)))
    }

    register(bridge, "deactivateKeepAwake") { args, completion ->
        val activity = activityOrNull(bridge)
            ?: return@register completion(Result.failure(systemControlsError("native-unavailable", "Keep awake requires an attached Android activity.", "deactivateKeepAwake")))
        val key = keepAwakeKey(args)
        val active = synchronized(state) {
            state.keepAwakeKeys.remove(key)
            state.keepAwakeKeys.isNotEmpty()
        }
        activity.applyKeepAwakeState(state)
        completion(Result.success(mapOf("active" to active, "key" to key)))
    }

    register(bridge, "getOrientation") { _, completion ->
        val activity = activityOrNull(bridge)
            ?: return@register completion(Result.failure(systemControlsError("native-unavailable", "Orientation requires an attached Android activity.", "getOrientation")))
        completion(Result.success(orientationState(activity, state)))
    }

    register(bridge, "lockOrientation") { args, completion ->
        val activity = activityOrNull(bridge)
            ?: return@register completion(Result.failure(systemControlsError("native-unavailable", "Orientation lock requires an attached Android activity.", "lockOrientation")))
        val lock = (args as? JSONObject)?.optString("lock").orEmpty()
        try {
            val request = orientationRequest(lock, "lockOrientation")
            activity.runOnUiThread {
                activity.requestedOrientation = request
                synchronized(state) { state.orientationLock = lock }
                completion(Result.success(orientationState(activity, state)))
            }
        } catch (err: Exception) {
            completion(Result.failure(err))
        }
    }

    register(bridge, "unlockOrientation") { _, completion ->
        val activity = activityOrNull(bridge)
            ?: return@register completion(Result.failure(systemControlsError("native-unavailable", "Orientation unlock requires an attached Android activity.", "unlockOrientation")))
        activity.runOnUiThread {
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            synchronized(state) { state.orientationLock = null }
            completion(Result.success(orientationState(activity, state)))
        }
    }

    register(bridge, "getBrightness") { _, completion ->
        val activity = activityOrNull(bridge)
            ?: return@register completion(Result.failure(systemControlsError("native-unavailable", "Brightness requires an attached Android activity.", "getBrightness")))
        activity.runOnUiThread {
            completion(Result.success(activity.brightnessState(state)))
        }
    }

    register(bridge, "setBrightness") { args, completion ->
        val activity = activityOrNull(bridge)
            ?: return@register completion(Result.failure(systemControlsError("native-unavailable", "Brightness requires an attached Android activity.", "setBrightness")))
        val brightness = (args as? JSONObject)?.optDouble("brightness", Double.NaN) ?: Double.NaN
        if (brightness.isNaN() || brightness < 0.0 || brightness > 1.0) {
            completion(Result.failure(systemControlsError("invalid-arguments", "Brightness must be between 0 and 1.", "setBrightness")))
            return@register
        }
        activity.runOnUiThread {
            synchronized(state) {
                if (state.originalBrightness == null) {
                    state.originalBrightness = activity.window.attributes.screenBrightness
                }
            }
            val params = activity.window.attributes
            params.screenBrightness = brightness.toFloat()
            activity.window.attributes = params
            completion(Result.success(activity.brightnessState(state)))
        }
    }

    register(bridge, "restoreBrightness") { _, completion ->
        val activity = activityOrNull(bridge)
            ?: return@register completion(Result.failure(systemControlsError("native-unavailable", "Brightness requires an attached Android activity.", "restoreBrightness")))
        activity.runOnUiThread {
            val restoredBrightness = synchronized(state) {
                val value = state.originalBrightness ?: WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                state.originalBrightness = null
                value
            }
            val params = activity.window.attributes
            params.screenBrightness = restoredBrightness
            activity.window.attributes = params
            completion(Result.success(activity.brightnessState(state)))
        }
    }

    register(bridge, "getPowerStatus") { _, completion ->
        val context = applicationContextOrNull(bridge)
            ?: return@register completion(Result.failure(systemControlsError("native-unavailable", "Power status requires an attached Android context.", "getPowerStatus")))
        val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_UNKNOWN)
            ?: BatteryManager.BATTERY_STATUS_UNKNOWN
        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        completion(
            Result.success(
                mapOf(
                    "lowPowerMode" to power?.isPowerSaveMode,
                    "batteryLevel" to if (level >= 0 && scale > 0) level.toDouble() / scale.toDouble() else null,
                    "batteryState" to batteryState(status),
                ),
            ),
        )
    }
}
