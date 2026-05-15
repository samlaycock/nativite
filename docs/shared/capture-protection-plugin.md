# Capture Protection Plugin

`nativite/plugins/capture-protection` provides first-party native capture
prevention and capture detection through the Nativite bridge. It is intended for
apps that display sensitive information, paid content, private documents,
compliance-sensitive data, or internal operational screens.

This is not DRM. It cannot stop external cameras, compromised devices,
jailbroken/rooted devices, or platform-level bypasses.

## Setup

```ts
// nativite.config.ts
import { defineConfig } from "nativite";
import { captureProtection } from "nativite/plugins/capture-protection";

export default defineConfig({
  plugins: [captureProtection],
});
```

The generated iOS and Android projects include the native plugin source and
registrar when `captureProtection` is present. No additional Android permissions
or iOS Info.plist keys are required for the initial API surface.

## API

```ts
import {
  allowCapture,
  getCaptureProtectionCapabilities,
  getCaptureProtectionState,
  onCaptureStatusChange,
  onScreenshot,
  preventCapture,
} from "nativite/plugins/capture-protection";

const capabilities = await getCaptureProtectionCapabilities();

await preventCapture({ key: "invoice" });
await allowCapture({ key: "invoice" });

const state = await getCaptureProtectionState();

const unsubscribeScreenshot = onScreenshot((event) => {
  console.log("Screenshot detected on", event.platform);
});

const unsubscribeStatus = onCaptureStatusChange((event) => {
  console.log("Capture active:", event.captured);
});
```

Capture prevention uses key semantics. Capture remains prevented while any key
is active; allowing one key leaves prevention active if other keys are still
held. Omitting a key uses `"default"`.

`getCaptureProtectionState` returns the platform, whether prevention is active,
the active keys, and `captured` when the platform exposes current capture
status. `captured` is `null` when that status is not available.

## Platform Behavior

Android uses the activity window `FLAG_SECURE`. While active, Android prevents
screenshots and screen recording for that activity window. Android does not
provide a reliable app-level screenshot callback for protected windows, so
`screenshotDetection` and `captureStatus` are reported as `false`.

iOS exposes screenshot notifications after a screenshot has already happened
and exposes screen capture status for screen recording, AirPlay, and similar
capture sessions through `UIScreen.isCaptured`. iOS does not expose a public API
for reliable screenshot prevention, so `preventCapture` rejects with
`unsupported` on iOS. Use `onScreenshot` and `onCaptureStatusChange` to redact,
hide, or invalidate sensitive content in response to capture activity.

macOS is not implemented by this plugin yet. Apps should call
`getCaptureProtectionCapabilities` and degrade gracefully when a capability is
false.

## Errors

Unsupported or invalid operations reject with structured JSON error strings.
Codes include `unsupported`, `permission-denied`, `invalid-arguments`,
`native-unavailable`, and `operation-failed`.
