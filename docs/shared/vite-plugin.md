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

### Source Extensions

The plugin probes these extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`.

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

### User-Agent Based Routing

Each native webview includes a platform identifier in its User-Agent:

- iOS: `Nativite/ios/1.0`
- iPad: `Nativite/ipad/1.0`
- Android: `Nativite/android/1.0`
- macOS: `Nativite/macos/1.0`

The dev server middleware intercepts requests, reads the User-Agent, and routes to the correct Vite environment for module transformation. This means an iOS simulator and Android emulator can connect to the same dev server simultaneously and receive platform-specific code.

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

### Manifest Generation

After the build completes, the plugin generates `manifest.json` inside the
active build output directory (for example `dist-ios/manifest.json`):

```json
{
    "platform": "ios",
    "version": "1.0.0",
    "hash": "sha256-of-asset-list",
    "assets": ["index.html", "assets/index-abc123.js", ...],
    "builtAt": "2024-01-15T12:00:00.000Z"
}
```

This manifest is used by:

- The native view controller for platform validation.
- The OTA update system for version comparison.

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
