---
"nativite": major
---

Simplify the public API surface by removing redundant and internal exports.

### Removed from `nativite/chrome`

- `button(...)`
- `navItem(...)`
- `menuItem(...)`
- `_handleIncoming(...)`
- `_resetChromeState()`
- `_drainFlush()`

Use plain object literals for chrome items instead of constructor wrappers.

### Removed from `nativite/vite`

- `defineConfig` re-export
- `platformExtensionsPlugin` export

Only `nativite()` and supporting types are now exported from `nativite/vite`.

### Removed from `nativite`

The following internal wire/build types are no longer exported:

- `BridgeCallMessage`
- `BridgeEventMessage`
- `JsToNativeMessage`
- `NativeToJsMessage`
- `DevJson`
- `BuildManifest`

### Documentation alignment

- CLI docs now reflect the currently supported command surface.
- Chrome docs now use plain object literals instead of removed constructor helpers.
