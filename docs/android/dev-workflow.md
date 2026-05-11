# Android Development Workflow

> Maps to: `src/platforms/first-party.ts` (Android platform plugin)

The Android platform plugin generates a Gradle project that developers run with
normal Android Studio emulator, device, signing, and packaging workflows.

## Toolchain Ownership

Nativite does not install, download, vendor, or bootstrap Android toolchain
dependencies. Before generating or building Android projects, the developer or
CI image must provide:

- Android Studio or equivalent Android SDK tooling
- A configured Android SDK and emulator or device
- A JDK compatible with the generated Android Gradle project
- A `gradle` command on `PATH` for bootstrapping the generated Gradle wrapper

Android Studio and Gradle own native dependency resolution, emulator/device
selection, signing, APK/AAB generation, and Play Store packaging. Nativite's
responsibility is to generate the project structure and web bundle handoff files.

## Primary Flow

When running `nativite build` for Android:

### 1. Build the web bundle

The CLI runs a production Vite build with `NATIVITE_PLATFORM=android`.
The Vite plugin writes the Android web bundle to `dist-android/` and emits
`dist-android/manifest.json`.

### 2. Generate the Gradle project

The Android platform build hook calls `generateAndroidProject(config, cwd, false, "build")`
to create or update the Gradle project in `.nativite/android/`.

Project generation invokes `gradle wrapper --gradle-version 8.11.1 --no-daemon`
inside `.nativite/android/`. This is intentional: Nativite relies on an
already-configured Gradle installation instead of managing executable Gradle
artifacts itself. If `gradle` is unavailable, install/configure Gradle and rerun
the Nativite build command.

Build and generate modes remove any stale debug `assets/dev.json` so release
runtime code does not read a dev server URL.

The generated Gradle release asset pipeline copies `dist-android/` into
`app/build/generated/nativite/assets/dist/` before `mergeReleaseAssets`.
Release builds fail with a clear message if the web bundle is missing, so run
`bunx nativite build --platform android` before producing an APK or AAB from
Android Studio.

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
URL, then mirrors it into `.nativite/android/app/src/main/assets/dev.json` for
debug packaging. When the app has not set `server.host`, the plugin asks Vite
to bind to all interfaces so physical devices can use the LAN URL. Explicit
`server.host` settings are preserved.

The metadata includes the selected URL, all local and network URLs reported by
Vite, and native-specific connection hints:

```json
{
  "devURL": "http://192.168.1.2:5173/",
  "urls": {
    "local": ["http://localhost:5173/"],
    "network": ["http://192.168.1.2:5173/"]
  },
  "native": {
    "androidEmulatorURL": "http://10.0.2.2:5173/",
    "androidDeviceURL": "http://192.168.1.2:5173/",
    "androidUsbReverseCommand": "adb reverse tcp:5173 tcp:5173"
  }
}
```

`10.0.2.2` is the Android emulator's special IP for the host machine's loopback
address. The Android debug asset copy uses the emulator URL for `devURL` and
also records `android.deviceURL` plus the optional `adb reverse` command for USB
device workflows. If Vite reports no network URL, Nativite warns that physical
devices usually need `server.host` set to `0.0.0.0` or `true`.

Generated non-dev and build flows remove the Android asset copy so release
builds do not package stale dev server metadata.

Open and run the generated debug project in Android Studio. Nativite does not
own emulator orchestration from the CLI.

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
