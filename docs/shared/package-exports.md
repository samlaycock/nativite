# Package Exports

Nativite 1.0 treats `package.json#exports` as the complete public package
boundary. Deep imports outside the listed exports are unsupported implementation
details.

## Public Entrypoints

- `nativite`
- `nativite/vite`
- `nativite/client`
- `nativite/utils`
- `nativite/chrome`
- `nativite/css`
- `nativite/background`
- `nativite/test`
- `nativite/vitest-browser-provider`
- `nativite/plugins/contacts`
- `nativite/plugins/calendar`
- `nativite/plugins/notifications`
- `nativite/plugins/secure-store`
- `nativite/plugins/local-auth`
- `nativite/plugins/system-controls`
- `nativite/plugins/haptics`
- `nativite/plugins/app-integrity`
- `nativite/plugins/capture-protection`
- `nativite/globals`

`nativite` is the public configuration and extension-authoring entrypoint.
`nativite/vite` exposes the Vite plugin. `nativite/client` exposes the
low-level JS/native bridge. `nativite/chrome` exposes the declarative native
chrome API. `nativite/css` exposes CSS variable helpers. `nativite/utils`
exposes compile-time platform helpers. `nativite/background` exposes background
task definitions and WebView runtime scheduling controls.
`nativite/test` exposes test-only JavaScript helpers for local stub-host app
tests and explicitly named coordinator-backed native harness commands.
`nativite/vitest-browser-provider` exposes the Vitest Browser Mode provider
factory used by `nativite test` and direct Vitest Browser Mode configuration for
real native harness tests.
`nativite/plugins/contacts`, `nativite/plugins/calendar`,
`nativite/plugins/notifications`, `nativite/plugins/secure-store`,
`nativite/plugins/local-auth`, `nativite/plugins/system-controls`,
`nativite/plugins/haptics`, `nativite/plugins/app-integrity`, and
`nativite/plugins/capture-protection`
expose first-party native capability plugins and typed client helpers.
`nativite/globals` is types-only and has no JavaScript runtime condition.

ESM is the primary package contract. JavaScript public entrypoints use the
`import` condition and point at `.mjs` files in `dist`. CommonJS `require`
conditions are not advertised unless a future subpath is covered by a
built-package CommonJS smoke test.

The package export smoke test builds `dist`, installs the repository into a
temporary `node_modules/nativite` directory, then verifies every advertised
JavaScript subpath with `import()`. This catches bundling cycles and import side
effects before publish.

## Private Surface

Native generators, runtime source files, platform registry internals, and
unlisted test helpers are not public API unless intentionally exported from
`package.json`. The documented exports above are the supported 1.0 package
surface.

The CLI is exposed as the `nativite` binary from `package.json#bin`.
`nativite/cli` is not a public runtime import.
