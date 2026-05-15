package dev.nativite.plugins.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

private typealias NotificationsHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

private val pendingNotifications = mutableMapOf<String, Map<String, Any?>>()
private var foregroundPolicy: Map<String, Any?> = mapOf(
    "showAlert" to true,
    "playSound" to true,
    "setBadge" to true,
)

private fun notificationsError(code: String, message: String, operation: String): IllegalStateException =
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

private fun unsupported(operation: String, message: String): IllegalStateException =
    notificationsError("unsupported", message, operation)

private fun register(bridge: Any, method: String, handler: NotificationsHandler) {
    val registerMethod = bridge.javaClass.methods.first {
        it.name == "register" && it.parameterTypes.size == 3
    }
    registerMethod.invoke(bridge, "notifications", method, handler)
}

private fun applicationContextOrNull(bridge: Any): Context? {
    val accessor = bridge.javaClass.methods.firstOrNull { it.name == "applicationContextOrNull" }
    return accessor?.invoke(bridge) as? Context
}

private fun hasPostNotificationsPermission(context: Context): Boolean =
    Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

private fun permissionResponse(context: Context): Map<String, Any?> {
    val granted = hasPostNotificationsPermission(context)
    return mapOf(
        "status" to if (granted) "granted" else "denied",
        "canAskAgain" to false,
        "platform" to "android",
    )
}

private fun argsObject(args: Any?): JSONObject = when (args) {
    is JSONObject -> args
    is Map<*, *> -> JSONObject(args)
    else -> JSONObject()
}

private fun importance(raw: String?): Int = when (raw) {
    "min" -> NotificationManager.IMPORTANCE_MIN
    "low" -> NotificationManager.IMPORTANCE_LOW
    "high" -> NotificationManager.IMPORTANCE_HIGH
    "max" -> NotificationManager.IMPORTANCE_MAX
    else -> NotificationManager.IMPORTANCE_DEFAULT
}

private fun createNotificationChannel(context: Context, args: Any?): String {
    val options = argsObject(args)
    val id = options.optString("id")
    val name = options.optString("name", id)
    require(id.isNotBlank()) { "Notification channel id is required." }
    require(name.isNotBlank()) { "Notification channel name is required." }

    if (Build.VERSION.SDK_INT >= 26) {
        val channel = NotificationChannel(id, name, importance(options.optString("importance"))).apply {
            description = options.optString("description").takeIf { it.isNotBlank() }
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    return id
}

private fun notificationId(id: String): Int = id.hashCode()

private fun contentObject(options: JSONObject): JSONObject = options.optJSONObject("content") ?: JSONObject()

private fun scheduleNotification(context: Context, args: Any?): String {
    if (!hasPostNotificationsPermission(context)) {
        throw notificationsError(
            "permission-denied",
            "Notification permission has not been granted.",
            "scheduleNotification",
        )
    }

    val options = argsObject(args)
    val id = options.optString("id").takeIf { it.isNotBlank() } ?: UUID.randomUUID().toString()
    val content = contentObject(options)
    val title = content.optString("title")
    require(title.isNotBlank()) { "Notification title is required." }
    val channelId = content.optString("channelId").takeIf { it.isNotBlank() } ?: "default"
    createNotificationChannel(context, mapOf("id" to channelId, "name" to "Default"))

    val notification = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(context.applicationInfo.icon)
        .setContentTitle(title)
        .setContentText(content.optString("body").takeIf { it.isNotBlank() })
        .setAutoCancel(true)
        .setWhen(Instant.now().toEpochMilli())
        .build()

    NotificationManagerCompat.from(context).notify(notificationId(id), notification)
    pendingNotifications[id] = mapOf(
        "id" to id,
        "content" to content.toMap(),
        "trigger" to options.optJSONObject("trigger")?.toMap(),
    )
    return id
}

private fun JSONObject.toMap(): Map<String, Any?> =
    keys().asSequence().associateWith { key -> opt(key) }

fun registerNativiteNotificationsPlugin(bridge: Any) {
    register(bridge, "getPermissionStatus") { _, completion ->
        val context = applicationContextOrNull(bridge)
        if (context == null) {
            completion(Result.failure(notificationsError("native-unavailable", "Android application context is unavailable.", "getPermissionStatus")))
            return@register
        }
        completion(Result.success(permissionResponse(context)))
    }

    register(bridge, "requestPermissions") { _, completion ->
        val context = applicationContextOrNull(bridge)
        if (context == null) {
            completion(Result.failure(notificationsError("native-unavailable", "Android application context is unavailable.", "requestPermissions")))
            return@register
        }
        completion(Result.success(permissionResponse(context)))
    }

    register(bridge, "createChannel") { args, completion ->
        val context = applicationContextOrNull(bridge)
        if (context == null) {
            completion(Result.failure(notificationsError("native-unavailable", "Android application context is unavailable.", "createChannel")))
            return@register
        }
        runCatching { mapOf("id" to createNotificationChannel(context, args)) }.let(completion)
    }

    register(bridge, "setCategories") { args, completion ->
        val categories = argsObject(args).optJSONArray("categories")
        completion(Result.success(mapOf("registered" to (categories?.length() ?: 0))))
    }

    register(bridge, "scheduleNotification") { args, completion ->
        val context = applicationContextOrNull(bridge)
        if (context == null) {
            completion(Result.failure(notificationsError("native-unavailable", "Android application context is unavailable.", "scheduleNotification")))
            return@register
        }
        runCatching { mapOf("id" to scheduleNotification(context, args)) }.let(completion)
    }

    register(bridge, "cancelNotification") { args, completion ->
        val context = applicationContextOrNull(bridge)
        val id = argsObject(args).optString("id")
        if (context != null && id.isNotBlank()) {
            NotificationManagerCompat.from(context).cancel(notificationId(id))
            pendingNotifications.remove(id)
        }
        completion(Result.success(mapOf("cancelled" to true)))
    }

    register(bridge, "cancelAllNotifications") { _, completion ->
        val context = applicationContextOrNull(bridge)
        if (context != null) NotificationManagerCompat.from(context).cancelAll()
        pendingNotifications.clear()
        completion(Result.success(mapOf("cancelled" to true)))
    }

    register(bridge, "listScheduledNotifications") { _, completion ->
        completion(Result.success(mapOf("notifications" to pendingNotifications.values.toList())))
    }

    register(bridge, "getInitialNotificationResponse") { _, completion ->
        completion(Result.success(null))
    }

    register(bridge, "setForegroundNotificationPolicy") { args, completion ->
        foregroundPolicy = argsObject(args).toMap()
        completion(Result.success(foregroundPolicy))
    }

    register(bridge, "registerForPushNotifications") { _, completion ->
        completion(Result.failure(unsupported("registerForPushNotifications", "Push token registration requires app-specific APNs or FCM setup and is not implemented by the first local-notifications release.")))
    }
}
