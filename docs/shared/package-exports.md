# Package Exports

Nativite publishes dual JavaScript entrypoints for its public API. Every export
condition listed in `package.json` should resolve from a built package:

- `nativite`
- `nativite/vite`
- `nativite/client`
- `nativite/utils`
- `nativite/cli`
- `nativite/chrome`
- `nativite/css`

The `import` condition points at `.mjs` files in `dist`; the `require` condition
points at CommonJS `.js` files in `dist`. The `nativite/globals` subpath is
types-only and intentionally has no JavaScript runtime condition.

The package export smoke test builds `dist`, installs the repository into a
temporary `node_modules/nativite` directory, then verifies every advertised
JavaScript subpath with both `import()` and `require()`. This catches bundling
cycles and entrypoint side effects before publish.

The CLI entrypoint is importable because it is listed in package exports, but it
only parses `process.argv` when invoked directly as the `nativite` executable.
