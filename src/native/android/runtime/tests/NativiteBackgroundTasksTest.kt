import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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
    fun run_loadsBundledTaskAndInvokesInjectedEngine() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val engine = RecordingBackgroundJavaScriptEngine()
        val result = NativiteBackgroundTaskRuntime(
            context = context,
            engine = engine,
        ).run("sync-inbox")

        assertEquals("sync-inbox", result.taskId)
        assertEquals("ok", result.value)
        assertTrue(engine.bundleScript.contains("export { syncInbox as default };"))
        assertTrue(engine.contextScript.contains("sync-inbox"))
    }
}

private class RecordingBackgroundJavaScriptEngine : NativiteBackgroundJavaScriptEngine {
    var bundleScript: String = ""
    var contextScript: String = ""

    override suspend fun run(
        preludeScript: String,
        bundleScript: String,
        contextScript: String,
    ): Any? {
        this.bundleScript = bundleScript
        this.contextScript = contextScript
        return "ok"
    }
}
