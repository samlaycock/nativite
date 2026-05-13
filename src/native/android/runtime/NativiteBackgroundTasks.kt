import android.content.Context
import org.json.JSONObject

data class NativiteBackgroundTask(
    val id: String,
    val bundle: String,
    val platforms: JSONObject,
) {
    val androidOptions: NativiteAndroidBackgroundTaskOptions?
        get() = platforms.optJSONObject("android")?.let(NativiteAndroidBackgroundTaskOptions::fromJson)
}

data class NativiteAndroidBackgroundTaskOptions(
    val kind: String,
    val repeatIntervalMinutes: Long?,
    val initialDelayMinutes: Long?,
    val requiresNetwork: Any?,
    val requiresCharging: Boolean,
    val backoffPolicy: String?,
    val backoffDelayMinutes: Long?,
) {
    companion object {
        fun fromJson(json: JSONObject): NativiteAndroidBackgroundTaskOptions =
            NativiteAndroidBackgroundTaskOptions(
                kind = json.getString("kind"),
                repeatIntervalMinutes = json.optionalLong("repeatIntervalMinutes"),
                initialDelayMinutes = json.optionalLong("initialDelayMinutes"),
                requiresNetwork = json.optionalNetworkRequirement(),
                requiresCharging = json.optBoolean("requiresCharging", false),
                backoffPolicy = json.optString("backoffPolicy").ifEmpty { null },
                backoffDelayMinutes = json.optionalLong("backoffDelayMinutes"),
            )
    }
}

object NativiteBackgroundTasks {
    const val manifestAssetPath: String = "nativite-background/manifest.json"
    const val defaultExecutionTimeoutMillis: Long = 30_000

    fun loadManifest(context: Context): List<NativiteBackgroundTask> {
        val manifest = context.assets.open(manifestAssetPath).bufferedReader().use { reader ->
            JSONObject(reader.readText())
        }
        val tasks = manifest.getJSONArray("tasks")

        return List(tasks.length()) { index ->
            val task = tasks.getJSONObject(index)
            NativiteBackgroundTask(
                id = task.getString("id"),
                bundle = task.getString("bundle"),
                platforms = task.optJSONObject("platforms") ?: JSONObject(),
            )
        }
    }

    fun bundleAssetPath(task: NativiteBackgroundTask): String = "nativite-background/${task.bundle}"

    fun loadBundle(context: Context, task: NativiteBackgroundTask): String =
        context.assets.open(bundleAssetPath(task)).bufferedReader().use { reader ->
            reader.readText()
        }
}

private fun JSONObject.optionalLong(key: String): Long? =
    if (has(key) && !isNull(key)) getLong(key) else null

private fun JSONObject.optionalNetworkRequirement(): Any? {
    if (!has("requiresNetwork") || isNull("requiresNetwork")) return null
    val value = get("requiresNetwork")
    return when (value) {
        is Boolean -> value
        is String -> value
        else -> null
    }
}
