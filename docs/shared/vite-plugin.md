# Vite Plugin

> Maps to: `src/vite/index.ts`, `src/vite/platform-extensions-plugin.ts`, `src/vite/request-routing.ts`

The Vite plugin integrates nativite into the Vite build pipeline, providing platform-specific module resolution, dev server routing, and build output generation.

## Plugin Composition

`nativite()` returns an array of three sub-plugins:

1. **`nativite:platform-extensions`** — Resolves platform-specific file variants at import time.
2. **`nativite`** (core) — Dev server middleware, HMR bridging, build output.
3. **`nativite:dev-error-overlay`** — Dev-only error overlay positioning for native chrome.

## Platform Extensions Plugin

### File Resolution

When an import like `import './Button'` is encountered, the plugin tries platform-specific variants before falling back:

| Platform | Resolution Order                                    |
| -------- | --------------------------------------------------- |
| iOS      | `.ios` → `.mobile` → `.native` → fallback           |
| iPad     | `.ipad` → `.ios` → `.mobile` → `.native` → fallback |
| Android  | `.android` → `.mobile` → `.native` → fallback       |
| macOS    | `.macos` → `.desktop` → `.native` → fallback        |
| Web      | `.web` → fallback                                   |

### Resolution Examples

For `import './Button'` on iOS:

```
→ Button.ios.tsx ✓ (found, use this)
→ Button.ios.ts
→ Button.mobile.tsx
→ Button.mobile.ts
→ Button.native.tsx
→ Button.native.ts
→ Button.tsx (fallback)
```

For explicit extensions like `import './Button.tsx'` on iOS:

```
→ Button.ios.tsx ✓
→ Button.mobile.tsx
→ Button.native.tsx
→ Button.tsx (fallback)
```

### Directory Index Resolution

For `import './components'` (directory import):

```
→ components/index.ios.tsx
→ components/index.mobile.tsx
→ components/index.native.tsx
→ components/index.tsx (fallback)
```

### Native HTML Entry Resolution

For native targets, the plugin now also resolves a platform-specific HTML entry
file from project root before falling back to `index.html`.

For iOS native builds/dev webviews, it tries:

```
→ index.ios.html
→ index.mobile.html
→ index.native.html
→ index.html (fallback)
```

Behavior:

- **Build (`NATIVITE_PLATFORM` set, non-web):** if a platform entry is found, the plugin wires it as the Rollup `index` input while keeping the emitted filename as `index.html`.
- **Dev (native User-Agent requests):** HTML document requests are rewritten to the same resolved platform entry when present.

### Source Extensions

The plugin probes these extensions: `.tsx`, `.ts`, `.jsx`, `.js`, `.css`, `.svg`, `.json`.

### Resolution Cache

Platform-extension resolution results are cached per plugin instance by
platform, importer, and import source. Both successful resolutions and misses
are cached, so repeated imports in large Vite apps do not repeatedly perform
synchronous filesystem probing for the same candidate files.

During dev, the cache records every candidate path probed for a resolution and
invalidates affected entries when Vite's watcher reports `add` or `unlink`
events for those files. Content-only `change` events do not invalidate cached
entries because platform-extension resolution depends on path existence, not
file contents. This lets newly created platform variants take effect without
restarting the dev server while preserving the fast path for unchanged imports.

## Dev Server

### Named Vite Environments

The plugin registers named Vite environments for each platform:

- `ios`, `ipad`, `android`, `macos`

Each environment gets platform-specific `define` values:

```javascript
{
    "import.meta.env.VITE_NATIVITE": "true",
    "__PLATFORM__": JSON.stringify("ios"),
    "__IS_NATIVE__": "true",
    "__IS_MOBILE__": "true",
    "__IS_DESKTOP__": "false",
    "__DEV__": "true"
}
```

`__IS_NATIVE__`, `__IS_MOBILE__`, and `__IS_DESKTOP__` are derived from the
platform plugin trait flags (`native`, `mobile`, `desktop`) that are serialized
via platform metadata. Defaults are `native: true`, `mobile: false`,
`desktop: false` when omitted by a platform plugin. A platform plugin may set
both `mobile` and `desktop` to `true`.

And excludes nativite packages from dependency optimisation:

```
optimizeDeps.exclude: ["nativite", "nativite/chrome", "nativite/client", "nativite/css"]
```

### Native Request Routing

Each native webview sends an explicit `x-nativite-platform` request header on
top-level URL loads when the runtime API supports custom headers:

- iOS: `x-nativite-platform: ios`
- iPad: `x-nativite-platform: ipad`
- Android: `x-nativite-platform: android`
- macOS: `x-nativite-platform: macos`

The dev middleware also accepts a `__nativite_platform=<platform>` query marker
for explicit routing. The marker is primarily useful for tools or runtimes that
cannot attach request headers.

For backwards compatibility, each native webview also includes a platform
identifier in its User-Agent:

- iOS: `Nativite/ios/1.0`
- iPad: `Nativite/ipad/1.0`
- Android: `Nativite/android/1.0`
- macOS: `Nativite/macos/1.0`

The dev server middleware prefers the explicit header, then the query marker,
then falls back to the User-Agent token. This keeps environment routing stable
when WebView User-Agent strings are rewritten, cached, or omitted on specific
requests. It also preserves platform-specific code for simultaneous iOS,
Android, and desktop connections to the same dev server.

### Request Classification

> Maps to: `src/vite/request-routing.ts`

Not all requests should be module-transformed. The `shouldTransformNativeRequest()` function classifies requests:

**Transformed (module code):**

- JavaScript modules (based on `sec-fetch-dest: script`)
- URLs with module query params (`?import`, `?inline`, `?url`, etc.)

**Not transformed (static assets):**

- HTML documents (entry points)
- Images, fonts, audio, video (`.png`, `.jpg`, `.woff2`, etc.)
- Resources with non-script fetch destinations

### ETag Support

Transformed responses include ETags for cache validation. If the client sends `If-None-Match` matching the ETag, a `304 Not Modified` is returned.

## HMR for Native Variants

When a native variant file changes (e.g., `Button.ios.tsx`), the plugin bridges the HMR update to the client environment's HMR channel:

1. Detects native variant files via suffix matching.
2. Generates HMR update messages for both the variant URL and the canonical (non-suffixed) URL.
3. Sends updates to the client HMR channel.

This ensures hot reloading works for platform-specific files without a full page refresh.

## Dev Error Overlay

Vite's built-in error overlay (`vite-error-overlay`) is enabled in dev by default. Nativite resolves the default value in this order:

1. `NATIVITE_DEV_ERROR_OVERLAY` environment variable (if set)
2. `ios({ errorOverlay })` in `nativite.config.ts` (if configured)
3. fallback default: `true`

On iOS, native chrome elements (navigation bar, toolbar, tab bar) render on top of the webview, which can obscure the overlay content. The `nativite:dev-error-overlay` sub-plugin injects CSS that repositions the overlay to sit between chrome elements using the `--nv-inset-top` and `--nv-inset-bottom` CSS variables:

```css
vite-error-overlay {
  top: var(--nv-inset-top, 0px);
  bottom: var(--nv-inset-bottom, 0px);
}
```

This plugin only runs in dev mode (`apply: 'serve'`) — no CSS is injected in production builds.

To force-disable the error overlay regardless of config:

```bash
NATIVITE_DEV_ERROR_OVERLAY=false vite dev
```

## Build Output

### Fixture Build Coverage

`test/fixture-builds.test.ts` creates temporary Vite projects that import the
local nativite source, configure real `nativite()` Vite plugins, and run the
CLI build command against platform targets. The fixture apps include
platform-specific HTML entries and source variants so the tests verify the full
handoff from CLI environment variables through Vite's build pipeline, manifest
generation, and generated native project output.

The fixture build coverage currently targets iOS and macOS because those
generators can produce project files without invoking external native build
tooling. Android project generation remains covered by unit tests and the
`bun run test:native:android` runtime compile harness, which requires Gradle.

### Manifest Generation

After the build completes, the plugin generates `manifest.json` inside the
active build output directory (for example `dist-ios/manifest.json`):

```json
{
  "platform": "ios",
  "version": "1.0.0",
  "hash": "sha256-of-asset-paths-content-hashes-and-sizes",
  "assets": [
    {
      "path": "index.html",
      "hash": "sha256-of-index-html-bytes",
      "size": 1234
    },
    {
      "path": "assets/index-abc123.js",
      "hash": "sha256-of-javascript-bytes",
      "size": 5678
    }
  ],
  "builtAt": "2024-01-15T12:00:00.000Z"
}
```

The top-level `hash` is derived from the sorted per-asset path, content hash,
and byte size tuples. This means changing a file's contents changes the bundle
hash even if the output filename stays the same.

This manifest is used by:

- The native view controller for platform validation.
- The OTA update system for version comparison and downloaded asset integrity
  validation.

### Build Completion Marker

For native production builds launched by `nativite build`, the core plugin
writes `.nativite/build/<platform>.json` after `manifest.json` is written and
after the platform native generator/build hook completes. The CLI removes the
old marker before starting each platform build and requires the marker to exist
after Vite returns.

This marker is an internal handoff between the CLI and Vite plugin. It lets the
CLI distinguish a real Nativite native build from a plain Vite build that
succeeded because `nativite()` was missing from `vite.config.*`.

### Platform Plugin Build Hook

After manifest generation, the Vite plugin invokes the platform plugin's `build()` hook (if defined) for any platform-specific post-processing.

## Configuration Loading

The plugin loads `nativite.config.ts` using Vite's own `loadConfigFromFile()` utility, then validates it against `NativiteConfigSchema` (Zod schema).

## CLI ↔ Vite Handoff

Platform metadata is serialized by the CLI into the `NATIVITE_PLATFORM_METADATA`
environment variable and deserialized by the Vite plugin. For production builds,
the CLI iterates configured platforms and sets `NATIVITE_PLATFORM` before each
Vite build pass, so the plugin can emit platform-specific output directories and
invoke the correct platform plugin `build()` hook.
