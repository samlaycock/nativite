---
"nativite": minor
---

Expand `chrome.sheet` into a functional sheet-webview surface on iOS.

## Added

- `chrome.sheet.setURL(url)` to load URL content inside the sheet webview.
  - Relative URLs are resolved against the current main webview URL.
- `chrome.sheet.postMessage(message)` to send messages from the main webview context to the sheet webview.
- `chrome.sheet.onMessage(handler)` and new `sheet.message` event payloads to receive messages from the sheet webview.
- `chrome.sheet.onLoadFailed(handler)` and `sheet.loadFailed` event payloads for native load diagnostics.
- `window.nativiteSheet` ambient typing for sheet-webview JavaScript messaging.

## Changed

- `small` detent is now supported in iOS native detent mapping for `setDetents` and `setSelectedDetent`.
- iOS sheet implementation now mounts a dedicated `NativiteWebView` (with bridge parity) rather than a blank controller, while keeping existing detent + dismiss events.
- Root-prefixed sheet URLs (for example `"/sheet"`) now bootstrap as SPA routes in bundled `file://` mode by loading `dist/index.html` and applying the route via the History API.
- Dev-server native request routing now preserves HTML document navigations for sheet routes so `"/sheet"` is served as HTML instead of being misclassified as a module transform.
- `__chrome__` bridge mutations are now accepted only from the primary app webview, so using `chrome.*` inside the sheet webview can no longer mutate parent app chrome state.
- Primary and sheet webviews now use transparent backgrounds over `systemBackground`, so pre-render blank/loading states follow light/dark mode instead of flashing white in dark mode.
- Sheet-hosted `NativiteWebView` instances now opt out of root scroll locking and keep scroll interaction enabled, and sheet scrolling no longer always expands detents from content drags. This restores reliable tap/scroll interactivity inside sheet web content.
- Sheet webview scrolling now disables rubber-band bounce (`bounces = false`) to prevent content moving beyond viewport bounds.
- `chrome.sheet.postMessage(...)` now routes to `window.nativiteSheet.postMessage(...)` when called from inside the sheet context, so sheet-to-host messaging works with either API style.

## Notes

- macOS continues to ignore `sheet` chrome keys in this phase.
