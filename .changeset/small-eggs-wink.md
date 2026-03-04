---
"nativite": patch
---

Enable Safari Web Inspector for SwiftUI-hosted child webviews on Apple platforms.

`NativiteChromeState` now marks `NativiteChildWebView` instances as inspectable in `DEBUG` builds (`iOS 16.4+`, `macOS 13.3+`) so sheet/drawer/popover/app-window webviews appear in Safari Develop tools.
