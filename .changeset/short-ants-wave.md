---
"nativite": patch
---

Fix native asset loading in both dev and build modes:

- native dev middleware now bypasses direct static asset requests (like SVG image URLs) while still transforming module-style asset imports (`?import`, `?url`) and Vite HTML proxy module requests.
- native dev middleware now treats explicit Vite module-query requests as authoritative even when WKWebView sends ambiguous `Sec-Fetch-Dest` / `Accept` headers.
- native production builds now default to `base: "./"` (unless the user already set `base`) so `file://` WKWebView bundles resolve generated asset URLs correctly.
- in DEBUG builds, the generated native ViewController now persists the resolved dev server URL in `UserDefaults`, so simulator app relaunches keep targeting the last known dev server even when launch-time env vars are absent.
- in DEBUG builds, generated iOS/macOS WebViews now set `isInspectable = true` on supported OS versions so Safari Develop debugging works without manual native code edits.
