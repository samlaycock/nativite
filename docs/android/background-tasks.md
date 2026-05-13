# Android Background Tasks

> Maps to: `src/native/android/runtime/NativiteBackgroundTasks.kt`

Android background task execution uses QuickJS through
`io.github.dokar3:quickjs-kt-android`.

## Runtime Decision

Nativite selects QuickJS for the initial Android background task runtime.
Android does not ship JavaScriptCore, and bundling V8 through Javet adds a
large native dependency for a feature that needs short-lived task entrypoint
execution rather than browser-equivalent JavaScript performance.

QuickJS was chosen because:

- The `quickjs-kt-android` artifact is published on Maven Central and provides
  Kotlin suspend APIs, async support, and ES module support.
- It has a smaller app-size profile than V8/Javet and is suitable for
  short-lived WorkManager-style execution.
- Host API injection can be kept explicit and narrow instead of exposing
  WebView globals to background tasks.

Rejected alternatives:

- Javet/V8 has stronger raw execution performance but currently carries a much
  larger Android artifact size and a broader native maintenance surface.
- Older Android QuickJS wrappers were rejected because they are Java-first,
  JitPack-based, or less actively maintained.
- WebView execution was rejected because background tasks must run outside the
  WebView lifecycle.

## Generated Dependency

Generated Android projects include `libs.quickjs.kt.android` only when
`backgroundTasks` are configured. Apps without background tasks keep the same
Gradle dependency set as before.

Nativite pins `quickjs-kt-android` to `1.0.5`. The generated Android project
uses AGP 8.13.2, Kotlin 2.3.20, and SDK 36 so the QuickJS AAR metadata is
satisfied and new apps stay aligned with current Play Store target SDK
expectations.

## Runtime Adapter

`NativiteBackgroundTasks.loadManifest(context)` reads
`assets/nativite-background/manifest.json` and returns task metadata.

`NativiteBackgroundTaskRuntime` can:

- Find a task by id.
- Load its JavaScript bundle from `assets/nativite-background/<task>.js`.
- Prepare the generated default export for invocation.
- Invoke `default.run(ctx)` in QuickJS.
- Bound execution with a cancellation timeout using Kotlin coroutines.

The default execution timeout is 30 seconds. Later WorkManager integration can
construct the runtime with a different timeout if Android scheduling constraints
require it.

## Host API Seam

`NativiteBackgroundTaskHostApi` provides the placeholder injection seam for
native APIs. Its `preludeScript(task)` hook can install global JavaScript
helpers before task evaluation, and `contextScript(task, payload)` returns the
JavaScript object passed to `run(ctx)`.

The default context currently contains task metadata, optional payload, and
no-op logging methods. Persistent storage, fetch, retry state, and platform
signals are intentionally left for later scheduling/runtime issues.
