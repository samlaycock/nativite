package dev.nativite.plugins.securestore

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject

private typealias SecureStoreHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

private const val DEFAULT_SERVICE = "dev.nativite.secure-store"
private const val MAX_VALUE_BYTES = 4096

private fun secureStoreError(code: String, message: String, operation: String): IllegalStateException =
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

private fun register(bridge: Any, method: String, handler: SecureStoreHandler) {
    val registerMethod = bridge.javaClass.methods.first {
        it.name == "register" && it.parameterTypes.size == 3
    }
    registerMethod.invoke(bridge, "secureStore", method, handler)
}

private fun applicationContextOrNull(bridge: Any): Context? {
    val accessor = bridge.javaClass.methods.firstOrNull { it.name == "applicationContextOrNull" }
    return accessor?.invoke(bridge) as? Context
}

private fun JSONObject.requiredString(name: String, operation: String): String {
    val value = optString(name)
    if (value.isBlank()) {
        throw secureStoreError("invalid-arguments", "Expected a non-empty $name.", operation)
    }
    return value
}

private fun service(args: JSONObject?): String {
    val value = args?.optString("service")
    return if (value.isNullOrBlank()) DEFAULT_SERVICE else value
}

private fun preferences(context: Context, service: String) =
    EncryptedSharedPreferences.create(
        context,
        "nativite_secure_store_$service",
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

fun registerNativiteSecureStorePlugin(bridge: Any) {
    register(bridge, "isAvailable") { _, completion ->
        completion(
            Result.success(
                mapOf(
                    "available" to (applicationContextOrNull(bridge) != null),
                    "platform" to "android",
                    "supportsUserPresence" to false,
                    "supportsBiometryCurrentSet" to false,
                ),
            ),
        )
    }

    register(bridge, "setItem") { args, completion ->
        try {
            val operation = "setItem"
            val context = applicationContextOrNull(bridge)
                ?: throw secureStoreError("native-unavailable", "Secure store is not attached to an Android context.", operation)
            val options = args as? JSONObject ?: JSONObject()
            val key = options.requiredString("key", operation)
            val value = options.requiredString("value", operation)
            val accessControl = options.optString("accessControl")
            if (accessControl.isNotBlank() && accessControl != "none") {
                throw secureStoreError(
                    "unavailable",
                    "Android secure store does not support per-item user-presence access control yet.",
                    operation,
                )
            }
            if (value.toByteArray(Charsets.UTF_8).size > MAX_VALUE_BYTES) {
                throw secureStoreError("value-too-large", "Secure store values are limited to $MAX_VALUE_BYTES bytes.", operation)
            }
            preferences(context, service(options)).edit().putString(key, value).apply()
            completion(Result.success(mapOf("stored" to true)))
        } catch (err: Exception) {
            completion(Result.failure(err))
        }
    }

    register(bridge, "getItem") { args, completion ->
        try {
            val operation = "getItem"
            val context = applicationContextOrNull(bridge)
                ?: throw secureStoreError("native-unavailable", "Secure store is not attached to an Android context.", operation)
            val options = args as? JSONObject ?: JSONObject()
            val key = options.requiredString("key", operation)
            val value = preferences(context, service(options)).getString(key, null)
            completion(Result.success(value))
        } catch (err: Exception) {
            completion(Result.failure(err))
        }
    }

    register(bridge, "deleteItem") { args, completion ->
        try {
            val operation = "deleteItem"
            val context = applicationContextOrNull(bridge)
                ?: throw secureStoreError("native-unavailable", "Secure store is not attached to an Android context.", operation)
            val options = args as? JSONObject ?: JSONObject()
            val key = options.requiredString("key", operation)
            val prefs = preferences(context, service(options))
            val existed = prefs.contains(key)
            prefs.edit().remove(key).apply()
            completion(Result.success(mapOf("deleted" to existed)))
        } catch (err: Exception) {
            completion(Result.failure(err))
        }
    }
}
