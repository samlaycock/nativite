---
"nativite": patch
---

Fix iOS splash behavior so a splash overlay remains visible until the first web page load finishes.

- Show a dark-mode-aware default splash overlay on iOS when `config.splash` is not provided.
- Add a centered loading spinner to the default splash overlay.
- Keep the splash overlay visible until `WKWebView` `didFinish` fires.
- Render the configured splash image in the runtime overlay when `config.splash.image` is set.
- Add regression tests for the iOS splash overlay lifecycle.
