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

Native execution support still needs platform-specific bundling and runtime integration.
The public API is designed so those implementations can load bundled task entrypoints by id
instead of evaluating persisted source strings.
