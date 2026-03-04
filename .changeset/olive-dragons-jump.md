---
"nativite": patch
---

Wire iOS `errorOverlay` config into Vite dev overlay defaults and validate Android `targetSdk` values.

- `nativite/vite`: when `NATIVITE_DEV_ERROR_OVERLAY` is not set, the plugin now reads `ios({ errorOverlay })` from `nativite.config.ts` to decide the default Vite HMR overlay setting.
- `NATIVITE_DEV_ERROR_OVERLAY` remains the highest-precedence override for forcing overlay on/off.
- Config schema now requires `android.targetSdk` (when provided) to be an integer.
- Added regression tests for both behaviors and updated docs.
