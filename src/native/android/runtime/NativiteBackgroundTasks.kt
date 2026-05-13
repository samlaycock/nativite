import android.content.Context
import org.json.JSONObject

data class NativiteBackgroundTask(
    val id: String,
    val bundle: String,
    val platforms: JSONObject,
)

object NativiteBackgroundTasks {
    const val manifestAssetPath: String = "nativite-background/manifest.json"

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
}
