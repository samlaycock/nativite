# Nativite

Build native iOS, macOS, and Android shells around your Vite app.

Nativite gives you:

- Native project generation for Apple and Android targets
- A typed JS bridge for calling native code from web code
- A declarative native chrome API (`title bar`, `navigation`, `toolbars`, sheets, drawers, etc.)
- Live device CSS variables (`--nv-*`) for safe areas, keyboard, appearance, and more

> Status: Nativite 1.0 defines a stable public configuration, package export,
> JavaScript bridge, and native chrome contract. Future releases may add
> capabilities, but documented 1.0 APIs are treated as supported public
> surface.

The `nativite/chrome` JavaScript API is the app-facing interface for native chrome. Native shells receive compiled Native Chrome Layout Protocol v2 (`chrome.snapshot`) messages; NCLP v2 is the stable host wire protocol for Nativite 1.0 and is documented in [NCLP.md](./NCLP.md).

The complete 1.0 stable surface, experimental surface, and semver policy are
documented in [Public API Contract](docs/shared/public-api-contract.md).

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

- macOS, Xcode, Xcode command line tools, and available simulators/devices (for iOS/macOS)
- Android Studio, Android SDK, a JDK, and a `gradle` command on `PATH` (for Android)
- Bun 1.x. The `nativite` CLI is Bun-first and loads `nativite.config.ts`
  directly, so run CLI examples with `bunx` or `bun run` rather than `node` or
  `npx`.

Nativite does not install, download, vendor, or bootstrap native toolchain
dependencies. Xcode, Xcode command line tools, simulators, Android Studio, the
Android SDK, Java, and Gradle are machine prerequisites that should be installed
and managed by the developer or their CI image. Nativite generates native project
files and prints clear errors when required tooling is unavailable.

For store uploads, use the native platform requirements current for your
submission date. As of April 28, 2026, Apple requires apps uploaded to App Store
Connect to be built with Xcode 26 or later and an iOS/iPadOS 26 SDK or later.
For Google Play, Nativite's Android default `targetSdk` is `36`; Google Play
requires new apps and updates to target an API level within one year of the
latest major Android release, with policy deadlines published by Google Play.

## Quick Start: Vite App to Native Shell

This is the shortest drop-in path for an existing Vite app.

### 1. Add Nativite

```bash
bun add nativite
```

### 2. Initialize native support

Run the init command from your Vite project root:

```bash
bunx nativite init
```

This creates `nativite.config.ts` using your `package.json` name and updates a
simple `vite.config.ts` to include `nativite()`. If your Vite config cannot be
edited safely, the command prints the exact manual import and plugin changes to
make.

By default, init keeps the first path narrow: it enables `ios` on macOS and
`android` on other hosts. Choose targets explicitly by repeating `--platform`:

```bash
bunx nativite init --platform ios --platform android
```

### 3. Build native projects

```bash
bunx nativite build
```

This runs a production Vite build for each configured target, writes the web
bundle, and creates or updates the matching native project under `.nativite/`.

### 4. Open the native project

Use the native IDE or simulator workflow you already use for the target platform:

```bash
open .nativite/ios/MyApp.xcodeproj
open .nativite/android
```

Xcode and Android Studio own native build settings, signing, simulator/device
selection, and launch. Nativite owns generating the native project code and the
web bundles those projects embed.

### 5. Use Vite during native debug runs

Run your normal Vite dev server when you want the generated debug native project
to load web code from Vite instead of the embedded production bundle.

```bash
bunx vite dev
```

Nativite's Vite plugin writes `.nativite/dev.json` with the resolved dev server
URL so native debug builds can discover it.

### Router and framework notes

- Prefer history fallback routes that work from `index.html`; generated native
  shells load the same app entry as Vite.
- Use platform-specific files such as `Button.ios.tsx`,
  `Button.android.tsx`, `Button.mobile.tsx`, or `Button.native.tsx` when a
  route or component needs native-only behavior.
- Add `/// <reference types="nativite/globals" />` to `vite-env.d.ts` before
  using compile-time globals such as `__PLATFORM__` or `__IS_NATIVE__`.
- Keep framework routing, state, and data loading in the web app. Reach for
  `nativite/chrome` or native plugins only when the native shell needs to own a
  native control or capability.

### Troubleshooting the first run

- `No platforms are configured.` Add at least one entry in `platforms`, or rerun
  init with `--platform ios`, `--platform macos`, or `--platform android`.
- iOS/macOS launch issues usually mean Xcode command line tools or simulators
  are missing or unavailable.
- Android generation requires Android Studio, Android SDK, Java, and a
  `gradle` command on `PATH`.
- If init cannot edit your Vite config safely, apply the import and plugin
  changes it prints.
- If `node ./node_modules/.bin/nativite` or `npx nativite` fails to load
  `nativite.config.ts`, rerun the command with Bun. The supported CLI runtime is
  Bun 1.x.

For a fuller walkthrough, see the [drop-in quickstart](docs/shared/quickstart.md).
Use the advanced chrome and plugin APIs after the generated native shell is
running and you need native-owned UI or custom native capabilities.

### Manual Setup

If you prefer to configure the project by hand, create the files below.

#### 1. Create `nativite.config.ts`

```ts
import { defineConfig, ios } from "nativite";

export default defineConfig({
  app: {
    name: "MyApp",
    bundleId: "com.example.myapp",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [ios()],
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

### Prepare production native projects

```bash
bunx nativite build
```

This prepares each configured native target for a production build. It runs a
production Vite build, writes the matching web bundle, and creates or updates
the native project that embeds that bundle:

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

For app-store submission, archive or package the generated project with the
native toolchain. `nativite build` does not create final signed artifacts such as
`.ipa`, `.aab`, `.apk`, signed `.app`, or `.dmg`; those are produced by Xcode,
Android Studio, Gradle, `xcodebuild`, or CI using your signing configuration.

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

- `ios()`, `macos()`, and `android()` can be called with no arguments. Defaults are iOS `17.0`, macOS `14.0`, Android `minSdk` `26`, and Android `targetSdk` `36`.
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

`updates` currently enables OTA bundle checks and staged bundle application for
iOS and macOS generated runtimes. Android exposes the same JavaScript
`ota.check()` status shape, but it always reports `{ available: false }` until
Android OTA staging/apply support is implemented.

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

`ota.check()` is implemented by the Apple runtimes today. On Android it is a
compatibility placeholder that resolves to `{ available: false }`.

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

`package.json#exports` is the complete public module list. Deep imports are
unsupported, and the CLI is exposed as the `nativite` binary rather than as an
importable `nativite/cli` runtime module.

See [Public API Contract](docs/shared/public-api-contract.md) for the semver
rules that apply to package exports, `nativite.config.ts`, generated native
projects, NCLP/native bridge payloads, first-party plugins, and CLI commands.

## Troubleshooting

- `No platforms are configured.`
  - Add at least one entry in `platforms`.

- iOS/macOS build/launch issues
  - Ensure Xcode command line tools are installed and simulators exist.

- Android project generation fails with `gradle: command not found`
  - Install Gradle or expose Android Studio's Gradle-compatible tooling on
    `PATH`, then rerun `bunx nativite build --platform android`.

- `nativite.config.ts` fails to load when invoking the CLI with Node
  - Run the CLI with `bunx nativite ...` or `bun run nativite ...`. Bun 1.x is
    the supported CLI runtime.

## Documentation Map

Deep technical docs are in [docs/README.md](docs/README.md).

Suggested starting points:

- [Drop-in quickstart](docs/shared/quickstart.md)
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

<img src="branding/poster.webp" alt="Nativite" style="width:400px; height:auto;">
