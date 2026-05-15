# System Controls Plugin

`nativite/plugins/system-controls` provides first-party app-level device
controls through the Nativite bridge. It is intended for media, kiosk, reading,
navigation, scanning, POS, training, and operations apps that need small native
capabilities beyond inconsistent WebView APIs.

The plugin is conservative: it exposes app-scoped controls and status queries.
It does not write global device settings.

## Setup

```ts
// nativite.config.ts
import { defineConfig } from "nativite";
import { systemControls } from "nativite/plugins/system-controls";

export default defineConfig({
  plugins: [systemControls],
});
```

The generated iOS and Android projects include the native plugin source and
registrar when `systemControls` is present. No additional permissions are
required for the initial app-scoped API surface.

## API

```ts
import {
  activateKeepAwake,
  deactivateKeepAwake,
  getAppBrightness,
  getOrientation,
  getPowerStatus,
  getSystemControlCapabilities,
  lockOrientation,
  restoreAppBrightness,
  setAppBrightness,
  unlockOrientation,
} from "nativite/plugins/system-controls";

const capabilities = await getSystemControlCapabilities();

await activateKeepAwake({ key: "scanner" });
await deactivateKeepAwake({ key: "scanner" });

const orientation = await getOrientation();
await lockOrientation("landscape");
await unlockOrientation();

const currentBrightness = await getAppBrightness();
await setAppBrightness(0.8);
await restoreAppBrightness();

const power = await getPowerStatus();
```

Keep-awake uses key semantics. The device remains awake while any key is active;
deactivating one key leaves keep-awake active if other keys are still held.

Orientation lock values are `portrait`, `portrait-up`, `portrait-down`,
`landscape`, `landscape-left`, `landscape-right`, and `all`.

Brightness values are numbers from `0` to `1`. `setAppBrightness` stores the
previous app brightness for `restoreAppBrightness`.

`getPowerStatus` returns `lowPowerMode`, `batteryLevel`, and `batteryState`.
Battery level is `null` when a platform cannot report it reliably.

## Platform Behavior

iOS uses `UIApplication.isIdleTimerDisabled`, view-controller supported
orientation masks, `UIScreen.main.brightness`, `ProcessInfo.isLowPowerModeEnabled`,
and `UIDevice` battery monitoring.

Android uses the activity `FLAG_KEEP_SCREEN_ON`, `requestedOrientation`,
per-window `screenBrightness`, `PowerManager.isPowerSaveMode`, and the sticky
`ACTION_BATTERY_CHANGED` broadcast.

macOS is not implemented by this plugin yet. Apps should call
`getSystemControlCapabilities` and degrade gracefully when a capability is
false.

## Errors

Unsupported or invalid operations reject with structured JSON error strings.
Codes include `unsupported`, `permission-denied`, `invalid-orientation-lock`,
`invalid-arguments`, `native-unavailable`, and `operation-failed`.
