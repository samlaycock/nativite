---
"nativite": minor
---

Add new Vite-injected compile-time platform family globals driven by platform
plugin traits:

- `__IS_NATIVE__`
- `__IS_MOBILE__`
- `__IS_DESKTOP__`

Extend `definePlatformPlugin()` with optional trait flags:

- `native`
- `mobile`
- `desktop`

The platform registry now serializes these traits into
`NATIVITE_PLATFORM_METADATA`, and the Vite plugin consumes that metadata so
`__IS_NATIVE__`, `__IS_MOBILE__`, and `__IS_DESKTOP__` are driven by platform
plugin declarations in normal CLI-driven builds/dev.

Trait defaults when omitted are:

- `native: true`
- `mobile: false`
- `desktop: false`
