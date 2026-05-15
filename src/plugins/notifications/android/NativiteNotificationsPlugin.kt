package dev.nativite.plugins.notifications

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

private typealias NotificationsHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

private const val NOTIFICATION_REQUEST_CODE = 7401
private const val EXTRA_ID = "dev.nativite.plugins.notifications.ID"
private const val EXTRA_TITLE = "dev.nativite.plugins.notifications.TITLE"
private const val EXTRA_BODY = "dev.nativite.plugins.notifications.BODY"
private const val EXTRA_CHANNEL_ID = "dev.nativite.plugins.notifications.CHANNEL_ID"
private const val EXTRA_DATA = "dev.nativite.plugins.notifications.DATA"

private val pendingNotifications = ConcurrentHashMap<String, Map<String, Any?>>()
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

private fun activityOrNull(bridge: Any): androidx.activity.ComponentActivity? {
    val accessor = bridge.javaClass.methods.firstOrNull { it.name == "activityOrNull" }
    return accessor?.invoke(bridge) as? androidx.activity.ComponentActivity
}

private fun hasPostNotificationsPermission(context: Context): Boolean =
    Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

private fun permissionResponse(context: Context): Map<String, Any?> {
    val granted = hasPostNotificationsPermission(context)
    return mapOf(
        "status" to if (granted) "granted" else "denied",
        "canAskAgain" to (!granted && Build.VERSION.SDK_INT >= 33),
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

private fun triggerAtMillis(options: JSONObject): Long {
    val trigger = options.optJSONObject("trigger")
        ?: throw notificationsError("invalid-arguments", "Notification trigger is required.", "scheduleNotification")
    return when (trigger.optString("type")) {
        "date" -> {
            val date = trigger.optString("date")
            runCatching { Instant.parse(date).toEpochMilli() }.getOrElse {
                throw notificationsError("invalid-arguments", "Date triggers require an ISO 8601 date string.", "scheduleNotification")
            }
        }
        "timeInterval" -> {
            val seconds = trigger.optDouble("seconds", 0.0)
            if (seconds <= 0.0) {
                throw notificationsError("invalid-arguments", "Time interval triggers require seconds greater than zero.", "scheduleNotification")
            }
            Instant.now().toEpochMilli() + (seconds * 1000).toLong()
        }
        else -> throw notificationsError("invalid-arguments", "Unsupported notification trigger.", "scheduleNotification")
    }
}

private fun notificationIntent(context: Context, id: String, content: JSONObject): PendingIntent {
    val intent = Intent(context, NativiteNotificationReceiver::class.java).apply {
        putExtra(EXTRA_ID, id)
        putExtra(EXTRA_TITLE, content.optString("title"))
        putExtra(EXTRA_BODY, content.optString("body"))
        putExtra(EXTRA_CHANNEL_ID, content.optString("channelId").takeIf { it.isNotBlank() } ?: "default")
        putExtra(EXTRA_DATA, content.optJSONObject("data")?.toString())
    }
    return PendingIntent.getBroadcast(
        context,
        notificationId(id),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}

private fun postNotification(context: Context, id: String, title: String, body: String?, channelId: String) {
    createNotificationChannel(context, mapOf("id" to channelId, "name" to "Default"))
    val notification = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(context.applicationInfo.icon)
        .setContentTitle(title)
        .setContentText(body)
        .setAutoCancel(true)
        .setWhen(Instant.now().toEpochMilli())
        .build()

    NotificationManagerCompat.from(context).notify(notificationId(id), notification)
}

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
    val triggerAt = triggerAtMillis(options)
    val pendingIntent = notificationIntent(context, id, content)

    if (triggerAt <= Instant.now().toEpochMilli()) {
        postNotification(context, id, title, content.optString("body").takeIf { it.isNotBlank() }, channelId)
    } else {
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
    }

    pendingNotifications[id] = mapOf(
        "id" to id,
        "content" to content.toMap(),
        "trigger" to options.optJSONObject("trigger")?.toMap(),
    )
    return id
}

private fun JSONObject.toMap(): Map<String, Any?> =
    keys().asSequence().associateWith { key -> opt(key) }

class NativiteNotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(EXTRA_ID) ?: return
        val title = intent.getStringExtra(EXTRA_TITLE) ?: return
        val body = intent.getStringExtra(EXTRA_BODY)
        val channelId = intent.getStringExtra(EXTRA_CHANNEL_ID) ?: "default"
        if (!hasPostNotificationsPermission(context)) return
        postNotification(context, id, title, body, channelId)
        pendingNotifications.remove(id)
    }
}

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
        if (Build.VERSION.SDK_INT >= 33 && !hasPostNotificationsPermission(context)) {
            val activity = activityOrNull(bridge)
            if (activity == null) {
                completion(Result.failure(notificationsError("native-unavailable", "Android activity is unavailable for notification permission prompts.", "requestPermissions")))
                return@register
            }
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                NOTIFICATION_REQUEST_CODE,
            )
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
            val pendingIntent = notificationIntent(context, id, JSONObject(mapOf("title" to "")))
            context.getSystemService(AlarmManager::class.java).cancel(pendingIntent)
            pendingIntent.cancel()
            NotificationManagerCompat.from(context).cancel(notificationId(id))
            pendingNotifications.remove(id)
        }
        completion(Result.success(mapOf("cancelled" to true)))
    }

    register(bridge, "cancelAllNotifications") { _, completion ->
        val context = applicationContextOrNull(bridge)
        if (context != null) NotificationManagerCompat.from(context).cancelAll()
        if (context != null) {
            for (id in pendingNotifications.keys) {
                val pendingIntent = notificationIntent(context, id, JSONObject(mapOf("title" to "")))
                context.getSystemService(AlarmManager::class.java).cancel(pendingIntent)
                pendingIntent.cancel()
            }
        }
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
