package dev.nativite.plugins.calendar

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.time.Instant
import java.util.TimeZone

private typealias CalendarHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

private fun calendarError(code: String, message: String, operation: String): IllegalStateException =
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

private fun unsupported(operation: String): IllegalStateException =
    calendarError("unsupported", "The calendar operation is not supported on Android.", operation)

private fun permissionDenied(operation: String): IllegalStateException =
    calendarError("permission-denied", "Calendar permission has not been granted.", operation)

private fun register(bridge: Any, method: String, handler: CalendarHandler) {
    val registerMethod = bridge.javaClass.methods.first {
        it.name == "register" && it.parameterTypes.size == 3
    }
    registerMethod.invoke(bridge, "calendar", method, handler)
}

private fun applicationContextOrNull(bridge: Any): Context? {
    val accessor = bridge.javaClass.methods.firstOrNull { it.name == "applicationContextOrNull" }
    return accessor?.invoke(bridge) as? Context
}

private fun hasPermission(context: Context, permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

private fun permissionResponse(context: Context, kind: String): Map<String, Any> {
    val permission = Manifest.permission.READ_CALENDAR
    val granted = hasPermission(context, permission)
    return mapOf(
        "status" to if (granted) "granted" else "denied",
        "canAskAgain" to false,
        "kind" to kind,
        "platform" to "android",
    )
}

private fun JSONObject.stringOrNull(name: String): String? =
    if (has(name) && !isNull(name)) optString(name) else null

private fun parseMillis(value: String): Long = Instant.parse(value).toEpochMilli()

private fun queryCalendars(context: Context): List<Map<String, Any?>> {
    val calendars = mutableListOf<Map<String, Any?>>()
    val cursor = context.contentResolver.query(
        CalendarContract.Calendars.CONTENT_URI,
        arrayOf(
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.ACCOUNT_TYPE,
            CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
            CalendarContract.Calendars.CALENDAR_COLOR,
        ),
        null,
        null,
        "${CalendarContract.Calendars.CALENDAR_DISPLAY_NAME} ASC",
    )

    cursor?.use {
        val idIndex = it.getColumnIndexOrThrow(CalendarContract.Calendars._ID)
        val titleIndex = it.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME)
        val accountTypeIndex = it.getColumnIndexOrThrow(CalendarContract.Calendars.ACCOUNT_TYPE)
        val accessIndex = it.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL)
        val colorIndex = it.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_COLOR)
        while (it.moveToNext()) {
            val access = it.getInt(accessIndex)
            calendars.add(
                mapOf(
                    "id" to it.getLong(idIndex).toString(),
                    "title" to it.getString(titleIndex),
                    "source" to mapOf(
                        "id" to it.getString(accountTypeIndex),
                        "title" to it.getString(accountTypeIndex),
                        "type" to sourceType(it.getString(accountTypeIndex)),
                    ),
                    "allowsContentModifications" to (access >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR),
                    "entityTypes" to listOf("event"),
                    "color" to "#${it.getInt(colorIndex).toUInt().toString(16).takeLast(6).padStart(6, '0')}",
                    "platform" to "android",
                ),
            )
        }
    }

    return calendars
}

private fun sourceType(accountType: String?): String =
    when {
        accountType == null -> "unknown"
        accountType.contains("google", ignoreCase = true) -> "google"
        accountType.contains("exchange", ignoreCase = true) -> "exchange"
        accountType.contains("local", ignoreCase = true) -> "local"
        else -> "unknown"
    }

private fun selectedCalendarIds(options: JSONObject): Pair<String?, Array<String>?> {
    val ids = options.optJSONArray("calendarIds") ?: return null to null
    if (ids.length() == 0) return null to null
    val values = Array(ids.length()) { index -> ids.optString(index) }
    return "${CalendarContract.Instances.CALENDAR_ID} IN (${values.joinToString(",") { "?" }})" to values
}

private fun queryEvents(context: Context, options: JSONObject): List<Map<String, Any?>> {
    val startMillis = parseMillis(options.getString("startDate"))
    val endMillis = parseMillis(options.getString("endDate"))
    val pageSize = options.optInt("pageSize", 500).coerceIn(1, 2_000)
    val builder = CalendarContract.Instances.CONTENT_URI.buildUpon()
    ContentUris.appendId(builder, startMillis)
    ContentUris.appendId(builder, endMillis)
    val (selection, selectionArgs) = selectedCalendarIds(options)
    val cursor = context.contentResolver.query(
        builder.build(),
        arrayOf(
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.CALENDAR_ID,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.EVENT_LOCATION,
            CalendarContract.Instances.DESCRIPTION,
            CalendarContract.Instances.EVENT_TIMEZONE,
        ),
        selection,
        selectionArgs,
        "${CalendarContract.Instances.BEGIN} ASC LIMIT $pageSize",
    )

    val events = mutableListOf<Map<String, Any?>>()
    cursor?.use {
        val idIndex = it.getColumnIndexOrThrow(CalendarContract.Instances.EVENT_ID)
        val calendarIndex = it.getColumnIndexOrThrow(CalendarContract.Instances.CALENDAR_ID)
        val titleIndex = it.getColumnIndexOrThrow(CalendarContract.Instances.TITLE)
        val beginIndex = it.getColumnIndexOrThrow(CalendarContract.Instances.BEGIN)
        val endIndex = it.getColumnIndexOrThrow(CalendarContract.Instances.END)
        val allDayIndex = it.getColumnIndexOrThrow(CalendarContract.Instances.ALL_DAY)
        val locationIndex = it.getColumnIndexOrThrow(CalendarContract.Instances.EVENT_LOCATION)
        val notesIndex = it.getColumnIndexOrThrow(CalendarContract.Instances.DESCRIPTION)
        val timeZoneIndex = it.getColumnIndexOrThrow(CalendarContract.Instances.EVENT_TIMEZONE)
        while (it.moveToNext()) {
            events.add(
                mapOf(
                    "id" to it.getLong(idIndex).toString(),
                    "calendarId" to it.getLong(calendarIndex).toString(),
                    "title" to it.getString(titleIndex),
                    "startDate" to Instant.ofEpochMilli(it.getLong(beginIndex)).toString(),
                    "endDate" to Instant.ofEpochMilli(it.getLong(endIndex)).toString(),
                    "allDay" to (it.getInt(allDayIndex) == 1),
                    "location" to it.getString(locationIndex),
                    "notes" to it.getString(notesIndex),
                    "timeZone" to it.getString(timeZoneIndex),
                ),
            )
        }
    }
    return events
}

private fun eventValues(input: JSONObject): ContentValues =
    ContentValues().apply {
        put(CalendarContract.Events.CALENDAR_ID, input.getString("calendarId").toLong())
        put(CalendarContract.Events.TITLE, input.getString("title"))
        put(CalendarContract.Events.DTSTART, parseMillis(input.getString("startDate")))
        put(CalendarContract.Events.DTEND, parseMillis(input.getString("endDate")))
        put(CalendarContract.Events.ALL_DAY, if (input.optBoolean("allDay", false)) 1 else 0)
        put(CalendarContract.Events.EVENT_LOCATION, input.stringOrNull("location"))
        put(CalendarContract.Events.DESCRIPTION, input.stringOrNull("notes"))
        put(CalendarContract.Events.EVENT_TIMEZONE, input.stringOrNull("timeZone") ?: TimeZone.getDefault().id)
    }

fun registerNativiteCalendarPlugin(bridge: Any) {
    register(bridge, "getPermissionStatus") { args, completion ->
        val context = applicationContextOrNull(bridge)
        if (context == null) {
            completion(Result.failure(calendarError("native-unavailable", "Android context is unavailable.", "getPermissionStatus")))
        } else {
            val kind = (args as? JSONObject)?.optString("kind", "events") ?: "events"
            completion(Result.success(permissionResponse(context, kind)))
        }
    }

    register(bridge, "requestPermissions") { args, completion ->
        val context = applicationContextOrNull(bridge)
        if (context == null) {
            completion(Result.failure(calendarError("native-unavailable", "Android context is unavailable.", "requestPermissions")))
        } else {
            val kind = (args as? JSONObject)?.optString("kind", "events") ?: "events"
            completion(Result.success(permissionResponse(context, kind)))
        }
    }

    register(bridge, "listCalendars") { _, completion ->
        val context = applicationContextOrNull(bridge)
        when {
            context == null -> completion(Result.failure(calendarError("native-unavailable", "Android context is unavailable.", "listCalendars")))
            !hasPermission(context, Manifest.permission.READ_CALENDAR) -> completion(Result.failure(permissionDenied("listCalendars")))
            else -> completion(Result.success(mapOf("calendars" to queryCalendars(context))))
        }
    }

    register(bridge, "queryEvents") { args, completion ->
        val context = applicationContextOrNull(bridge)
        when {
            context == null -> completion(Result.failure(calendarError("native-unavailable", "Android context is unavailable.", "queryEvents")))
            !hasPermission(context, Manifest.permission.READ_CALENDAR) -> completion(Result.failure(permissionDenied("queryEvents")))
            args !is JSONObject -> completion(Result.failure(calendarError("invalid-arguments", "queryEvents requires options.", "queryEvents")))
            else -> completion(Result.success(mapOf("events" to queryEvents(context, args))))
        }
    }

    register(bridge, "createEvent") { args, completion ->
        val context = applicationContextOrNull(bridge)
        when {
            context == null -> completion(Result.failure(calendarError("native-unavailable", "Android context is unavailable.", "createEvent")))
            !hasPermission(context, Manifest.permission.WRITE_CALENDAR) -> completion(Result.failure(permissionDenied("createEvent")))
            args !is JSONObject -> completion(Result.failure(calendarError("invalid-arguments", "createEvent requires an event.", "createEvent")))
            else -> {
                val uri = context.contentResolver.insert(CalendarContract.Events.CONTENT_URI, eventValues(args))
                val id = uri?.lastPathSegment ?: ""
                completion(Result.success(mapOf("id" to id)))
            }
        }
    }

    register(bridge, "updateEvent") { args, completion ->
        val context = applicationContextOrNull(bridge)
        when {
            context == null -> completion(Result.failure(calendarError("native-unavailable", "Android context is unavailable.", "updateEvent")))
            !hasPermission(context, Manifest.permission.WRITE_CALENDAR) -> completion(Result.failure(permissionDenied("updateEvent")))
            args !is JSONObject || !args.has("id") -> completion(Result.failure(calendarError("invalid-arguments", "updateEvent requires an id.", "updateEvent")))
            else -> {
                val uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, args.getString("id").toLong())
                val rows = context.contentResolver.update(uri, eventValues(args), null, null)
                if (rows == 0) {
                    completion(Result.failure(calendarError("not-found", "Calendar event was not found.", "updateEvent")))
                } else {
                    completion(Result.success(mapOf("id" to args.getString("id"))))
                }
            }
        }
    }

    register(bridge, "deleteEvent") { args, completion ->
        val context = applicationContextOrNull(bridge)
        when {
            context == null -> completion(Result.failure(calendarError("native-unavailable", "Android context is unavailable.", "deleteEvent")))
            !hasPermission(context, Manifest.permission.WRITE_CALENDAR) -> completion(Result.failure(permissionDenied("deleteEvent")))
            args !is JSONObject || !args.has("id") -> completion(Result.failure(calendarError("invalid-arguments", "deleteEvent requires an id.", "deleteEvent")))
            else -> {
                val uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, args.getString("id").toLong())
                val deleted = context.contentResolver.delete(uri, null, null) > 0
                completion(Result.success(mapOf("deleted" to deleted)))
            }
        }
    }

    register(bridge, "openEvent") { args, completion ->
        val context = applicationContextOrNull(bridge)
        if (context == null || args !is JSONObject || !args.has("id")) {
            completion(Result.failure(calendarError("invalid-arguments", "openEvent requires an id.", "openEvent")))
        } else {
            val uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, args.getString("id").toLong())
            val intent = Intent(Intent.ACTION_VIEW).setData(uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            completion(Result.success(mapOf("opened" to true)))
        }
    }

    register(bridge, "createReminder") { _, completion -> completion(Result.failure(unsupported("createReminder"))) }
    register(bridge, "updateReminder") { _, completion -> completion(Result.failure(unsupported("updateReminder"))) }
    register(bridge, "deleteReminder") { _, completion -> completion(Result.failure(unsupported("deleteReminder"))) }
}
