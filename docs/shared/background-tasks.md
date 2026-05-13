# Background Tasks

Nativite exposes a `nativite/background` entrypoint for JavaScript-defined background tasks.
The API is intentionally build-artifact oriented: task functions are authored in JavaScript,
but native platforms should persist task ids, schedules, payloads, retry state, and results
rather than stringified callbacks.

## Task Modules

Task modules should default-export a `defineBackgroundTask()` result:

```ts
import { defineBackgroundTask } from "nativite/background";

export default defineBackgroundTask({
  id: "sync-inbox",
  ios: {
    kind: "app-refresh",
    earliestBeginAfterMinutes: 15,
  },
  android: {
    kind: "periodic-work",
    repeatIntervalMinutes: 15,
    requiresNetwork: true,
  },
  async run(ctx) {
    const token = await ctx.storage.get("auth-token");
    if (!token) return;

    await ctx.fetch("/api/sync", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
});
```

The runner receives a constrained context and should not depend on WebView globals:

| Property  | Description                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `taskId`  | Stable registered task id from the native manifest.                                                                                                          |
| `payload` | JSON payload supplied by the native scheduler or WebView scheduling API.                                                                                     |
| `signal`  | Cancellation/deadline signal when the host can expose one. Current native hosts expose a non-aborted placeholder and cancel by terminating active execution. |
| `storage` | Durable task-scoped string storage with `get`, `set`, and `remove`.                                                                                          |
| `fetch`   | Host fetch function when the JavaScript engine provides one.                                                                                                 |
| `log`     | Structured log methods mapped to native background logging.                                                                                                  |

Task runners can return `undefined`, `"success"`, `"failure"`, `"retry"`, or an object like
`{ status: "retry", output: { reason: "offline" } }`. Native hosts persist latest result
metadata separately from executable task source.

## WebView Scheduling API

App code running in the main WebView can schedule, cancel, and query registered background
tasks through the same `nativite/background` entrypoint:

```ts
import { background } from "nativite/background";

await background.schedule("refresh-session", {
  payload: { reason: "manual" },
});

await background.cancel("refresh-session");
const status = await background.getStatus("refresh-session");
```

Scheduling is separate from task definition: `defineBackgroundTask()` declares and bundles a
task at build time, while `background.schedule()` controls an already-registered task by id at
runtime. The WebView API sends bridge calls to the built-in `__background__` namespace using
the `schedule`, `cancel`, and `getStatus` methods.

`getStatus()` returns the public `BackgroundTaskStatus` shape. Native persisted status metadata
uses the same keys as TypeScript callers consume: `id`, `state`, `version`, `runCount`,
`retryCount`, `lastRunAt`, `lastResult`, and `lastError`.

Payloads must be JSON-serializable values. Nativite serializes the payload before it crosses
the native bridge, so native platforms receive the same JSON string regardless of WebView
transport quirks. Unsupported task ids and platform/task-kind combinations reject with native
bridge errors.

## End-to-End Workflow

1. Define one task module per background entrypoint with `defineBackgroundTask()`. Keep the
   runner independent from `window`, `document`, and other WebView-only globals.
2. Register those modules in `backgroundTasks` in `nativite.config.ts`.
3. Generate or build each native target with `bun run nativite build --platform ios` or
   `bun run nativite build --platform android`.
4. Check the generated native output for `nativite-background/manifest.json` and one `.js`
   bundle for each registered task.
5. Schedule tasks from WebView app code with `background.schedule(taskId, { payload })`.
6. Observe scheduling and latest persisted execution state with `background.getStatus(taskId)`.
7. Inspect native logs for lines prefixed with `[nativite-background]` while testing on a
   simulator, emulator, or device.

The `examples/background-tasks` directory contains a complete fixture with a periodic sync task,
a one-off session refresh task, config registration, and WebView scheduling code.

## Config Registration

Register task entrypoints in `nativite.config.ts`:

```ts
import { android, defineConfig, ios } from "nativite";

export default defineConfig({
  app: {
    name: "MyApp",
    bundleId: "com.example.myapp",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [ios(), android()],
  backgroundTasks: [
    "./src/background/sync-inbox.task.ts",
    { path: "./src/background/refresh-session.task.ts" },
  ],
});
```

Task paths must be unique. Platform-specific task options are extensible through
`BackgroundTaskPlatformOptions` module augmentation.

During native project generation, Nativite resolves each path relative to the project root,
imports the task module, and validates that its default export has a non-empty `id` and
callable `run` function. Duplicate task ids fail generation even when the file paths differ.

## Manifest Shape

`createBackgroundTaskManifestEntry()` and `createBackgroundTaskManifest()` produce versioned
metadata without including the executable `run` function:

```json
{
  "version": 1,
  "tasks": [
    {
      "id": "sync-inbox",
      "bundle": "sync-inbox.js",
      "platforms": {
        "ios": { "kind": "app-refresh" },
        "android": { "kind": "periodic-work", "repeatIntervalMinutes": 15 }
      }
    }
  ]
}
```

Generated projects include compiled JavaScript task bundles so native implementations can load
bundled task entrypoints by id instead of evaluating persisted source strings.

## Generated Native Metadata

Generated native projects include the manifest at a stable resource path:

- Android: `.nativite/android/app/src/main/assets/nativite-background/manifest.json`
- iOS: `.nativite/ios/<AppName>/nativite-background/manifest.json`
- macOS: `.nativite/macos/<AppName>/nativite-background/manifest.json`

Each manifest `bundle` value points at a JavaScript file emitted next to the manifest:

- Android: `.nativite/android/app/src/main/assets/nativite-background/<task>.js`
- iOS: `.nativite/ios/<AppName>/nativite-background/<task>.js`
- macOS: `.nativite/macos/<AppName>/nativite-background/<task>.js`

Task bundles are built as isolated Vite entries and are kept separate from the main WebView
application bundle. Dynamic imports are inlined so each registered task emits a single native
JavaScript asset. Bundle filenames are deterministic and derived from the registered task
entrypoint filename, so two tasks with the same basename are rejected to avoid native asset
collisions.

The generated Android source includes `NativiteBackgroundTasks.kt`, whose
`manifestAssetPath` constant points at the asset path and whose `loadManifest(context)` helper
parses the task list. When background tasks are configured, generated Android projects also
include the QuickJS and WorkManager catalog entries, runtime dependencies,
`NativiteBackgroundTaskRuntime`, and `NativiteBackgroundWorker`. The runtime adapter loads a
task bundle asset, exposes a host API injection seam, invokes the task's default `run(ctx)`
function, and bounds execution with a coroutine timeout. The WorkManager helper schedules
`android.kind: "periodic-work"` and `"one-off-work"` tasks by task id, applies supported
constraints, and maps task return values of `"retry"`/`"failure"` or matching status objects to
WorkManager result states.

Android persists task-scoped `ctx.storage` values in private `SharedPreferences` under the
`dev.nativite.background` namespace with encoded task/key components to avoid collisions. The
native state model is versioned and stores schedule state, run/retry counters, last run time,
last result, and last error metadata.

The generated iOS source includes `NativiteBackgroundTasks.swift`, whose
`loadManifest(bundle:)` helper locates the bundled `nativite-background/manifest.json`
resource and decodes the task list. iOS generation also emits
`BGTaskSchedulerPermittedIdentifiers`, `UIBackgroundModes` fetch support, app startup
registration for `ios.kind: "app-refresh"` tasks, and a JavaScriptCore runtime that loads the
matching task bundle by id outside the WebView lifecycle.

iOS persists task-scoped `ctx.storage` values in `UserDefaults` under the
`dev.nativite.background.storage` namespace with encoded task/key components to avoid collisions.
Pending payloads remain separate from durable task storage. The native state model is versioned
and stores schedule state, run/retry counters, last run time, last result, and last error
metadata.

macOS currently generates the same manifest and bundle resources for metadata parity, but does
not schedule or execute background tasks.

Generation dirty-checking includes the serialized manifest and emitted task bundle contents, so
changing task registrations, platform metadata, task source, or imported task dependencies
invalidates the generated native project hash.

## Semantics and Troubleshooting

Payloads are copied into native scheduler state as JSON. Passing functions, symbols, cyclic
objects, or other non-JSON values fails before the bridge call is sent. Treat payloads as small
trigger metadata, not as durable application data.

`ctx.storage` is task-scoped durable string storage. Use it for cursors, timestamps, and compact
retry metadata. It is not shared with WebView storage and should not store secrets unless the
host app adds its own native protection around the storage backend.

Returning `"success"` or `undefined` records a successful run. Returning `"failure"` records a
terminal failed run. Returning `"retry"` asks the platform worker layer to retry when the platform
supports retry. Object results such as `{ status: "retry", output: { reason: "offline" } }`
persist structured output alongside the latest result.

Cancellation is best-effort. `background.cancel(taskId)` cancels pending platform scheduler work
and removes pending payload metadata where the platform exposes it. If a task is already running,
the host may only be able to stop future invocations or terminate execution at the native runtime
boundary.

Common issues:

- Unsupported task kind: iOS currently accepts `ios.kind: "app-refresh"` only. Android accepts
  `android.kind: "periodic-work"` and `"one-off-work"` only.
- Invalid payload: ensure `background.schedule()` receives JSON-serializable data.
- Missing bundle or manifest: regenerate the native project after changing `backgroundTasks` or
  task source files.
- Task never runs immediately: iOS `BGTaskScheduler` and Android WorkManager are OS-managed and
  may delay work for battery, network, quota, or minimum interval reasons.
- Duplicate bundles: use unique task filenames because native bundle filenames are derived from
  the registered entrypoint basename.
