---
"nativite": patch
---

Fix external link handling in generated native WebViews:

- iOS and macOS ViewController templates now intercept link-activated and new-window (`target="_blank"`) navigations in `WKWebView`.
- HTTP(S) links that leave the current in-app origin now open in the device default browser instead of silently doing nothing.
