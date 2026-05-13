import android.content.Context
import androidx.test.core.app.ApplicationProvider
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
}
