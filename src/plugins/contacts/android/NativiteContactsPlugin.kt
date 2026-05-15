package dev.nativite.plugins.contacts

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.provider.ContactsContract
import androidx.core.content.ContextCompat
import org.json.JSONObject

private typealias ContactsHandler = (args: Any?, completion: (Result<Any?>) -> Unit) -> Unit

private fun contactsError(code: String, message: String, operation: String): IllegalStateException =
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
    contactsError(
        "unsupported",
        "The contacts operation is not supported in this runtime context.",
        operation,
    )

private fun permissionDenied(operation: String): IllegalStateException =
    contactsError(
        "permission-denied",
        "Contacts permission has not been granted.",
        operation,
    )

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

private fun searchSelection(search: String?): Pair<String?, Array<String>?> {
    if (search.isNullOrBlank()) return null to null

    return "${ContactsContract.Contacts.DISPLAY_NAME_PRIMARY} LIKE ?" to arrayOf("%$search%")
}

private val defaultContactFields = setOf("id", "name", "phones", "emails", "addresses", "organization", "birthday")
private val supportedContactFields = defaultContactFields + "note"

private fun requestedFields(options: JSONObject?): Set<String> {
    val fields = options?.optJSONArray("fields") ?: return defaultContactFields
    val requested = mutableSetOf<String>()
    for (index in 0 until fields.length()) {
        val field = fields.optString(index)
        if (field in supportedContactFields) {
            requested.add(field)
        }
    }

    return if (requested.isEmpty()) defaultContactFields else requested + setOf("id", "name")
}

private fun Cursor.stringOrNull(column: String): String? {
    val index = getColumnIndex(column)
    if (index < 0 || isNull(index)) return null
    return getString(index)
}

private fun queryPhones(context: Context, contactId: String): List<Map<String, String>> {
    val phones = mutableListOf<Map<String, String>>()
    val cursor = context.contentResolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Phone.TYPE,
            ContactsContract.CommonDataKinds.Phone.LABEL,
        ),
        "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID} = ?",
        arrayOf(contactId),
        null,
    )

    cursor?.use {
        val numberIndex = it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)
        val typeIndex = it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.TYPE)
        val labelIndex = it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.LABEL)
        while (it.moveToNext()) {
            val value = it.getString(numberIndex) ?: continue
            val label = ContactsContract.CommonDataKinds.Phone.getTypeLabel(
                context.resources,
                it.getInt(typeIndex),
                it.getString(labelIndex),
            ).toString()
            phones.add(mapOf("label" to label, "value" to value))
        }
    }

    return phones
}

private fun queryEmails(context: Context, contactId: String): List<Map<String, String>> {
    val emails = mutableListOf<Map<String, String>>()
    val cursor = context.contentResolver.query(
        ContactsContract.CommonDataKinds.Email.CONTENT_URI,
        arrayOf(
            ContactsContract.CommonDataKinds.Email.ADDRESS,
            ContactsContract.CommonDataKinds.Email.TYPE,
            ContactsContract.CommonDataKinds.Email.LABEL,
        ),
        "${ContactsContract.CommonDataKinds.Email.CONTACT_ID} = ?",
        arrayOf(contactId),
        null,
    )

    cursor?.use {
        val addressIndex = it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.ADDRESS)
        val typeIndex = it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.TYPE)
        val labelIndex = it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.LABEL)
        while (it.moveToNext()) {
            val value = it.getString(addressIndex) ?: continue
            val label = ContactsContract.CommonDataKinds.Email.getTypeLabel(
                context.resources,
                it.getInt(typeIndex),
                it.getString(labelIndex),
            ).toString()
            emails.add(mapOf("label" to label, "value" to value))
        }
    }

    return emails
}

private fun queryAddresses(context: Context, contactId: String): List<Map<String, String?>> {
    val addresses = mutableListOf<Map<String, String?>>()
    val cursor = context.contentResolver.query(
        ContactsContract.CommonDataKinds.StructuredPostal.CONTENT_URI,
        arrayOf(
            ContactsContract.CommonDataKinds.StructuredPostal.STREET,
            ContactsContract.CommonDataKinds.StructuredPostal.CITY,
            ContactsContract.CommonDataKinds.StructuredPostal.REGION,
            ContactsContract.CommonDataKinds.StructuredPostal.POSTCODE,
            ContactsContract.CommonDataKinds.StructuredPostal.COUNTRY,
            ContactsContract.CommonDataKinds.StructuredPostal.TYPE,
            ContactsContract.CommonDataKinds.StructuredPostal.LABEL,
        ),
        "${ContactsContract.CommonDataKinds.StructuredPostal.CONTACT_ID} = ?",
        arrayOf(contactId),
        null,
    )

    cursor?.use {
        val typeIndex = it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.StructuredPostal.TYPE)
        val labelIndex = it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.StructuredPostal.LABEL)
        while (it.moveToNext()) {
            val label = ContactsContract.CommonDataKinds.StructuredPostal.getTypeLabel(
                context.resources,
                it.getInt(typeIndex),
                it.getString(labelIndex),
            ).toString()
            addresses.add(
                mapOf(
                    "label" to label,
                    "street" to it.stringOrNull(ContactsContract.CommonDataKinds.StructuredPostal.STREET),
                    "city" to it.stringOrNull(ContactsContract.CommonDataKinds.StructuredPostal.CITY),
                    "region" to it.stringOrNull(ContactsContract.CommonDataKinds.StructuredPostal.REGION),
                    "postalCode" to it.stringOrNull(ContactsContract.CommonDataKinds.StructuredPostal.POSTCODE),
                    "country" to it.stringOrNull(ContactsContract.CommonDataKinds.StructuredPostal.COUNTRY),
                ),
            )
        }
    }

    return addresses
}

private fun querySingleDataValue(context: Context, contactId: String, mimeType: String, column: String): String? {
    val cursor = context.contentResolver.query(
        ContactsContract.Data.CONTENT_URI,
        arrayOf(column),
        "${ContactsContract.Data.CONTACT_ID} = ? AND ${ContactsContract.Data.MIMETYPE} = ?",
        arrayOf(contactId, mimeType),
        null,
    )

    cursor?.use {
        if (it.moveToFirst()) {
            return it.stringOrNull(column)
        }
    }

    return null
}

private fun queryBirthday(context: Context, contactId: String): String? {
    val cursor = context.contentResolver.query(
        ContactsContract.Data.CONTENT_URI,
        arrayOf(ContactsContract.CommonDataKinds.Event.START_DATE),
        "${ContactsContract.Data.CONTACT_ID} = ? AND ${ContactsContract.Data.MIMETYPE} = ? AND ${ContactsContract.CommonDataKinds.Event.TYPE} = ?",
        arrayOf(
            contactId,
            ContactsContract.CommonDataKinds.Event.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.Event.TYPE_BIRTHDAY.toString(),
        ),
        null,
    )

    cursor?.use {
        if (it.moveToFirst()) {
            return it.stringOrNull(ContactsContract.CommonDataKinds.Event.START_DATE)
        }
    }

    return null
}

private fun contactMap(context: Context, id: String, displayName: String?, fields: Set<String>): Map<String, Any?> {
    val contact = mutableMapOf<String, Any?>("id" to id)
    if ("name" in fields) {
        contact["name"] = mapOf("displayName" to displayName)
    }
    if ("phones" in fields) {
        contact["phones"] = queryPhones(context, id)
    }
    if ("emails" in fields) {
        contact["emails"] = queryEmails(context, id)
    }
    if ("addresses" in fields) {
        contact["addresses"] = queryAddresses(context, id)
    }
    if ("organization" in fields) {
        contact["organization"] = querySingleDataValue(
            context,
            id,
            ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.Organization.COMPANY,
        )
    }
    if ("birthday" in fields) {
        contact["birthday"] = queryBirthday(context, id)
    }
    if ("note" in fields) {
        contact["note"] = querySingleDataValue(
            context,
            id,
            ContactsContract.CommonDataKinds.Note.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.Note.NOTE,
        )
    }

    return contact
}

fun registerNativiteContactsPlugin(bridge: Any) {
    register(bridge, "getPermissionStatus") { _, completion ->
        val context = applicationContextOrNull(bridge)
        if (context == null) {
            completion(Result.success(mapOf("status" to "unknown", "canAskAgain" to false, "platform" to "android")))
            return@register
        }
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
        completion(Result.success(mapOf("status" to if (granted) "granted" else "denied", "canAskAgain" to false, "platform" to "android")))
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
        val fields = requestedFields(options)
        val pageSize = options?.optInt("pageSize", 100)?.coerceIn(1, 500) ?: 100
        val search = options?.optString("search")?.takeIf { it.isNotBlank() }
        val (selection, selectionArgs) = searchSelection(search)
        val contacts = mutableListOf<Map<String, Any?>>()

        try {
            val cursor = context.contentResolver.query(
                ContactsContract.Contacts.CONTENT_URI,
                arrayOf(
                    ContactsContract.Contacts._ID,
                    ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
                ),
                selection,
                selectionArgs,
                "${ContactsContract.Contacts.DISPLAY_NAME_PRIMARY} ASC",
            )

            cursor?.use {
                val idIndex = it.getColumnIndexOrThrow(ContactsContract.Contacts._ID)
                val displayNameIndex = it.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)
                while (it.moveToNext() && contacts.size < pageSize) {
                    contacts.add(contactMap(context, it.getString(idIndex), it.getString(displayNameIndex), fields))
                }
            }
        } catch (error: Exception) {
            completion(Result.failure(contactsError("operation-failed", error.message ?: "Contacts query failed.", "queryContacts")))
            return@register
        }

        completion(Result.success(mapOf("contacts" to contacts)))
    }

    for (operation in listOf("pickContact", "createContact", "updateContact", "deleteContact", "listGroups", "exportVCard")) {
        register(bridge, operation) { _, completion ->
            completion(Result.failure(unsupported(operation)))
        }
    }
}
