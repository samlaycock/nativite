package dev.nativite.plugins.localauth

import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import org.json.JSONObject

private typealias LocalAuthHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

private const val AUTH_SUCCESS = 0
private const val AUTH_HW_UNAVAILABLE = 1
private const val AUTH_NO_HARDWARE = 12
private const val AUTH_NONE_ENROLLED = 11

private fun register(bridge: Any, method: String, handler: LocalAuthHandler) {
    val registerMethod = bridge.javaClass.methods.first {
        it.name == "register" && it.parameterTypes.size == 3
    }
    registerMethod.invoke(bridge, "localAuth", method, handler)
}

private fun applicationContextOrNull(bridge: Any): android.content.Context? {
    val accessor = bridge.javaClass.methods.firstOrNull { it.name == "applicationContextOrNull" }
    return accessor?.invoke(bridge) as? android.content.Context
}

private fun activityOrNull(bridge: Any): android.app.Activity? {
    val accessor = bridge.javaClass.methods.firstOrNull { it.name == "activityOrNull" }
    return accessor?.invoke(bridge) as? android.app.Activity
}

private fun biometricManager(context: android.content.Context): BiometricManager? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        context.getSystemService(BiometricManager::class.java)
    } else {
        null
    }

private fun canAuthenticate(context: android.content.Context): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        biometricManager(context)?.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL,
        ) ?: BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        biometricManager(context)?.canAuthenticate() ?: AUTH_NO_HARDWARE
    } else {
        AUTH_NO_HARDWARE
    }

private fun reasonFor(code: Int): String = when (code) {
    AUTH_NONE_ENROLLED -> "not-enrolled"
    AUTH_NO_HARDWARE -> "hardware-unavailable"
    AUTH_HW_UNAVAILABLE -> "hardware-unavailable"
    else -> "unsupported"
}

private fun statusFor(errorCode: Int): String = when (errorCode) {
    BiometricPrompt.BIOMETRIC_ERROR_CANCELED,
    BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED,
    BiometricPrompt.BIOMETRIC_ERROR_NEGATIVE_BUTTON,
    -> "cancelled"
    BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT,
    BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT_PERMANENT,
    -> "lockout"
    BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS -> "not-enrolled"
    BiometricPrompt.BIOMETRIC_ERROR_NO_DEVICE_CREDENTIAL,
    BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT,
    BiometricPrompt.BIOMETRIC_ERROR_HW_UNAVAILABLE,
    -> "unavailable"
    else -> "failed"
}

fun registerNativiteLocalAuthPlugin(bridge: Any) {
    var activeCancellation: CancellationSignal? = null

    register(bridge, "isAvailable") { _, completion ->
        val context = applicationContextOrNull(bridge)
        if (context == null) {
            completion(Result.success(mapOf("available" to false, "platform" to "android", "reason" to "unsupported")))
            return@register
        }

        val status = canAuthenticate(context)
        val response =
            mutableMapOf<String, Any?>("available" to (status == AUTH_SUCCESS), "platform" to "android")
        if (status != AUTH_SUCCESS) response["reason"] = reasonFor(status)
        completion(Result.success(response))
    }

    register(bridge, "isEnrolled") { _, completion ->
        val context = applicationContextOrNull(bridge)
        val enrolled = context != null && canAuthenticate(context) == AUTH_SUCCESS
        completion(Result.success(mapOf("enrolled" to enrolled, "platform" to "android")))
    }

    register(bridge, "getSupportedTypes") { _, completion ->
        val context = applicationContextOrNull(bridge)
        val types = if (context != null && canAuthenticate(context) == AUTH_SUCCESS) {
            listOf("fingerprint", "face", "iris", "device-credential")
        } else {
            emptyList()
        }
        completion(Result.success(mapOf("types" to types, "platform" to "android")))
    }

    register(bridge, "authenticate") { args, completion ->
        val activity = activityOrNull(bridge)
        val options = args as? JSONObject
        val reason = options?.optString("reason") ?: ""
        if (activity == null || reason.isBlank() || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            completion(Result.success(mapOf("status" to "unavailable", "success" to false, "platform" to "android", "error" to "Local authentication requires Android 9+, a foreground activity, and prompt reason.")))
            return@register
        }

        val cancellation = CancellationSignal()
        activeCancellation = cancellation
        val builder = BiometricPrompt.Builder(activity)
            .setTitle(reason)
        val cancelTitle = options.optString("cancelTitle", "Cancel")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !options.optBoolean("disableDeviceFallback", false)) {
            builder.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
        } else {
            builder.setNegativeButton(cancelTitle.ifBlank { "Cancel" }, activity.mainExecutor) { _, _ ->
                activeCancellation = null
                completion(Result.success(mapOf("status" to "cancelled", "success" to false, "platform" to "android")))
            }
        }

        builder.build().authenticate(
            cancellation,
            activity.mainExecutor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    activeCancellation = null
                    completion(Result.success(mapOf("status" to "success", "success" to true, "platform" to "android")))
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    activeCancellation = null
                    completion(Result.success(mapOf("status" to statusFor(errorCode), "success" to false, "platform" to "android", "error" to errString.toString())))
                }

                override fun onAuthenticationFailed() {
                    completion(Result.success(mapOf("status" to "failed", "success" to false, "platform" to "android", "error" to "Authentication failed.")))
                }
            },
        )
    }

    register(bridge, "cancel") { _, completion ->
        activeCancellation?.cancel()
        activeCancellation = null
        completion(Result.success(mapOf("cancelled" to true)))
    }
}
