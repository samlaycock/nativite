package dev.nativite.plugins.appintegrity

import com.google.android.gms.tasks.Task
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityServiceException
import com.google.android.play.core.integrity.IntegrityTokenRequest
import com.google.android.play.core.integrity.PrepareIntegrityTokenRequest
import com.google.android.play.core.integrity.StandardIntegrityManager
import com.google.android.play.core.integrity.StandardIntegrityTokenRequest
import org.json.JSONObject

private typealias AppIntegrityHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

private fun register(bridge: Any, method: String, handler: AppIntegrityHandler) {
    val registerMethod = bridge.javaClass.methods.first {
        it.name == "register" && it.parameterTypes.size == 3
    }
    registerMethod.invoke(bridge, "appIntegrity", method, handler)
}

private fun applicationContextOrNull(bridge: Any): android.content.Context? {
    val accessor = bridge.javaClass.methods.firstOrNull { it.name == "applicationContextOrNull" }
    return accessor?.invoke(bridge) as? android.content.Context
}

private fun appIntegrityException(code: String, message: String): IllegalStateException =
    IllegalStateException("$code: $message")

private fun playIntegrityCode(error: Exception): String = when (error) {
    is IntegrityServiceException -> when {
        error.message?.contains("PLAY_SERVICES", ignoreCase = true) == true -> "configuration-missing"
        error.message?.contains("NETWORK", ignoreCase = true) == true -> "server-unavailable"
        error.message?.contains("TOO_MANY_REQUESTS", ignoreCase = true) == true -> "rate-limited"
        error.message?.contains("CANNOT_BIND", ignoreCase = true) == true -> "unsupported-device"
        else -> "native-failure"
    }
    else -> "native-failure"
}

private fun <T> completeTask(task: Task<T>, completion: (Result<Any?>) -> Unit, map: (T) -> Any?) {
    task.addOnSuccessListener { value ->
        completion(Result.success(map(value)))
    }.addOnFailureListener { error ->
        val exception = error as? Exception ?: RuntimeException(error)
        completion(Result.failure(appIntegrityException(playIntegrityCode(exception), exception.message ?: "Play Integrity request failed.")))
    }
}

fun registerNativiteAppIntegrityPlugin(bridge: Any) {
    var standardProvider: StandardIntegrityManager.StandardIntegrityTokenProvider? = null

    register(bridge, "isPlayIntegrityAvailable") { _, completion ->
        val context = applicationContextOrNull(bridge)
        if (context == null) {
            completion(Result.success(mapOf(
                "available" to false,
                "platform" to "android",
                "provider" to "play-integrity",
                "error" to mapOf(
                    "code" to "configuration-missing",
                    "message" to "Play Integrity requires an Android application context.",
                    "platform" to "android",
                ),
            )))
            return@register
        }

        completion(Result.success(mapOf("available" to true, "platform" to "android", "provider" to "play-integrity")))
    }

    register(bridge, "preparePlayIntegrityProvider") { args, completion ->
        val context = applicationContextOrNull(bridge)
        val options = args as? JSONObject
        val cloudProjectNumber = options?.optLong("cloudProjectNumber", 0L) ?: 0L
        if (context == null || cloudProjectNumber <= 0L) {
            completion(Result.failure(appIntegrityException("invalid-arguments", "preparePlayIntegrityProvider requires cloudProjectNumber and an Android application context.")))
            return@register
        }

        val manager = IntegrityManagerFactory.createStandard(context)
        val request = PrepareIntegrityTokenRequest.builder()
            .setCloudProjectNumber(cloudProjectNumber)
            .build()

        completeTask(manager.prepareIntegrityToken(request), completion) { provider ->
            standardProvider = provider
            mapOf("prepared" to true, "platform" to "android")
        }
    }

    register(bridge, "requestPlayIntegrityToken") { args, completion ->
        val context = applicationContextOrNull(bridge)
        val options = args as? JSONObject
        val requestHash = options?.optString("requestHash") ?: ""
        if (context == null || requestHash.isBlank()) {
            completion(Result.failure(appIntegrityException("invalid-arguments", "requestPlayIntegrityToken requires requestHash and an Android application context.")))
            return@register
        }

        val provider = standardProvider
        if (provider != null) {
            val request = StandardIntegrityTokenRequest.builder()
                .setRequestHash(requestHash)
                .build()
            completeTask(provider.request(request), completion) { response ->
                mapOf("token" to response.token(), "platform" to "android")
            }
            return@register
        }

        val cloudProjectNumber = options?.optLong("cloudProjectNumber", 0L) ?: 0L
        val requestBuilder = IntegrityTokenRequest.builder().setNonce(requestHash)
        if (cloudProjectNumber > 0L) {
            requestBuilder.setCloudProjectNumber(cloudProjectNumber)
        }

        val manager = IntegrityManagerFactory.create(context)
        completeTask(manager.requestIntegrityToken(requestBuilder.build()), completion) { response ->
            mapOf("token" to response.token(), "platform" to "android")
        }
    }
}
