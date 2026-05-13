import android.content.Context
import org.json.JSONObject

data class NativiteBackgroundTask(
    val id: String,
    val bundle: String,
    val platforms: JSONObject,
)

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
