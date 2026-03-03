---
"nativite": patch
---

Fix OTA bridge/runtime behavior across generated native targets:

- Android `NativiteBridge` now registers built-in `__nativite__.__ping__` and `__nativite__.__ota_check__` handlers so `ota.check()` no longer fails with "No handler" errors.
- iOS/macOS `NativiteBridge` now wires `__ota_check__` to the OTA updater when updates are configured, returning live `{ available, version? }` status instead of a static placeholder.
- `OTAUpdater` now uses `updates.channel` when resolving manifest/assets (`/<channel>/<platform>/...`) with fallback to the legacy `/<platform>/...` path.
- OTA status now reports staged updates and persists staged version metadata for bridge status responses.
- Added regression tests and updated OTA/bridge docs to match the generated behavior.
