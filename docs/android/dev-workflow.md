# Android Development Workflow

> Maps to: `src/platforms/first-party.ts` (Android platform plugin)

The Android platform plugin manages project generation, emulator management, and app deployment during development.

## Dev Mode Flow

When running `nativite dev` for Android:

### 1. Generate Project

Calls `generateAndroidProject(config, cwd, false, "dev")` to create or update the Gradle project in `.nativite/android/`.

### 2. Write Dev URL

Writes the dev server URL to `assets/dev.json`:

```json
{ "devURL": "http://10.0.2.2:5173" }
```

**Important**: `localhost` and `127.0.0.1` are automatically mapped to `10.0.2.2`, which is the Android emulator's special IP for the host machine's loopback address.

### 3. Build Debug APK

Runs `gradle assembleDebug` via the generated `gradlew` wrapper to compile the debug APK.

### 4. Emulator Management

Checks for connected devices or running emulators via `adb devices`:

- If a device/emulator is already connected, uses it directly.
- If no device is found, attempts to boot the default emulator.
- Waits for the device with `adb wait-for-device` (120 second timeout).
- If no emulator is available, logs an error with instructions.

### 5. Install & Launch

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n "{bundleId}/.MainActivity"
```

The `-r` flag replaces any existing installation.

## User-Agent Based Routing

The WebView identifies itself via the User-Agent string:

| Device  | User-Agent Suffix      |
| ------- | ---------------------- |
| Android | `Nativite/android/1.0` |

The Vite dev server middleware reads this to route module requests to the Android-specific Vite environment, enabling `.android.ts` and `.mobile.ts` file resolution.

## Build Mode

When running `nativite build` for Android:

- Generates the project in build mode.
- Writes `manifest.json` with version info and asset list.
- Does not automatically build the APK/AAB (left to the developer).

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
