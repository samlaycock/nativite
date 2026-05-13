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
- placeholder async `storage.get`, `storage.set`, and `storage.remove`
- `fetch` from `globalThis.fetch` when available
- `log.debug`, `log.error`, `log.info`, and `log.warn`

Persistent storage, richer fetch bridging, retry/result persistence, and WebView-originated
scheduling state persistence are intentionally left for later runtime work.

## WebView Scheduling

`NativiteBridge` registers built-in `__background__` handlers on iOS:

- `schedule` validates the task id against the bundled manifest, rejects non-`app-refresh`
  tasks, and submits a `BGAppRefreshTaskRequest`.
- `cancel` calls `BGTaskScheduler.cancel(taskRequestWithIdentifier:)`.
- `getStatus` maps pending `BGTaskScheduler` requests to `{ state: "scheduled" }`, otherwise
  returning `{ state: "unknown" }`.

Payloads arrive from the JavaScript API as a serialized JSON string and are passed to the
JavaScriptCore host context when the task executes.

## Completion And Expiration

`BGTask` completion is guarded by a single-shot completion helper so success, failure, and
expiration paths call `setTaskCompleted(success:)` at most once. Expiration marks the task as
failed.
