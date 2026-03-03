# Nativite

Build native iOS, macOS, and Android shells around your Vite app.

Nativite gives you:

- Native project generation for Apple and Android targets
- A typed JS bridge for calling native code from web code
- A declarative native chrome API (`title bar`, `navigation`, `toolbars`, sheets, drawers, etc.)
- Live device CSS variables (`--nv-*`) for safe areas, keyboard, appearance, and more

> Status: early development. APIs are usable but may change between releases.

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

### 1. Create `nativite.config.ts`

```ts
import { android, defineConfig, ios, macos } from "nativite";

export default defineConfig({
  app: {
    name: "MyApp",
    bundleId: "com.example.myapp",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [
    ios({ minimumVersion: "17.0" }),
    macos({ minimumVersion: "14.0" }),
    android({ minSdk: 26 }),
  ],
});
```

### 2. Add the Vite plugin

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { nativite } from "nativite/vite";

export default defineConfig({
  plugins: [nativite()],
});
```

### 3. Run Vite dev

```bash
bunx vite dev
```

### 4. Run the native dev manager (separate terminal)

```bash
bunx nativite dev
```

Important:

- `nativite dev` does not start Vite.
- It reads `.nativite/dev.json` (written by the Vite plugin) or accepts `--url`.

Optional explicit URL:

```bash
bunx nativite dev --url http://127.0.0.1:5173
```

### 5. Trigger platform builds from the CLI table

The CLI shows configured platforms with a hotkey per platform (for example `i + enter` for ios).
Press that hotkey to build and launch that platform runtime.

## Configuration Overview

### Required fields

- `app.name`
- `app.bundleId`
- `app.version`
- `app.buildNumber`
- `platforms` (at least one)

### Built-in platform helpers

- `ios({ minimumVersion, target?, simulator?, errorOverlay?, overrides? })`
- `macos({ minimumVersion, overrides? })`
- `android({ minSdk, targetSdk?, overrides? })`

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
import { NKVars } from "nativite/css";

const topInset = NKVars.getNumber("safe-top");
const isDark = NKVars.getBoolean("is-dark");

const stop = NKVars.observeNumber("keyboard-height", (height) => {
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
  extensions: [".electron", ".desktop", ".native"],
  environments: ["electron"],
  async generate(ctx) {},
  async dev(ctx) {},
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
- `__DEV__`

## Public Exports

- `nativite`: config helpers, schema, core public types
- `nativite/vite`: `nativite()`
- `nativite/client`: `bridge`, `ota`
- `nativite/chrome`: `chrome` + chrome factory functions + chrome types
- `nativite/css`: `NKVars`, `NKVarName`
- `nativite/utils`: platform utility helpers
- `nativite/globals`: ambient globals types
- `nativite/cli`: CLI entry point

## Troubleshooting

- `Dev server: waiting for vite dev...`
  - Start Vite first (`bunx vite dev`) or pass `--url`.

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
```

## License

MIT
