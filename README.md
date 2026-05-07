# Nativite

Build native iOS, macOS, and Android shells around your Vite app.

Nativite gives you:

- Native project generation for Apple and Android targets
- A typed JS bridge for calling native code from web code
- A declarative native chrome API (`title bar`, `navigation`, `toolbars`, sheets, drawers, etc.)
- Live device CSS variables (`--nv-*`) for safe areas, keyboard, appearance, and more

> Status: early development. APIs are usable but may change between releases.

The `nativite/chrome` JavaScript API is the app-facing interface for native chrome. Native shells receive compiled Native Chrome Layout Protocol v2 (`chrome.snapshot`) messages; NCLP v2 is the stable host wire protocol for Nativite 1.0 and is documented in [NCLP.md](./NCLP.md).

## Who This Is For

Nativite is for teams that already have a Vite web app and want:

- shared product logic across web + native
- gradual native capability adoption
- native UI controls without rewriting the app in Swift/Kotlin

## Installation

```bash
bun add nativite
```

Peer dependencies:

- `typescript ^5`
- `vite >=5` (required if you use `nativite/vite`)

## Requirements

- macOS + Xcode (for iOS/macOS generation and launch)
- Android SDK + emulator/device (for Android)
- Bun 1.x or Node 18+

## Quick Start

### 1. Initialize an existing Vite app

Run the init command from your Vite project root:

```bash
bunx nativite init
```

This creates `nativite.config.ts` using your `package.json` name and updates a
simple `vite.config.ts` to include `nativite()`. If your Vite config cannot be
edited safely, the command prints the exact manual import and plugin changes to
make.

Then build the configured native targets:

```bash
bunx nativite build
```

### Manual setup

If you prefer to configure the project by hand, create the files below.

#### 1. Create `nativite.config.ts`

```ts
import { android, defineConfig, ios, macos } from "nativite";

export default defineConfig({
  app: {
    name: "MyApp",
    bundleId: "com.example.myapp",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [ios(), macos(), android()],
});
```

#### 2. Add the Vite plugin

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { nativite } from "nativite/vite";

export default defineConfig({
  plugins: [nativite()],
});
```

### 2. Generate native projects and web bundles

```bash
bunx nativite build
```

This runs a production Vite build for each configured native platform and writes
the matching native projects locally:

```text
.nativite/ios
.nativite/macos
.nativite/android
dist-ios
dist-macos
dist-android
```

Optional single-platform build:

```bash
bunx nativite build --platform ios
```

### 3. Open the generated native project

Use the native IDE or simulator workflow you already use for the target platform:

```bash
open .nativite/ios/MyApp.xcodeproj
open .nativite/android
```

Xcode and Android Studio own native build settings, signing, simulator/device
selection, and launch. Nativite owns generating the native project code and the
web bundles those projects embed.

### 4. Optional web dev server

Run your normal Vite dev server when you want the generated debug native project
to load web code from Vite instead of the embedded production bundle.

```bash
bunx vite dev
```

Nativite's Vite plugin writes `.nativite/dev.json` with the resolved dev server
URL so native debug builds can discover it.

## Configuration Overview

### Required fields

- `app.name`
- `app.bundleId`
- `app.version`
- `app.buildNumber`
- `platforms` (at least one)

### Built-in platform helpers

- `ios({ minimumVersion?, errorOverlay?, overrides? })`
- `macos({ minimumVersion?, overrides? })`
- `android({ minSdk?, targetSdk?, overrides? })`

Notes:

- `ios()`, `macos()`, and `android()` can be called with no arguments. Defaults are iOS `17.0`, macOS `14.0`, Android `minSdk` `26`, and Android `targetSdk` `35`.
- `ios.errorOverlay` controls the default Vite HMR overlay behaviour in dev. `NATIVITE_DEV_ERROR_OVERLAY` still takes precedence when set.
- `android.targetSdk` must be an integer when provided.

### Optional root fields

- `signing`
- `updates`
- `plugins`
- `platformPlugins`
- `defaultChrome`
- `icon`
- `splash`

## JavaScript Runtime APIs

### `nativite/client`

Low-level transport and event subscription:

```ts
import { bridge, ota } from "nativite/client";

if (bridge.isNative) {
  const cameraResult = await bridge.call("camera", "capture", { quality: 0.9 });
  console.log(cameraResult);
}

const unsub = bridge.subscribe("location:update", (payload) => {
  console.log(payload);
});

const update = await ota.check();
console.log(update.available, update.version);

unsub();
```

### `nativite/chrome`

Declarative native chrome state:

```ts
import { chrome, navigation, statusBar, titleBar, toolbar } from "nativite/chrome";

const cleanup = chrome(
  titleBar({
    title: "Inbox",
    trailingItems: [{ id: "compose", label: "Compose", style: "primary" }],
  }),
  navigation({
    items: [
      { id: "inbox", label: "Inbox", icon: "tray.fill" },
      { id: "search", label: "Search", icon: "magnifyingglass", role: "search" },
    ],
    activeItem: "inbox",
  }),
  toolbar({
    items: [{ id: "filter", label: "Filter" }],
  }),
  statusBar({ style: "auto" }),
);

const unsub = chrome.on("navigation.itemPressed", ({ id }) => {
  console.log("Selected", id);
});

cleanup();
unsub();
```

Also available on `chrome`:

- `chrome.messaging.postToParent/postToChild/broadcast/onMessage`
- `chrome.splash.preventAutoHide()`
- `chrome.splash.hide()`

### `nativite/css`

Typed helpers for `--nv-*` device variables:

```ts
import { NVVars } from "nativite/css";

const topInset = NVVars.getNumber("safe-top");
const isDark = NVVars.getBoolean("is-dark");

const stop = NVVars.observeNumber("keyboard-height", (height) => {
  console.log("Keyboard height:", height);
});

stop();
```

### `nativite/utils`

Platform-conditioned value selection:

```ts
import { platform } from "nativite/utils";

const backLabel = platform(
  {
    ios: "Back",
    android: "Navigate up",
    web: "Back",
  },
  "Back",
);
```

## Custom Platforms

Use `definePlatformPlugin()` + `platform()` to add non-first-party runtimes:

```ts
import { definePlatformPlugin, platform } from "nativite";

const electronPlatform = definePlatformPlugin({
  name: "electron-platform",
  platform: "electron",
  native: true,
  mobile: false,
  desktop: true,
  extensions: [".electron", ".desktop", ".native"],
  environments: ["electron"],
  async generate(ctx) {},
  async build(ctx) {},
});

// in defineConfig(...)
// platforms: [platform("electron", { /* custom config */ })]
// platformPlugins: [electronPlatform]
```

## Vite Integration Details

The plugin:

- creates per-platform environments (`ios`, `ipad`, `macos`, `android`, plus plugin-defined)
- resolves platform file variants (`.ios`, `.mobile`, `.native`, etc.)
- writes `manifest.json` during build hooks
- handles native-request routing + HMR behavior for platform variants

### Global compile-time constants

Add this in `vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
/// <reference types="nativite/globals" />
```

Then use:

- `__PLATFORM__`
- `__IS_NATIVE__`
- `__IS_MOBILE__`
- `__IS_DESKTOP__`
- `__DEV__`

`__IS_NATIVE__`/`__IS_MOBILE__`/`__IS_DESKTOP__` come from your platform plugin traits
(`native`, `mobile`, `desktop`). Defaults are `native: true`, `mobile: false`,
`desktop: false` when omitted. A platform can set both `mobile` and `desktop`
to `true`.

## Public Exports

- `nativite`: config helpers, schema, core public types
- `nativite/vite`: `nativite()`
- `nativite/client`: `bridge`, `ota`
- `nativite/chrome`: `chrome` + chrome factory functions + chrome types
- `nativite/css`: `NVVars`, `NVVarName`
- `nativite/utils`: platform utility helpers
- `nativite/globals`: ambient globals types
- `nativite/cli`: CLI entry point

## Troubleshooting

- `No platforms are configured.`
  - Add at least one entry in `platforms`.

- iOS/macOS build/launch issues
  - Ensure Xcode command line tools are installed and simulators exist.

## Documentation Map

Deep technical docs are in [docs/README.md](docs/README.md).

Suggested starting points:

- [Chrome API internals](docs/shared/chrome-api.md)
- [Client bridge internals](docs/shared/client-bridge.md)
- [Vite plugin internals](docs/shared/vite-plugin.md)
- [Platform registry](docs/shared/platform-registry.md)
- [iOS overview docs](docs/ios/dev-workflow.md)
- [Android overview docs](docs/android/dev-workflow.md)

## Development (Repository)

```bash
bun install
bun run build
bun run typecheck
bun run lint
bun run test
bun run test:native:ios
bun run test:native:android
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution workflow and [SECURITY.md](./SECURITY.md) for vulnerability reporting.

Release notes are tracked in [CHANGELOG.md](./CHANGELOG.md) and generated from changesets.

## License

MIT

---

![Nativite](branding/poster.png)
