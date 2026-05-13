import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequest
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import org.json.JSONObject

class NativiteBackgroundWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        val taskId = inputData.getString(taskIdInputKey) ?: return Result.failure()
        val payload = inputData.getString(payloadInputKey)?.let { JSONObject(it) }

        return runNativiteBackgroundWork {
            NativiteBackgroundTaskRuntime(applicationContext).run(taskId, payload)
        }
    }

    companion object {
        const val taskIdInputKey: String = "nativite.taskId"
        const val payloadInputKey: String = "nativite.payload"
    }
}

internal suspend fun runNativiteBackgroundWork(
    runner: suspend () -> NativiteBackgroundTaskResult,
): androidx.work.ListenableWorker.Result =
    try {
        runner().toWorkResult()
    } catch (_: IllegalArgumentException) {
        androidx.work.ListenableWorker.Result.failure()
    } catch (_: TimeoutCancellationException) {
        androidx.work.ListenableWorker.Result.retry()
    } catch (err: CancellationException) {
        throw err
    } catch (_: Throwable) {
        androidx.work.ListenableWorker.Result.retry()
    }

object NativiteBackgroundWorkScheduler {
    fun scheduleRegisteredWork(context: Context) {
        for (task in NativiteBackgroundTasks.loadManifest(context)) {
            schedule(context, task)
        }
    }

    fun schedule(context: Context, task: NativiteBackgroundTask, payload: JSONObject? = null) {
        val android = task.androidOptions ?: return
        val workManager = WorkManager.getInstance(context)
        val workName = uniqueWorkName(task)

        when (android.kind) {
            "periodic-work" -> workManager.enqueueUniquePeriodicWork(
                workName,
                ExistingPeriodicWorkPolicy.UPDATE,
                periodicWorkRequest(task, android, payload),
            )
            "one-off-work" -> workManager.enqueueUniqueWork(
                workName,
                ExistingWorkPolicy.REPLACE,
                oneOffWorkRequest(task, android, payload),
            )
        }
    }

    fun cancel(context: Context, taskId: String) {
        WorkManager.getInstance(context).cancelUniqueWork(uniqueWorkName(taskId))
    }

    internal fun uniqueWorkName(task: NativiteBackgroundTask): String = uniqueWorkName(task.id)

    internal fun uniqueWorkName(taskId: String): String = "nativite-background-$taskId"

    internal fun oneOffWorkRequest(
        task: NativiteBackgroundTask,
        android: NativiteAndroidBackgroundTaskOptions,
        payload: JSONObject?,
    ): OneTimeWorkRequest {
        val builder = OneTimeWorkRequestBuilder<NativiteBackgroundWorker>()
            .setInputData(inputData(task, payload))
            .setConstraints(constraints(android))

        android.initialDelayMinutes?.let { builder.setInitialDelay(it, TimeUnit.MINUTES) }
        configureBackoff(builder, android)

        return builder.build()
    }

    internal fun periodicWorkRequest(
        task: NativiteBackgroundTask,
        android: NativiteAndroidBackgroundTaskOptions,
        payload: JSONObject?,
    ): PeriodicWorkRequest {
        val builder = PeriodicWorkRequestBuilder<NativiteBackgroundWorker>(
            android.repeatIntervalMinutes ?: 15,
            TimeUnit.MINUTES,
        )
            .setInputData(inputData(task, payload))
            .setConstraints(constraints(android))

        android.initialDelayMinutes?.let { builder.setInitialDelay(it, TimeUnit.MINUTES) }
        configureBackoff(builder, android)

        return builder.build()
    }

    private fun inputData(task: NativiteBackgroundTask, payload: JSONObject?): Data =
        Data.Builder()
            .putString(NativiteBackgroundWorker.taskIdInputKey, task.id)
            .apply {
                if (payload != null) {
                    putString(NativiteBackgroundWorker.payloadInputKey, payload.toString())
                }
            }
            .build()

    private fun constraints(android: NativiteAndroidBackgroundTaskOptions): Constraints =
        Constraints.Builder()
            .setRequiredNetworkType(networkType(android.requiresNetwork))
            .setRequiresCharging(android.requiresCharging)
            .build()

    private fun networkType(requiresNetwork: Any?): NetworkType {
        return when (requiresNetwork) {
            true -> NetworkType.CONNECTED
            "connected" -> NetworkType.CONNECTED
            "unmetered" -> NetworkType.UNMETERED
            "not-roaming" -> NetworkType.NOT_ROAMING
            else -> NetworkType.NOT_REQUIRED
        }
    }

    private fun configureBackoff(
        builder: WorkRequest.Builder<*, *>,
        android: NativiteAndroidBackgroundTaskOptions,
    ) {
        val delay = android.backoffDelayMinutes ?: return
        builder.setBackoffCriteria(backoffPolicy(android.backoffPolicy), delay, TimeUnit.MINUTES)
    }

    private fun backoffPolicy(policy: String?): BackoffPolicy =
        when (policy) {
            "linear" -> BackoffPolicy.LINEAR
            else -> BackoffPolicy.EXPONENTIAL
        }
}

private fun NativiteBackgroundTaskResult.toWorkResult(): androidx.work.ListenableWorker.Result {
    val taskValue = value

    if (taskValue is JSONObject) {
        return when (taskValue.optString("status")) {
            "failure" -> androidx.work.ListenableWorker.Result.failure()
            "retry" -> androidx.work.ListenableWorker.Result.retry()
            else -> androidx.work.ListenableWorker.Result.success()
        }
    }

    return when (taskValue) {
        "failure" -> androidx.work.ListenableWorker.Result.failure()
        "retry" -> androidx.work.ListenableWorker.Result.retry()
        else -> androidx.work.ListenableWorker.Result.success()
    }
}
