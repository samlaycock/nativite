# iOS OTA Updates

> Maps to: `src/ios/templates/ota-updater.ts`
> Generated file: `OTAUpdater.swift`

The OTA (Over-the-Air) update system allows the web bundle to be updated without going through the App Store review process.

## Architecture

The OTA updater manages two bundle locations:

1. **Embedded bundle**: The `dist/` directory shipped with the app binary (always available as fallback).
2. **Active bundle**: A staged OTA bundle that supersedes the embedded one when available.

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
4. Stages the downloaded bundle separately from the active bundle.

### Apply Pending Updates

On the next app launch, before loading content:

```swift
otaUpdater.applyPendingUpdateIfAvailable()
```

This moves the staged bundle to the active location, so the new content loads on the current session.

## Fallback Strategy

If no OTA bundle is available (first install, or OTA disabled), the embedded `dist/index.html` is loaded directly.

## Platform Awareness

The OTA updater is platform-aware (iOS vs macOS) and adjusts file paths and storage locations accordingly. Both platforms share the same core update logic.

## Error Handling

Network errors during update checks or downloads are handled gracefully:

- The app continues to use the current bundle.
- Errors are logged but do not interrupt the user experience.
- A failed download does not affect the staged or active bundles.

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
