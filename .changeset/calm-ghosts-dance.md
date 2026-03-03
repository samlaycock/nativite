---
"nativite": patch
---

Rename legacy `nk`-prefixed identifiers to `nv` equivalents across native templates, runtime helpers, tests, and documentation.

This includes:

- CSS custom properties (`--nv-*`)
- JS bridge helpers (`window.__nv_patch`, `__nv_vars__`)
- Platform data attributes (`data-nv-platform`)
- CSS variable helper exports (`NVVars`, `NVVarName`)

This removes a legacy package-name prefix so generated variables are now aligned with the current naming convention.
