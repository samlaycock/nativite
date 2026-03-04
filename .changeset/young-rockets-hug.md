---
"nativite": patch
---

Re-add the `nativite build` CLI command for production builds.

- Added a production build command flow that loads configured runtimes, sets Nativite platform environment variables, and runs Vite in production mode.
- `nativite build` now builds all configured platforms by default.
- Added optional `--platform <platform>` targeting for single-platform builds.
- Added unit tests for build command behavior and failure cases.
- Updated docs to describe production build behavior and platform-specific output directories.
- Tightened production vs dev native runtime behavior:
  - Apple copy phase now includes `dev.json` only for non-Release builds.
  - Android webview now gates dev URL resolution and WebView debugging by `BuildConfig.DEBUG`.
  - Android project generation now removes stale `assets/dev.json` outside dev mode.
