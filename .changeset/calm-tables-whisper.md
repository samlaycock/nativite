---
"nativite": patch
---

Improve native development error-overlay behavior.

- Add `ios({ errorOverlay: boolean })` config support for toggling Vite runtime error overlays in native dev WebViews.
- In `nativite dev`, the selected platform's `dev.errorOverlay` setting now controls `server.hmr.overlay` (default remains disabled).
- Keep Vite overlay controls inside native top/bottom insets so dismiss/action controls remain reachable when the overlay is enabled.
- Add regression tests for config normalization, dev-server overlay toggling, and native overlay inset styling.
