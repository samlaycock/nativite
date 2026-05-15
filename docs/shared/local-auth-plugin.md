# Local Auth Plugin

`nativite/plugins/local-auth` provides first-party local user-presence
authentication through native platform prompts. It is intended for gating local
actions such as protected settings, cached sensitive data, or reauthentication
inside an already signed-in app.

Local auth does not prove remote identity and is not a passkey/WebAuthn API.

## Setup

```ts
// nativite.config.ts
import { defineConfig } from "nativite";
import { localAuth } from "nativite/plugins/local-auth";

export default defineConfig({
  plugins: [
    localAuth({
      faceIDUsageDescription: "Use Face ID to verify protected app actions.",
    }),
  ],
});
```

The iOS generator writes `NSFaceIDUsageDescription` when the plugin is present.
If no description is supplied, Nativite uses a generic local user-presence
message. The Android generator writes `android.permission.USE_BIOMETRIC`.

## API

```ts
import {
  authenticateLocalUser,
  cancelLocalAuth,
  getLocalAuthSupportedTypes,
  isLocalAuthAvailable,
  isLocalAuthEnrolled,
} from "nativite/plugins/local-auth";

const availability = await isLocalAuthAvailable();
const enrollment = await isLocalAuthEnrolled();
const supported = await getLocalAuthSupportedTypes();

const result = await authenticateLocalUser({
  reason: "Verify before changing payment settings.",
  cancelTitle: "Not now",
  fallbackTitle: "Use passcode",
});

if (result.success) {
  // Continue with the protected local action.
}

await cancelLocalAuth();
```

Expected user outcomes are returned as structured results instead of thrown
errors. `authenticateLocalUser` returns `status`, `success`, `platform`, and an
optional `error`. Status values are `success`, `cancelled`, `fallback`,
`failed`, `lockout`, `not-enrolled`, and `unavailable`.

Availability uses `available`, `platform`, and optional `reason`. Reason values
include `unsupported`, `not-enrolled`, `passcode-not-set`, and
`hardware-unavailable`.

Supported auth types are reported as `fingerprint`, `face`, `iris`,
`device-credential`, or `unknown` where the platform can determine them.

## Platform Behavior

iOS uses `LocalAuthentication.LAContext`. `disableDeviceFallback` switches the
policy from device-owner authentication to biometrics-only authentication.
Cancellation invalidates the active `LAContext`.

Android uses the platform `android.hardware.biometrics.BiometricPrompt`.
Authentication requires Android 9 or newer. Device credentials are enabled on
Android 11 or newer when `disableDeviceFallback` is not set. Android cannot
reliably distinguish the exact enrolled biometric class across devices, so it
reports biometric type strings only when biometric authentication is enrolled,
and reports `device-credential` separately when device credentials are
available.

Unsupported platforms and missing runtime context return structured
`unavailable` results.
