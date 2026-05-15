package dev.nativite.plugins.appintegrity

import com.google.android.gms.tasks.Task
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityServiceException
import com.google.android.play.core.integrity.IntegrityTokenRequest
import com.google.android.play.core.integrity.StandardIntegrityException
import com.google.android.play.core.integrity.StandardIntegrityManager
import com.google.android.play.core.integrity.model.IntegrityErrorCode
import com.google.android.play.core.integrity.model.StandardIntegrityErrorCode
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicReference

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

private fun classicPlayIntegrityCode(errorCode: Int): String = when (errorCode) {
    IntegrityErrorCode.API_NOT_AVAILABLE,
    IntegrityErrorCode.PLAY_STORE_NOT_FOUND,
    IntegrityErrorCode.PLAY_STORE_VERSION_OUTDATED,
    IntegrityErrorCode.CANNOT_BIND_TO_SERVICE,
    -> "unsupported-device"
    IntegrityErrorCode.NETWORK_ERROR,
    IntegrityErrorCode.GOOGLE_SERVER_UNAVAILABLE,
    IntegrityErrorCode.CLIENT_TRANSIENT_ERROR,
    -> "server-unavailable"
    IntegrityErrorCode.TOO_MANY_REQUESTS -> "quota-exceeded"
    IntegrityErrorCode.CLOUD_PROJECT_NUMBER_IS_INVALID -> "configuration-missing"
    IntegrityErrorCode.APP_NOT_INSTALLED,
    IntegrityErrorCode.APP_UID_MISMATCH,
    IntegrityErrorCode.NONCE_TOO_SHORT,
    IntegrityErrorCode.NONCE_TOO_LONG,
    -> "invalid-arguments"
    else -> "native-failure"
}

private fun standardPlayIntegrityCode(errorCode: Int): String = when (errorCode) {
    StandardIntegrityErrorCode.API_NOT_AVAILABLE,
    StandardIntegrityErrorCode.PLAY_SERVICES_NOT_FOUND,
    StandardIntegrityErrorCode.PLAY_SERVICES_VERSION_OUTDATED,
    StandardIntegrityErrorCode.PLAY_STORE_NOT_FOUND,
    StandardIntegrityErrorCode.PLAY_STORE_VERSION_OUTDATED,
    StandardIntegrityErrorCode.CANNOT_BIND_TO_SERVICE,
    -> "unsupported-device"
    StandardIntegrityErrorCode.NETWORK_ERROR,
    StandardIntegrityErrorCode.GOOGLE_SERVER_UNAVAILABLE,
    StandardIntegrityErrorCode.CLIENT_TRANSIENT_ERROR,
    -> "server-unavailable"
    StandardIntegrityErrorCode.TOO_MANY_REQUESTS -> "quota-exceeded"
    StandardIntegrityErrorCode.CLOUD_PROJECT_NUMBER_IS_INVALID -> "configuration-missing"
    StandardIntegrityErrorCode.REQUEST_HASH_TOO_LONG,
    StandardIntegrityErrorCode.INTEGRITY_TOKEN_PROVIDER_INVALID,
    -> "invalid-arguments"
    else -> "native-failure"
}

private fun playIntegrityCode(error: Exception): String = when (error) {
    is StandardIntegrityException -> standardPlayIntegrityCode(error.errorCode)
    is IntegrityServiceException -> classicPlayIntegrityCode(error.errorCode)
    else -> "native-failure"
}

private fun <T> completeTask(task: Task<T>, completion: (Result<Any?>) -> Unit, map: (T) -> Any?) {
    task.addOnSuccessListener { value ->
        completion(Result.success(map(value)))
    }.addOnFailureListener { error ->
        completion(Result.failure(appIntegrityException(playIntegrityCode(error), error.message ?: "Play Integrity request failed.")))
    }
}

fun registerNativiteAppIntegrityPlugin(bridge: Any) {
    val standardProvider = AtomicReference<StandardIntegrityManager.StandardIntegrityTokenProvider?>()

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
        val request = StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
            .setCloudProjectNumber(cloudProjectNumber)
            .build()

        completeTask(manager.prepareIntegrityToken(request), completion) { provider ->
            standardProvider.set(provider)
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

        val provider = standardProvider.get()
        if (provider != null) {
            val request = StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
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
