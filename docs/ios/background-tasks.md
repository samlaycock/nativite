# iOS Background Tasks

> Maps to: `src/native/ios/runtime/NativiteBackgroundTasks.swift`

iOS background task execution uses `BGTaskScheduler` for OS-managed scheduling and
JavaScriptCore for short-lived JavaScript task execution outside the WebView lifecycle.

## Supported Task Kinds

The initial iOS runtime supports only:

- `ios.kind: "app-refresh"` mapped to `BGAppRefreshTask`

Other iOS task kinds fail native project generation with an actionable validation error.
This keeps the API aligned with iOS background execution constraints instead of implying
arbitrary always-on JavaScript execution.

`BGAppRefreshTask` is intended for short refresh operations. iOS decides when a task actually
runs based on battery, usage patterns, network availability, and system quota. The
`earliestBeginAfterMinutes` option is a lower-bound request, not a guarantee. Long-running
processing, exact alarms, and user-visible foreground execution are intentionally unsupported by
Nativite's iOS background task API today.

## Generated Info.plist

When background tasks are configured for iOS, generated projects include:

- `BGTaskSchedulerPermittedIdentifiers` containing the registered task ids
- `UIBackgroundModes` with `fetch`

These values are derived from the generated background task manifest, so changes to task
ids invalidate the native project generation hash.

## Runtime Registration

`NativiteApp` adapts `NativiteAppDelegate` on iOS. During
`application(_:didFinishLaunchingWithOptions:)`, the delegate creates
`NativiteBackgroundTaskRuntime`, loads `nativite-background/manifest.json`, filters tasks to
supported `app-refresh` entries, and registers each task identifier with
`BGTaskScheduler.shared`.

When iOS launches a `BGAppRefreshTask`, the runtime looks up the manifest task by id, loads
the matching JavaScript bundle from `nativite-background/<task>.js`, and evaluates it in an
isolated JavaScriptCore context.

## Host Context

The initial JavaScriptCore context injects a constrained host object:

- `taskId`
- optional `payload`
- task-scoped durable string `storage.get`, `storage.set`, and `storage.remove`
- a non-aborted `signal` placeholder
- `fetch` from `globalThis.fetch` when available
- `log.debug`, `log.error`, `log.info`, and `log.warn`

Storage values persist in `UserDefaults` under `dev.nativite.background.storage`
with encoded task/key components so dotted task ids and dotted storage keys
cannot collide. Pending payloads use a separate namespace so one-off scheduling
data does not overwrite durable task data.

iOS also defines a versioned persisted task-state model containing schedule
state, run/retry counters, last run time, last result, and last error metadata.
Resolved task return values of `"failure"`, `"retry"`, or matching status
objects are captured into this state model and mark the `BGTask` completion as
unsuccessful. Persisted status JSON uses the same public keys as
`BackgroundTaskStatus` (`id`, `state`, `version`, `runCount`, `retryCount`,
`lastRunAt`, `lastResult`, and `lastError`) so native status responses do not
expose private model names to TypeScript callers.

## WebView Scheduling

`NativiteBridge` registers built-in `__background__` handlers on iOS:

- `schedule` validates the task id against the bundled manifest, rejects non-`app-refresh`
  tasks, and submits a `BGAppRefreshTaskRequest`.
- `cancel` calls `BGTaskScheduler.cancel(taskRequestWithIdentifier:)`.
- `getStatus` maps pending `BGTaskScheduler` requests to `{ state: "scheduled" }`, otherwise
  returning the last persisted completed/failed state when present or `{ state: "unknown" }`.

Payloads arrive from the JavaScript API as a serialized JSON string and are passed to the
JavaScriptCore host context when the task executes.

Use Xcode device logs and filter for `[nativite-background]` while testing. The OS may defer
execution even after scheduling succeeds, so verify generated metadata first, then use native
debug tools to manually trigger or inspect `BGTaskScheduler` behavior.

## Completion And Expiration

`BGTask` completion is guarded by a single-shot completion helper so success, failure, and
expiration paths call `setTaskCompleted(success:)` at most once. Expiration marks the task as
failed.
