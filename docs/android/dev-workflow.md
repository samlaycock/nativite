# Android Development Workflow

> Maps to: `src/platforms/first-party.ts` (Android platform plugin)

The Android platform plugin generates a Gradle project that developers run with
normal Android Studio emulator, device, signing, and packaging workflows.

## Primary Flow

When running `nativite build` for Android:

### 1. Build the web bundle

The CLI runs a production Vite build with `NATIVITE_PLATFORM=android`.
The Vite plugin writes the Android web bundle to `dist-android/` and emits
`dist-android/manifest.json`.

### 2. Generate the Gradle project

The Android platform build hook calls `generateAndroidProject(config, cwd, false, "build")`
to create or update the Gradle project in `.nativite/android/`.

Build and generate modes remove any stale debug `assets/dev.json` so release
runtime code does not read a dev server URL.

### 3. Open and run in Android Studio

Open the generated project and use Android Studio for emulator/device selection,
debugging, signing, APK/AAB generation, and Play Store packaging:

```bash
open .nativite/android
```

Release builds package the embedded web bundle from `dist-android/`.

## Debug Builds With Vite Dev

Run your normal Vite dev server when you want the generated debug app to load web
code from Vite:

```bash
bunx vite dev
```

The Nativite Vite plugin writes `.nativite/dev.json` with the resolved dev server
URL. Android debug builds convert host loopback URLs to the emulator host alias:

```json
{ "devURL": "http://10.0.2.2:5173" }
```

`10.0.2.2` is the Android emulator's special IP for the host machine's loopback
address.

The older `nativite dev` command can still generate, build, install, and launch
an emulator app from the terminal, but it is not the default setup path. Prefer
Android Studio unless you specifically want terminal-owned emulator orchestration.

## User-Agent Based Routing

The WebView identifies itself via the User-Agent string:

| Device  | User-Agent Suffix      |
| ------- | ---------------------- |
| Android | `Nativite/android/1.0` |

The Vite dev server middleware reads this to route module requests to the Android-specific Vite environment, enabling `.android.ts` and `.mobile.ts` file resolution.

## Single-Platform Build

To build only Android:

```bash
bunx nativite build --platform android
```

## Platform File Extensions

Android-specific file resolution order:

1. `.android` (Android only)
2. `.mobile` (shared with iOS)
3. `.native` (shared across all native platforms)
4. Fallback (bare extension)

Example:

```
import './Button'
→ tries Button.android.tsx
→ tries Button.mobile.tsx
→ tries Button.native.tsx
→ falls back to Button.tsx
```
