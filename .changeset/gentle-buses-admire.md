---
"nativite": minor
---

Add platform-specific root HTML entry support to `nativite/vite`.

For native targets, the Vite plugin now resolves `index.<platform>.html`
variants (for example `index.ios.html`, `index.mobile.html`, `index.native.html`)
before falling back to `index.html`.

In native builds, the resolved platform HTML entry is wired as the Rollup
`index` input while preserving the emitted output filename as `index.html`.
In dev, native WebView HTML document requests are rewritten to the same resolved
platform HTML entry when one exists.
