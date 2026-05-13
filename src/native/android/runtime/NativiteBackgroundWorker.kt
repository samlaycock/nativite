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
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkRequest
import androidx.work.WorkerParameters
import java.util.concurrent.Executor
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import org.json.JSONArray
import org.json.JSONObject

class NativiteBackgroundWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        val taskId = inputData.getString(taskIdInputKey) ?: return Result.failure()
        val payload = inputData.getString(payloadInputKey)

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

    fun schedule(context: Context, task: NativiteBackgroundTask, payloadJSON: String? = null) {
        val android = task.androidOptions ?: return
        require(android.isSchedulable) {
            "Background task ${task.id} is not supported on Android."
        }
        val workManager = WorkManager.getInstance(context)
        val workName = uniqueWorkName(task)

        when (android.kind) {
            "periodic-work" -> workManager.enqueueUniquePeriodicWork(
                workName,
                ExistingPeriodicWorkPolicy.UPDATE,
                periodicWorkRequest(task, android, payloadJSON),
            )
            "one-off-work" -> workManager.enqueueUniqueWork(
                workName,
                ExistingWorkPolicy.REPLACE,
                oneOffWorkRequest(task, android, payloadJSON),
            )
        }
    }

    fun cancel(context: Context, taskId: String) {
        WorkManager.getInstance(context).cancelUniqueWork(uniqueWorkName(taskId))
    }

    fun status(context: Context, taskId: String, completion: (Map<String, Any?>) -> Unit) {
        val workName = uniqueWorkName(taskId)
        val future = WorkManager.getInstance(context).getWorkInfosForUniqueWork(workName)
        future.addListener({
            val schedulerState = try {
                future.get().firstOrNull()?.state.toNativiteBackgroundState()
            } catch (_: Exception) {
                "unknown"
            }
            val persistedState = NativiteBackgroundTaskSharedPreferencesHostApi(
                NativiteBackgroundTaskSharedPreferencesHostApi.preferences(context),
            ).readPersistedState(taskId)
            completion(
                statusResult(
                    taskId = taskId,
                    state = schedulerState,
                    persistedState = persistedState,
                ),
            )
        }, directExecutor)
    }

    internal fun statusResult(
        taskId: String,
        state: String,
        persistedState: NativiteBackgroundTaskPersistedState? = null,
    ): Map<String, Any?> {
        val result = mutableMapOf<String, Any?>(
            "id" to taskId,
            "state" to if (state == "unknown") persistedState?.state ?: state else state,
            "platform" to "android",
        )
        if (persistedState != null) {
            result["version"] = persistedState.version
            result["runCount"] = persistedState.runCount
            result["retryCount"] = persistedState.retryCount
            result["lastRunAt"] = persistedState.lastRunAt
            result["lastResult"] = persistedState.lastResult?.let(::statusResultPayload)
            result["lastError"] = persistedState.lastError
        }
        return result
    }

    internal fun statusResultPayload(result: JSONObject): Map<String, Any?> =
        result.toPlainMap()

    internal fun uniqueWorkName(task: NativiteBackgroundTask): String = uniqueWorkName(task.id)

    internal fun uniqueWorkName(taskId: String): String = "nativite-background-$taskId"

    private val directExecutor = Executor { runnable -> runnable.run() }

    internal fun oneOffWorkRequest(
        task: NativiteBackgroundTask,
        android: NativiteAndroidBackgroundTaskOptions,
        payloadJSON: String?,
    ): OneTimeWorkRequest {
        val builder = OneTimeWorkRequestBuilder<NativiteBackgroundWorker>()
            .setInputData(inputData(task, payloadJSON))
            .setConstraints(constraints(android))

        android.initialDelayMinutes?.let { builder.setInitialDelay(it, TimeUnit.MINUTES) }
        configureBackoff(builder, android)

        return builder.build()
    }

    internal fun periodicWorkRequest(
        task: NativiteBackgroundTask,
        android: NativiteAndroidBackgroundTaskOptions,
        payloadJSON: String?,
    ): PeriodicWorkRequest {
        val builder = PeriodicWorkRequestBuilder<NativiteBackgroundWorker>(
            android.repeatIntervalMinutes ?: 15,
            TimeUnit.MINUTES,
        )
            .setInputData(inputData(task, payloadJSON))
            .setConstraints(constraints(android))

        android.initialDelayMinutes?.let { builder.setInitialDelay(it, TimeUnit.MINUTES) }
        configureBackoff(builder, android)

        return builder.build()
    }

    private fun inputData(task: NativiteBackgroundTask, payloadJSON: String?): Data =
        Data.Builder()
            .putString(NativiteBackgroundWorker.taskIdInputKey, task.id)
            .apply {
                if (payloadJSON != null) {
                    putString(NativiteBackgroundWorker.payloadInputKey, payloadJSON)
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

internal fun WorkInfo.State?.toNativiteBackgroundState(): String =
    when (this) {
        WorkInfo.State.ENQUEUED, WorkInfo.State.BLOCKED -> "scheduled"
        WorkInfo.State.RUNNING -> "running"
        WorkInfo.State.CANCELLED -> "cancelled"
        WorkInfo.State.SUCCEEDED -> "completed"
        WorkInfo.State.FAILED -> "failed"
        null -> "unknown"
    }

private fun JSONObject.toPlainMap(): Map<String, Any?> {
    val result = mutableMapOf<String, Any?>()
    for (key in keys()) {
        result[key] = opt(key).toPlainValue()
    }
    return result
}

private fun JSONArray.toPlainList(): List<Any?> {
    val result = mutableListOf<Any?>()
    for (index in 0 until length()) {
        result += opt(index).toPlainValue()
    }
    return result
}

private fun Any?.toPlainValue(): Any? =
    when (this) {
        null, JSONObject.NULL -> null
        is JSONObject -> toPlainMap()
        is JSONArray -> toPlainList()
        else -> this
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
