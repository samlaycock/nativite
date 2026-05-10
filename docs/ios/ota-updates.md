# iOS OTA Updates

> Maps to: `src/native/ios/runtime/OTAUpdater.swift`
> Generated file: `OTAUpdater.swift`

The OTA (Over-the-Air) update system allows the web bundle to be updated without going through the App Store review process.

This runtime is shared by the generated iOS and macOS targets. Android does not
currently implement OTA staging or application; its bridge returns
`{ available: false }` for OTA status checks.

## Architecture

The OTA updater manages two bundle locations:

1. **Embedded bundle**: The `dist/` directory shipped with the app binary (always available as fallback).
2. **Active bundle**: A staged OTA bundle that supersedes the embedded one when available.
3. **Rollback bundle**: The previously active OTA bundle, retained until the
   first navigation from a newly applied OTA bundle completes successfully.

## Configuration

OTA is enabled with the top-level `updates` config:

```typescript
export default {
  updates: {
    url: "https://updates.example.com",
    channel: "production",
    signingPublicKey: "<base64-ed25519-public-key>",
  },
};
```

`updates.url` must use HTTPS in production. `allowInsecureHTTP: true` exists for
local development and private test infrastructure only.

If `signingPublicKey` is set, every manifest must include a valid Ed25519
signature. The signature is verified before platform, version, or asset checks
are trusted.

## Server Protocol

The updater checks these manifest locations in order:

1. `<updates.url>/<updates.channel>/<platform>/manifest.json`
2. `<updates.url>/<platform>/manifest.json`

The manifest format is:

```json
{
  "platform": "ios",
  "version": "1.2.3",
  "minimumAppVersion": "1.0.0",
  "hash": "bundle-sha256-or-release-id",
  "builtAt": "2026-05-09T12:00:00.000Z",
  "assets": [
    {
      "path": "index.html",
      "hash": "asset-sha256-hex",
      "size": 12345
    }
  ],
  "signature": "base64-ed25519-signature"
}
```

`minimumAppVersion` is optional. When present, the native app version must be
greater than or equal to it using numeric version comparison.

For signed manifests, sign the canonical payload without the `signature`
property. The canonical payload uses the manifest fields shown above, encodes
`assets[].size` as a JSON integer, omits no required fields, and serializes keys
lexicographically in the same form produced by Swift `JSONEncoder` with
`.sortedKeys`. Assets are then downloaded relative to the manifest directory.

## Update Flow

### Check for Updates

On app launch (after the initial page load), the view controller calls:

```swift
otaUpdater.checkForUpdate()
```

This:

1. Fetches a manifest from the configured update server.
   - Primary path: `<updates.url>/<updates.channel>/<platform>/manifest.json`
   - Fallback path: `<updates.url>/<platform>/manifest.json`
2. Compares the remote version/hash against the currently active bundle.
3. If a newer version is available, downloads the bundle asynchronously.
4. Validates each downloaded asset's byte count and SHA-256 hash against the
   manifest before moving it into the staged bundle.
5. Stages the downloaded bundle separately from the active bundle.

### Apply Pending Updates

On the next app launch, before loading content:

```swift
otaUpdater.applyPendingUpdateIfAvailable()
```

This moves the staged bundle to the active location, so the new content loads on the current session.
Before applying a staged update, the updater first rolls back any previous OTA
bundle that still has a pending launch marker. This handles the case where the
app terminated before a newly applied bundle completed its first navigation.

## Fallback Strategy

If no OTA bundle is available (first install, or OTA disabled), the embedded `dist/index.html` is loaded directly.

When an OTA bundle is applied, the previous active OTA bundle is moved to the
rollback location. The new bundle is marked as pending until `WKWebView`
successfully finishes its first navigation, at which point the marker and
rollback bundle are removed. If the app restarts while the marker is still
present, the updater restores the rollback bundle before loading content.

## Platform Awareness

The OTA updater is platform-aware (iOS vs macOS) and adjusts file paths and storage locations accordingly. Both platforms share the same core update logic.

## Error Handling

Network errors during update checks or downloads are handled gracefully:

- The app continues to use the current bundle.
- Errors are logged but do not interrupt the user experience.
- A failed download does not affect the staged or active bundles.
- A downloaded asset with a mismatched size or hash fails the update before it
  can be staged.
- An unsigned or invalidly signed manifest is rejected when
  `updates.signingPublicKey` is configured.
- HTTP update endpoints are rejected unless `allowInsecureHTTP` is enabled.
- Manifests with a `minimumAppVersion` higher than the native app version are
  ignored.

## Bridge Integration

The bridge exposes a built-in handler for JavaScript to query OTA status:

| Namespace      | Method          | Response                                   |
| -------------- | --------------- | ------------------------------------------ |
| `__nativite__` | `__ota_check__` | `{ available: boolean, version?: string }` |

JavaScript can call this via:

```javascript
const status = await bridge.call("__nativite__", "__ota_check__");
```

The status call returns:

- `{ available: true, version }` when a newer remote bundle is detected.
- `{ available: true, version }` when a bundle is already staged for next launch.
- `{ available: false }` when up to date, unavailable, or on transient network failure.
