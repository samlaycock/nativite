import android.content.Context
import com.dokar.quickjs.evaluate
import com.dokar.quickjs.quickJs
import kotlinx.coroutines.withTimeout
import org.json.JSONObject

private const val taskGlobalName: String = "__nativiteBackgroundTask"
private const val contextGlobalName: String = "__nativiteBackgroundTaskContext"

data class NativiteBackgroundTask(
    val id: String,
    val bundle: String,
    val platforms: JSONObject,
)

data class NativiteBackgroundTaskResult(
    val taskId: String,
    val value: Any?,
)

interface NativiteBackgroundTaskHostApi {
    fun preludeScript(task: NativiteBackgroundTask): String = ""

    fun contextScript(task: NativiteBackgroundTask, payload: JSONObject?): String {
        val payloadScript = payload?.toString() ?: "null"
        return """
            ({
                task: {
                    id: ${JSONObject.quote(task.id)},
                    platforms: ${task.platforms},
                    payload: $payloadScript,
                },
                log: {
                    debug() {},
                    info() {},
                    warn() {},
                    error() {},
                },
            })
        """.trimIndent()
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

internal fun prepareBackgroundTaskBundleForEvaluation(bundle: String): String {
    val namedDefaultExport = Regex("""export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*};?\s*$""")
    val transformedNamedExport = namedDefaultExport.replace(bundle.trimEnd()) { match ->
        "globalThis.__nativiteBackgroundTask = ${match.groupValues[1]};"
    }

    if (transformedNamedExport != bundle.trimEnd()) return transformedNamedExport

    return bundle.replace(
        Regex("""export\s+default\s+"""),
        "globalThis.__nativiteBackgroundTask = ",
    )
}

class NativiteBackgroundTaskRuntime(
    private val context: Context,
    private val hostApi: NativiteBackgroundTaskHostApi = object : NativiteBackgroundTaskHostApi {},
    private val timeoutMillis: Long = NativiteBackgroundTasks.defaultExecutionTimeoutMillis,
) {
    suspend fun run(taskId: String, payload: JSONObject? = null): NativiteBackgroundTaskResult {
        val task = NativiteBackgroundTasks.loadManifest(context).firstOrNull { it.id == taskId }
            ?: throw IllegalArgumentException("Unknown Nativite background task: $taskId")
        val bundle = NativiteBackgroundTasks.loadBundle(context, task)

        return run(task, bundle, payload)
    }

    suspend fun run(
        task: NativiteBackgroundTask,
        bundle: String,
        payload: JSONObject? = null,
    ): NativiteBackgroundTaskResult = withTimeout(timeoutMillis) {
        var result: Any? = null

        quickJs {
            val prelude = hostApi.preludeScript(task)
            if (prelude.isNotBlank()) evaluate<Any?>(prelude)

            evaluate<Any?>(prepareBackgroundTaskBundleForEvaluation(bundle))
            evaluate<Any?>("globalThis.$contextGlobalName = ${hostApi.contextScript(task, payload)};")
            result = evaluate<Any?>(
                "await globalThis.$taskGlobalName.run(globalThis.$contextGlobalName);",
            )
        }

        NativiteBackgroundTaskResult(taskId = task.id, value = result)
    }
}
