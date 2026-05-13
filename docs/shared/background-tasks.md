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

The runner receives a constrained context containing task metadata, storage, `fetch`, logging,
and an optional cancellation signal. It should not depend on WebView globals.

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

Payloads must be JSON-serializable values. Nativite serializes the payload before it crosses
the native bridge, so native platforms receive the same JSON string regardless of WebView
transport quirks. Unsupported task ids and platform/task-kind combinations reject with native
bridge errors.

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

The generated iOS source includes `NativiteBackgroundTasks.swift`, whose
`loadManifest(bundle:)` helper locates the bundled `nativite-background/manifest.json`
resource and decodes the task list. iOS generation also emits
`BGTaskSchedulerPermittedIdentifiers`, `UIBackgroundModes` fetch support, app startup
registration for `ios.kind: "app-refresh"` tasks, and a JavaScriptCore runtime that loads the
matching task bundle by id outside the WebView lifecycle.

macOS currently generates the same manifest and bundle resources for metadata parity, but does
not schedule or execute background tasks.

Generation dirty-checking includes the serialized manifest and emitted task bundle contents, so
changing task registrations, platform metadata, task source, or imported task dependencies
invalidates the generated native project hash.
