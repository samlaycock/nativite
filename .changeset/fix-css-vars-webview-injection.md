---
"nativite": patch
---

Fix CSS custom properties not being set in iOS/macOS WKWebView.

The `buildInitScript()` function in `NativiteVars.swift` was embedding Swift multi-line string literals (`defaults` and `devOverlayInsets`) directly into a single-quoted JavaScript string. Multi-line strings contain literal newlines, which are invalid inside a JS single-quoted string literal, causing a silent syntax error in `WKUserScript`. This prevented the `<style>` element from being created and `window.__nk_patch` from being defined, so no `--nk-*` CSS variables were ever given a value in the WebView.

The fix collapses both strings to a single line (stripping newlines and surrounding whitespace) before embedding them in the JS, so the generated script is always syntactically valid.
