# Secure Store Plugin

`nativite/plugins/secure-store` provides first-party secure string storage for
credentials, refresh tokens, encryption keys, and other small secrets. It is not
a replacement for `localStorage`, IndexedDB, files, or database-backed ordinary
application data.

## Setup

```ts
// nativite.config.ts
import { defineConfig } from "nativite";
import { secureStore } from "nativite/plugins/secure-store";

export default defineConfig({
  plugins: [secureStore],
});
```

## API

```ts
import {
  deleteSecureItem,
  getSecureItem,
  isSecureStoreAvailable,
  setSecureItem,
} from "nativite/plugins/secure-store";

const availability = await isSecureStoreAvailable();
await setSecureItem("refresh-token", token, { service: "auth" });
const token = await getSecureItem("refresh-token", { service: "auth" });
await deleteSecureItem("refresh-token", { service: "auth" });
```

All stored values are UTF-8 strings and are limited to 4096 bytes. Larger values
fail with a structured `value-too-large` error.

Options:

- `service` namespaces keys so independent features can avoid collisions.
- `accessControl: "user-presence"` stores an Apple item that requires device
  owner authentication before reads.
- `accessControl: "biometry-current-set"` stores an Apple item that is
  invalidated when the enrolled biometric set changes.
- `authenticationPrompt` customizes the Apple Keychain prompt used for
  authentication-gated reads.

Structured errors are serialized through the bridge with `code`, `message`,
`platform`, and `operation`. Codes include `unavailable`,
`authentication-failed`, `invalidated`, `invalid-arguments`, `value-too-large`,
`native-unavailable`, and `operation-failed`.

## Platform Behavior

Apple platforms store values in Keychain generic-password items. Default items
use `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, so they survive app
updates but do not migrate to another device through backups. User-presence and
biometry-gated items use `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.

Android stores values in `EncryptedSharedPreferences` using an Android Keystore
backed `MasterKey`. Values survive app updates, are removed when the app is
uninstalled, and are not intended for cross-device migration. Per-item biometric
gating is reported as unsupported on Android for this first version.

No platform promises protection on compromised, rooted, or jailbroken devices.
Do not store large blobs or files in secure store.
