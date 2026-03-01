---
"nativite": minor
---

Add `tabBottomAccessory()` factory function for iOS 26 `tabViewBottomAccessory` support.

## Added

- `tabBottomAccessory(config)` factory function to declare a persistent child webview between tab content and the tab bar.
- `TabBottomAccessoryConfig` type extending `ChildWebviewBase` with `url`, `presented`, and `backgroundColor` properties.
- `tabBottomAccessory.presented`, `tabBottomAccessory.dismissed`, and `tabBottomAccessory.loadFailed` chrome events.
- Native iOS template: `NativiteTabBottomAccessoryController` child webview positioned above the tab bar, with URL loading, SPA routing, and messaging support.
