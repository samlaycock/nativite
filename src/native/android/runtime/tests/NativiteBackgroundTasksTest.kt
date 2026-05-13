import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkInfo
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class NativiteBackgroundTasksTest {

    @Test
    fun loadManifest_parsesBundledTaskMetadata() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val tasks = NativiteBackgroundTasks.loadManifest(context)

        assertEquals(1, tasks.size)
        assertEquals("sync-inbox", tasks[0].id)
        assertEquals("sync-inbox.js", tasks[0].bundle)
        assertEquals("periodic-work", tasks[0].platforms.getJSONObject("android").getString("kind"))
    }

    @Test
    fun bundleAssetPath_pointsAtBundledTaskAsset() {
        val task = NativiteBackgroundTasks.loadManifest(
            ApplicationProvider.getApplicationContext<Context>(),
        )[0]

        assertEquals(
            "nativite-background/sync-inbox.js",
            NativiteBackgroundTasks.bundleAssetPath(task),
        )
    }

    @Test
    fun androidOptions_parseWorkManagerSchedulingMetadata() {
        val task = NativiteBackgroundTask(
            id = "sync-inbox",
            bundle = "sync-inbox.js",
            platforms = org.json.JSONObject(
                """
                {
                  "android": {
                    "kind": "periodic-work",
                    "repeatIntervalMinutes": 15,
                    "requiresNetwork": "unmetered",
                    "requiresCharging": true,
                    "backoffPolicy": "linear",
                    "backoffDelayMinutes": 5
                  }
                }
                """.trimIndent(),
            ),
        )

        val android = task.androidOptions!!

        assertEquals("periodic-work", android.kind)
        assertEquals(15L, android.repeatIntervalMinutes)
        assertEquals("unmetered", android.requiresNetwork)
        assertEquals(true, android.requiresCharging)
        assertEquals("linear", android.backoffPolicy)
        assertEquals(5L, android.backoffDelayMinutes)
        assertTrue(android.isSchedulable)
    }

    @Test
    fun androidOptions_marksUnknownKindsAsUnsupported() {
        val task = NativiteBackgroundTask(
            id = "sync-inbox",
            bundle = "sync-inbox.js",
            platforms = org.json.JSONObject(
                """
                {
                  "android": {
                    "kind": "background-fetch"
                  }
                }
                """.trimIndent(),
            ),
        )

        assertEquals(false, task.androidOptions!!.isSchedulable)
    }

    @Test
    fun backgroundWorker_throwsForUnsupportedAndroidTaskKinds() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val task = NativiteBackgroundTask(
            id = "sync-inbox",
            bundle = "sync-inbox.js",
            platforms = org.json.JSONObject(
                """
                {
                  "android": {
                    "kind": "background-fetch"
                  }
                }
                """.trimIndent(),
            ),
        )

        try {
            NativiteBackgroundWorkScheduler.schedule(context, task)
            fail("Expected unsupported Android background task kind to throw.")
        } catch (err: IllegalArgumentException) {
            assertEquals("Background task sync-inbox is not supported on Android.", err.message)
        }
    }

    @Test
    fun backgroundWorker_mapsTaskIdsToUniqueWorkNames() {
        assertEquals(
            "nativite-background-sync-inbox",
            NativiteBackgroundWorkScheduler.uniqueWorkName("sync-inbox"),
        )
    }

    @Test
    fun backgroundWorker_mapsWorkInfoStatesToBackgroundStates() {
        assertEquals("scheduled", WorkInfo.State.ENQUEUED.toNativiteBackgroundState())
        assertEquals("scheduled", WorkInfo.State.BLOCKED.toNativiteBackgroundState())
        assertEquals("running", WorkInfo.State.RUNNING.toNativiteBackgroundState())
        assertEquals("cancelled", WorkInfo.State.CANCELLED.toNativiteBackgroundState())
        assertEquals("completed", WorkInfo.State.SUCCEEDED.toNativiteBackgroundState())
        assertEquals("failed", WorkInfo.State.FAILED.toNativiteBackgroundState())
        assertEquals("unknown", null.toNativiteBackgroundState())
    }

    @Test
    fun backgroundWorker_statusResultUsesStableBridgeShape() {
        assertEquals(
            mapOf("id" to "sync-inbox", "state" to "unknown", "platform" to "android"),
            NativiteBackgroundWorkScheduler.statusResult("sync-inbox", "unknown"),
        )
    }

    @Test
    fun backgroundWorker_retriesTimedOutTasks() = runBlocking {
        val result = runNativiteBackgroundWork {
            withTimeout(1) {
                delay(10)
                NativiteBackgroundTaskResult("sync-inbox", null)
            }
        }

        assertTrue(result is ListenableWorker.Result.Retry)
    }

    @Test
    fun backgroundWorker_rethrowsCancellationInsteadOfRetrying() {
        try {
            runBlocking {
                runNativiteBackgroundWork {
                    throw CancellationException("cancelled")
                }
            }
            throw AssertionError("Expected CancellationException to be rethrown.")
        } catch (_: CancellationException) {
        }
    }

    @Test
    fun prepareBackgroundTaskBundleForEvaluation_exposesNamedDefaultExportOnGlobalThis() {
        val prepared = prepareBackgroundTaskBundleForEvaluation(
            """
            const syncInbox = { run() { return "ok"; } };
            export { syncInbox as default };
            """.trimIndent(),
        )

        assertTrue(prepared.contains("globalThis.__nativiteBackgroundTask = syncInbox;"))
    }

    @Test
    fun prepareBackgroundTaskBundleForEvaluation_exposesInlineDefaultExportOnGlobalThis() {
        val prepared = prepareBackgroundTaskBundleForEvaluation(
            """
            export default { run() { return "ok"; } };
            """.trimIndent(),
        )

        assertTrue(prepared.contains("globalThis.__nativiteBackgroundTask = { run()"))
    }

    @Test
    fun prepareBackgroundTaskBundleForEvaluation_replacesOnlyFirstInlineDefaultExport() {
        val prepared = prepareBackgroundTaskBundleForEvaluation(
            """
            export default { run() { return "ok"; } };
            const message = "export default should stay in this string";
            """.trimIndent(),
        )

        assertEquals(1, Regex("globalThis.__nativiteBackgroundTask").findAll(prepared).count())
        assertTrue(prepared.contains("export default should stay in this string"))
    }

    @Test
    fun backgroundTaskInvocationScript_treatsStorageSnapshotAsOptionalHostDetail() {
        val script = backgroundTaskInvocationScript()

        assertTrue(script.contains("""typeof context.__storageSnapshot === "function""""))
        assertTrue(script.contains(": {};"))
    }

    @Test
    fun run_loadsBundledTaskAndInvokesInjectedEngine() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        NativiteBackgroundTaskSharedPreferencesHostApi.preferences(context).edit().clear().commit()
        val engine = RecordingBackgroundJavaScriptEngine()
        val result = NativiteBackgroundTaskRuntime(
            context = context,
            engine = engine,
        ).run("sync-inbox")

        assertEquals("sync-inbox", result.taskId)
        assertEquals("ok", result.value)
        assertTrue(engine.bundleScript.contains("export { syncInbox as default };"))
        assertTrue(engine.contextScript.contains("sync-inbox"))
        assertTrue(engine.contextScript.contains("storage:"))
        assertTrue(engine.contextScript.contains("signal:"))
    }

    @Test
    fun run_persistsVersionedTaskStateAfterExecution() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val preferences = NativiteBackgroundTaskSharedPreferencesHostApi.preferences(context)
        preferences.edit().clear().commit()
        val engine = RecordingBackgroundJavaScriptEngine(
            """{"result":{"status":"retry","output":{"reason":"offline"}},"storage":{}}""",
        )

        NativiteBackgroundTaskRuntime(
            context = context,
            engine = engine,
        ).run("sync-inbox")

        val state = NativiteBackgroundTaskSharedPreferencesHostApi(preferences)
            .readPersistedState("sync-inbox")!!
        assertEquals("failed", state.scheduleState)
        assertEquals(1, state.runCount)
        assertEquals(1, state.retryCount)
        assertEquals("retry", state.lastResult?.getString("status"))
        assertEquals("offline", state.lastResult?.getJSONObject("output")?.getString("reason"))
        assertTrue(state.lastRunAt?.contains("T") == true)
    }

    @Test
    fun hostApi_defaultPreludeInstallsNoopConsoleForInheritedContextScript() {
        val task = NativiteBackgroundTask("sync-inbox", "sync-inbox.js", org.json.JSONObject())
        val hostApi = object : NativiteBackgroundTaskHostApi {}

        assertTrue(hostApi.preludeScript(task).contains("globalThis.console"))
        assertTrue(hostApi.contextScript(task, null).contains("console.debug"))
    }

    @Test
    fun sharedPreferencesHostApi_encodesStorageKeysWithoutDotCollisions() {
        val first = NativiteBackgroundTaskSharedPreferencesHostApi.storageKey("a.b", "c")
        val second = NativiteBackgroundTaskSharedPreferencesHostApi.storageKey("a", "b.c")

        assertTrue(first != second)
    }

    @Test
    fun persistedState_roundTripsVersionedTaskState() {
        val state = NativiteBackgroundTaskPersistedState(
            taskId = "sync-inbox",
            scheduleState = "completed",
            runCount = 2,
            retryCount = 1,
            lastRunAt = "2026-05-13T12:00:00Z",
            lastResult = org.json.JSONObject("""{"status":"success","output":{"count":2}}"""),
            lastError = null,
        )

        val roundTripped = NativiteBackgroundTaskPersistedState.fromJson(state.toJson())

        assertEquals(1, roundTripped.version)
        assertEquals("sync-inbox", roundTripped.taskId)
        assertEquals("completed", roundTripped.scheduleState)
        assertEquals(2, roundTripped.runCount)
        assertEquals(1, roundTripped.retryCount)
        assertEquals("success", roundTripped.lastResult?.getString("status"))
        assertEquals(null, roundTripped.lastError)
    }
}

private class RecordingBackgroundJavaScriptEngine(
    private val response: String = """{"result":"ok","storage":{"cursor":"abc"}}""",
) : NativiteBackgroundJavaScriptEngine {
    var bundleScript: String = ""
    var contextScript: String = ""

    override suspend fun run(
        preludeScript: String,
        bundleScript: String,
        contextScript: String,
    ): String {
        this.bundleScript = bundleScript
        this.contextScript = contextScript
        return response
    }
}
