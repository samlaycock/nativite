# Background Task Example

This example shows the complete public API flow for defining, registering, and scheduling
Nativite background tasks.

## Files

- `nativite.config.ts` registers the task modules for iOS and Android generation.
- `src/background/periodic-sync.task.ts` demonstrates a periodic sync task with durable
  task-scoped storage.
- `src/background/refresh-session.task.ts` demonstrates a one-off session refresh task
  with payload validation and retry semantics. It is Android-only because iOS does not
  expose one-off background work through Nativite.
- `src/main.ts` schedules and observes task status from WebView app code, including an
  Android platform guard and explicit error handling for rejected bridge calls.

## Try It

From an app using these files, generate native projects with:

```sh
bun run nativite build --platform ios
bun run nativite build --platform android
```

The generated projects include `nativite-background/manifest.json` plus one JavaScript bundle
per registered task. Scheduling is OS-managed, so a successful `background.schedule()` call means
the platform accepted the request, not that the task will run immediately.
