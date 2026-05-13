import android.content.Context
import com.dokar.quickjs.evaluate
import com.dokar.quickjs.quickJs
import kotlinx.coroutines.withTimeout
import org.json.JSONObject

private const val taskGlobalName: String = "__nativiteBackgroundTask"
private const val contextGlobalName: String = "__nativiteBackgroundTaskContext"

data class NativiteBackgroundTaskResult(
    val taskId: String,
    val value: Any?,
)

interface NativiteBackgroundJavaScriptEngine {
    suspend fun run(preludeScript: String, bundleScript: String, contextScript: String): Any?
}

object NativiteQuickJsBackgroundJavaScriptEngine : NativiteBackgroundJavaScriptEngine {
    override suspend fun run(
        preludeScript: String,
        bundleScript: String,
        contextScript: String,
    ): Any? {
        var result: Any? = null

        quickJs {
            if (preludeScript.isNotBlank()) evaluate<Any?>(preludeScript)

            evaluate<Any?>(prepareBackgroundTaskBundleForEvaluation(bundleScript))
            evaluate<Any?>("globalThis.$contextGlobalName = $contextScript;")
            result = evaluate<Any?>(
                "await globalThis.$taskGlobalName.run(globalThis.$contextGlobalName);",
            )
        }

        return result
    }
}

interface NativiteBackgroundTaskHostApi {
    fun preludeScript(task: NativiteBackgroundTask): String = ""

    fun contextScript(task: NativiteBackgroundTask, payloadJSON: String?): String {
        val payloadScript = payloadJSON ?: "null"
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

internal fun prepareBackgroundTaskBundleForEvaluation(bundle: String): String {
    val namedDefaultExport = Regex("""export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*};?\s*$""")
    val trimmedBundle = bundle.trimEnd()
    val transformedNamedExport = namedDefaultExport.replace(trimmedBundle) { match ->
        "globalThis.__nativiteBackgroundTask = ${match.groupValues[1]};"
    }

    if (transformedNamedExport != trimmedBundle) return transformedNamedExport

    return bundle.replaceFirst(
        Regex("""export\s+default\s+"""),
        "globalThis.__nativiteBackgroundTask = ",
    )
}

class NativiteBackgroundTaskRuntime(
    private val context: Context,
    private val hostApi: NativiteBackgroundTaskHostApi = object : NativiteBackgroundTaskHostApi {},
    private val timeoutMillis: Long = NativiteBackgroundTasks.defaultExecutionTimeoutMillis,
    private val engine: NativiteBackgroundJavaScriptEngine = NativiteQuickJsBackgroundJavaScriptEngine,
    manifest: List<NativiteBackgroundTask>? = null,
) {
    private val tasks: List<NativiteBackgroundTask> by lazy {
        manifest ?: NativiteBackgroundTasks.loadManifest(context)
    }

    suspend fun run(taskId: String, payloadJSON: String? = null): NativiteBackgroundTaskResult {
        val task = tasks.firstOrNull { it.id == taskId }
            ?: throw IllegalArgumentException("Unknown Nativite background task: $taskId")
        val bundle = NativiteBackgroundTasks.loadBundle(context, task)

        return run(task, bundle, payloadJSON)
    }

    suspend fun run(
        task: NativiteBackgroundTask,
        bundle: String,
        payloadJSON: String? = null,
    ): NativiteBackgroundTaskResult = withTimeout(timeoutMillis) {
        NativiteBackgroundTaskResult(
            taskId = task.id,
            value = engine.run(
                preludeScript = hostApi.preludeScript(task),
                bundleScript = bundle,
                contextScript = hostApi.contextScript(task, payloadJSON),
            ),
        )
    }
}
