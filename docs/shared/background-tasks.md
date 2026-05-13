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

Native execution support still needs platform-specific scheduling and runtime invocation.
Generated projects do include compiled JavaScript task bundles so native implementations can
load bundled task entrypoints by id instead of evaluating persisted source strings.

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
application bundle. Bundle filenames are deterministic and derived from the registered task
entrypoint filename, so two tasks with the same basename are rejected to avoid native asset
collisions.

The generated Android source includes `NativiteBackgroundTasks.kt`, whose
`manifestAssetPath` constant points at the asset path and whose `loadManifest(context)` helper
parses the task list.

The generated Apple source includes `NativiteBackgroundTasks.swift`, whose
`loadManifest(bundle:)` helper locates the bundled `nativite-background/manifest.json`
resource and decodes the task list.

Generation dirty-checking includes the serialized manifest and registered task entrypoint source,
so changing task registrations, platform metadata, or task source invalidates the generated
native project hash.
