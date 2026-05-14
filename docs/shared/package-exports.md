# Package Exports

Nativite treats `package.json#exports` as the complete public package boundary.
Deep imports outside the listed exports are unsupported implementation details.

## Public Entrypoints

- `nativite`
- `nativite/vite`
- `nativite/client`
- `nativite/utils`
- `nativite/chrome`
- `nativite/css`
- `nativite/background`
- `nativite/plugins/contacts`
- `nativite/globals`

`nativite` is the public configuration and extension-authoring entrypoint.
`nativite/vite` exposes the Vite plugin. `nativite/client` exposes the
low-level JS/native bridge. `nativite/chrome` exposes the declarative native
chrome API. `nativite/css` exposes CSS variable helpers. `nativite/utils`
exposes compile-time platform helpers. `nativite/background` exposes background
task definitions and WebView runtime scheduling controls.
`nativite/plugins/contacts` exposes the first-party contacts plugin and typed
client helpers. `nativite/globals` is types-only and has no JavaScript runtime
condition.

ESM is the primary package contract. JavaScript public entrypoints use the
`import` condition and point at `.mjs` files in `dist`. CommonJS `require`
conditions are not advertised unless a future subpath is covered by a
built-package CommonJS smoke test.

The package export smoke test builds `dist`, installs the repository into a
temporary `node_modules/nativite` directory, then verifies every advertised
JavaScript subpath with `import()`. This catches bundling cycles and import side
effects before publish.

## Private Surface

Native generators, runtime source files, platform registry internals, and test
helpers are not public API unless intentionally exported from `package.json`.

The CLI is exposed as the `nativite` binary from `package.json#bin`.
`nativite/cli` is not a public runtime import.
