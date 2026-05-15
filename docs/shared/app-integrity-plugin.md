# App Integrity Plugin

`nativite/plugins/app-integrity` exposes native app and device attestation primitives through the Nativite bridge.

```ts
import {
  appIntegrity,
  attestAppAttestKey,
  generateAppAttestAssertion,
  generateAppAttestKey,
  isAppAttestAvailable,
  isPlayIntegrityAvailable,
  preparePlayIntegrityProvider,
  requestPlayIntegrityToken,
} from "nativite/plugins/app-integrity";

export default {
  plugins: [appIntegrity],
};
```

Attestation is not a client-side security boundary by itself. Your backend must generate challenges or request hashes, verify Apple App Attest attestation/assertion objects or Google Play Integrity tokens server-side, enforce freshness, bind results to the authenticated user/action, and reject replayed values.

## iOS App Attest

The iOS bridge uses Apple's `DeviceCheck` `DCAppAttestService`.

- `isAppAttestAvailable()` returns whether App Attest is supported on the current device.
- `generateAppAttestKey()` creates an App Attest key and returns its `keyId`.
- `attestAppAttestKey({ keyId, challengeBase64 })` returns an `attestationObjectBase64` value for backend verification.
- `generateAppAttestAssertion({ keyId, clientDataHashBase64 })` returns an `assertionObjectBase64` value for backend verification.

Apps are responsible for persisting the `keyId`, for example with a secure storage plugin. Simulators and unsupported devices return a structured `unsupported-device` availability error.

## Android Play Integrity

The Android bridge uses Google's Play Integrity library.

- `isPlayIntegrityAvailable()` verifies that an Android application context is available.
- `preparePlayIntegrityProvider({ cloudProjectNumber })` prepares the Standard API token provider and caches it for later token requests.
- `requestPlayIntegrityToken({ requestHash, cloudProjectNumber })` requests a token. If a Standard provider was prepared, `requestHash` is sent through the Standard API. Otherwise the plugin falls back to a classic nonce token request.

Android apps must enable Play Integrity for the package in Play Console and use a valid Google Cloud project number for Standard API preparation. Devices without Google Play services, non-Play distributions, server outages, and quota/rate limits can fail with structured errors.

## Error Codes

The JS contract documents these error codes:

- `unsupported-device`
- `invalid-provider`
- `invalid-arguments`
- `quota-exceeded`
- `rate-limited`
- `server-unavailable`
- `configuration-missing`
- `native-failure`

Treat all client responses as untrusted until the backend has verified the attestation object, assertion, or Play Integrity token.
