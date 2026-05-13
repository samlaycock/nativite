import android.content.Context
import android.content.SharedPreferences
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

data class NativiteBackgroundTaskPersistedState(
    val version: Int = 1,
    val taskId: String,
    val scheduleState: String,
    val runCount: Int = 0,
    val retryCount: Int = 0,
    val lastRunAt: String? = null,
    val lastResult: JSONObject? = null,
    val lastError: String? = null,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("version", version)
        .put("taskId", taskId)
        .put("scheduleState", scheduleState)
        .put("runCount", runCount)
        .put("retryCount", retryCount)
        .put("lastRunAt", lastRunAt)
        .put("lastResult", lastResult)
        .put("lastError", lastError)

    companion object {
        fun fromJson(json: JSONObject): NativiteBackgroundTaskPersistedState =
            NativiteBackgroundTaskPersistedState(
                version = json.optInt("version", 1),
                taskId = json.getString("taskId"),
                scheduleState = json.getString("scheduleState"),
                runCount = json.optInt("runCount", 0),
                retryCount = json.optInt("retryCount", 0),
                lastRunAt = json.optNullableString("lastRunAt"),
                lastResult = json.optJSONObject("lastResult"),
                lastError = json.optNullableString("lastError"),
            )
    }
}

interface NativiteBackgroundJavaScriptEngine {
    suspend fun run(preludeScript: String, bundleScript: String, contextScript: String): String
}

object NativiteQuickJsBackgroundJavaScriptEngine : NativiteBackgroundJavaScriptEngine {
    override suspend fun run(
        preludeScript: String,
        bundleScript: String,
        contextScript: String,
    ): String {
        var result = "{}"

        quickJs {
            if (preludeScript.isNotBlank()) evaluate<Any?>(preludeScript)

            evaluate<Any?>(prepareBackgroundTaskBundleForEvaluation(bundleScript))
            evaluate<Any?>("globalThis.$contextGlobalName = $contextScript;")
            result = evaluate<String>(
                """
                JSON.stringify(await (async () => {
                    const result = await globalThis.$taskGlobalName.run(globalThis.$contextGlobalName);
                    return { result, storage: globalThis.$contextGlobalName.__storageSnapshot() };
                })());
                """.trimIndent(),
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
            (() => {
            globalThis.__nativiteBackgroundStorage = {};
            return {
                taskId: ${JSONObject.quote(task.id)},
                payload: $payloadScript,
                signal: Object.freeze({ aborted: false }),
                storage: {
                    async get(key) { return globalThis.__nativiteBackgroundStorage[String(key)] ?? null; },
                    async set(key, value) { globalThis.__nativiteBackgroundStorage[String(key)] = String(value); },
                    async remove(key) { delete globalThis.__nativiteBackgroundStorage[String(key)]; },
                },
                fetch: globalThis.fetch,
                log: {
                    debug(...args) { console.debug(...args); },
                    info(...args) { console.info(...args); },
                    warn(...args) { console.warn(...args); },
                    error(...args) { console.error(...args); },
                },
                __storageSnapshot() {
                    return globalThis.__nativiteBackgroundStorage;
                },
            };
            })()
        """.trimIndent()
    }
}

class NativiteBackgroundTaskSharedPreferencesHostApi(
    private val preferences: SharedPreferences,
) : NativiteBackgroundTaskHostApi {
    override fun preludeScript(task: NativiteBackgroundTask): String =
        """
        globalThis.console = {
            debug: (...args) => undefined,
            error: (...args) => undefined,
            info: (...args) => undefined,
            warn: (...args) => undefined,
        };
        """.trimIndent()

    override fun contextScript(task: NativiteBackgroundTask, payloadJSON: String?): String {
        val payloadScript = payloadJSON ?: "null"
        val storage = JSONObject()
        val prefix = storageKeyPrefix(task.id)
        for ((key, value) in preferences.all) {
            if (key.startsWith(prefix) && value is String) {
                storage.put(key.removePrefix(prefix), value)
            }
        }
        return """
            (() => {
            globalThis.__nativiteBackgroundStorage = $storage;
            return {
                taskId: ${JSONObject.quote(task.id)},
                payload: $payloadScript,
                signal: Object.freeze({ aborted: false }),
                storage: {
                    async get(key) { return globalThis.__nativiteBackgroundStorage[String(key)] ?? null; },
                    async set(key, value) { globalThis.__nativiteBackgroundStorage[String(key)] = String(value); },
                    async remove(key) { delete globalThis.__nativiteBackgroundStorage[String(key)]; },
                },
                fetch: globalThis.fetch,
                log: {
                    debug(...args) { console.debug(...args); },
                    info(...args) { console.info(...args); },
                    warn(...args) { console.warn(...args); },
                    error(...args) { console.error(...args); },
                },
                __storageSnapshot() {
                    return globalThis.__nativiteBackgroundStorage;
                },
            };
            })()
        """.trimIndent()
    }

    fun persistStorage(taskId: String, storage: JSONObject) {
        val prefix = storageKeyPrefix(taskId)
        val editor = preferences.edit()
        for (key in preferences.all.keys) {
            if (key.startsWith(prefix)) editor.remove(key)
        }
        for (key in storage.keys()) {
            editor.putString("$prefix$key", storage.getString(key))
        }
        editor.apply()
    }

    companion object {
        const val preferencesName: String = "dev.nativite.background"

        fun preferences(context: Context): SharedPreferences =
            context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)

        fun storageKeyPrefix(taskId: String): String = "storage.$taskId."
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
    private val hostApi: NativiteBackgroundTaskHostApi =
        NativiteBackgroundTaskSharedPreferencesHostApi(
            NativiteBackgroundTaskSharedPreferencesHostApi.preferences(context),
        ),
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
        val envelope = JSONObject(
            engine.run(
                preludeScript = hostApi.preludeScript(task),
                bundleScript = bundle,
                contextScript = hostApi.contextScript(task, payloadJSON),
            ),
        )
        if (hostApi is NativiteBackgroundTaskSharedPreferencesHostApi) {
            hostApi.persistStorage(task.id, envelope.optJSONObject("storage") ?: JSONObject())
        }
        NativiteBackgroundTaskResult(
            taskId = task.id,
            value = envelope.opt("result"),
        )
    }
}

private fun JSONObject.optNullableString(key: String): String? =
    if (has(key) && !isNull(key)) getString(key) else null
