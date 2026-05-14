package dev.nativite.plugins.contacts

import android.Manifest
import android.content.pm.PackageManager
import android.provider.ContactsContract
import androidx.core.content.ContextCompat
import org.json.JSONObject

private typealias ContactsHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

private fun unsupported(operation: String): IllegalStateException =
    IllegalStateException("""{"code":"unsupported","message":"The contacts operation is not supported in this runtime context.","platform":"android","operation":"$operation"}""")

private fun permissionDenied(operation: String): IllegalStateException =
    IllegalStateException("""{"code":"permission-denied","message":"Contacts permission has not been granted.","platform":"android","operation":"$operation"}""")

private fun register(bridge: Any, method: String, handler: ContactsHandler) {
    val registerMethod = bridge.javaClass.methods.first {
        it.name == "register" && it.parameterTypes.size == 3
    }
    registerMethod.invoke(bridge, "contacts", method, handler)
}

private fun applicationContextOrNull(bridge: Any): android.content.Context? {
    val accessor = bridge.javaClass.methods.firstOrNull { it.name == "applicationContextOrNull" }
    return accessor?.invoke(bridge) as? android.content.Context
}

fun registerNativiteContactsPlugin(bridge: Any) {
    register(bridge, "getPermissionStatus") { _, completion ->
        val context = applicationContextOrNull(bridge)
        if (context == null) {
            completion(Result.success(mapOf("status" to "unknown", "canAskAgain" to false, "platform" to "android")))
            return@register
        }
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
        completion(Result.success(mapOf("status" to if (granted) "granted" else "prompt", "canAskAgain" to !granted, "platform" to "android")))
    }

    register(bridge, "requestPermissions") { _, completion ->
        completion(Result.failure(unsupported("requestPermissions")))
    }

    register(bridge, "queryContacts") { args, completion ->
        val context = applicationContextOrNull(bridge)
        if (context == null) {
            completion(Result.failure(unsupported("queryContacts")))
            return@register
        }
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            completion(Result.failure(permissionDenied("queryContacts")))
            return@register
        }

        val options = args as? JSONObject
        val pageSize = options?.optInt("pageSize", 100)?.coerceIn(1, 500) ?: 100
        val contacts = mutableListOf<Map<String, Any?>>()
        val cursor = context.contentResolver.query(
            ContactsContract.Contacts.CONTENT_URI,
            arrayOf(
                ContactsContract.Contacts._ID,
                ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
            ),
            null,
            null,
            "${ContactsContract.Contacts.DISPLAY_NAME_PRIMARY} ASC",
        )

        cursor?.use {
            val idIndex = it.getColumnIndexOrThrow(ContactsContract.Contacts._ID)
            val displayNameIndex = it.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)
            while (it.moveToNext() && contacts.size < pageSize) {
                contacts.add(
                    mapOf(
                        "id" to it.getString(idIndex),
                        "name" to mapOf("displayName" to it.getString(displayNameIndex)),
                    ),
                )
            }
        }

        completion(Result.success(mapOf("contacts" to contacts)))
    }

    for (operation in listOf("pickContact", "createContact", "updateContact", "deleteContact", "listGroups", "exportVCard")) {
        register(bridge, operation) { _, completion ->
            completion(Result.failure(unsupported(operation)))
        }
    }
}
