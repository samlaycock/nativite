# Nativite

Build native iOS and macOS apps using your existing web stack — React, Vue, Svelte, or plain TypeScript. Nativite wraps your Vite web app in a `WKWebView` and gives you a typed JavaScript bridge to control native UIKit/AppKit chrome, CSS variables that reflect live device state, and a CLI that generates and launches an Xcode project automatically. You can also register third-party platform plugins for non-Apple WebView shells.

> **Status:** Early development. The API is functional but not yet stable.

---

## How it works

```
your web app  ──→  Vite build  ──→  dist-<platform>/
                                      ↓
nativite.config.ts  ──→  nativite generate  ──→  built-in Xcode generation or platform plugin hooks
                                                           ↓
                                                     WKWebView loads dist/
                                                           ↕
                                               JS bridge (webkit.messageHandlers)
                                                           ↕
                                               NativiteBridge.swift (Swift RPC)
```

1. You write a web app with Vite. Nativite registers per-platform native Vite environments (`ios`, `ipad`, `macos`, plus plugin-defined environments) while `client` remains the web environment.
2. `nativite generate` (or the Vite plugin) generates a complete Xcode project for built-in Apple targets, or calls `generate` hooks for third-party platform plugins.
3. The generated app loads a bundled `dist/` directory inside `WKWebView` (from `dist-<platform>/`). In dev mode it loads from the Vite dev server instead.
4. Your JavaScript talks to Swift over a typed async RPC bridge. Native chrome (nav bars, tab bars, keyboards, etc.) is controlled declaratively with singleton namespaces like `chrome.navigationBar.setTitle()`, `chrome.tabBar.setTabs()`, etc.

---

## Installation

```bash
npm install nativite
# or
bun add nativite
```

**Peer dependencies:** `typescript ^5`, `vite >=5` (optional — only needed if you use the Vite plugin).

---

## Quick start

### 1. Create `nativite.config.ts`

```ts
import { defineConfig, ios, macos } from "nativite";

export default defineConfig({
  app: {
    name: "MyApp",
    bundleId: "com.example.myapp",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [
    ios({ minimumVersion: "17.0" }),
    macos({ minimumVersion: "14.0" }), // optional — adds a macOS target
  ],
});
```

### 2. Add the Vite plugin

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nativite } from "nativite/vite";

export default defineConfig({
  plugins: [react(), nativite()],
});
```

### 3. Start the dev server

```bash
npx nativite dev
```

This starts Vite, generates the native project, and launches configured targets. For built-in Apple platforms, Nativite builds with `xcodebuild` and launches iOS Simulator/macOS automatically. For third-party platforms, configured platform plugin `dev` hooks run.

For third-party targets, add `platform("<name>", {...})` entries and matching `platformPlugins`.

---

## Configuration

All configuration lives in `nativite.config.ts`. Use `defineConfig` for TypeScript inference.

```ts
import { defineConfig, definePlatformPlugin, ios, macos, platform } from "nativite";

export default defineConfig({
  // ── Required ──────────────────────────────────────────────────────────────
  app: {
    name: "MyApp", // Xcode target name and app display name
    bundleId: "com.example.myapp", // Reverse-domain bundle identifier
    version: "1.0.0", // MARKETING_VERSION (shown in App Store)
    buildNumber: 1, // CURRENT_PROJECT_VERSION
  },

  // ── Platforms (required) ────────────────────────────────────────────────
  platforms: [
    ios({
      minimumVersion: "17.0", // IPHONEOS_DEPLOYMENT_TARGET
      target: "simulator", // optional: 'simulator' | 'device'
      simulator: "iPhone 16 Pro", // optional simulator name
      errorOverlay: false, // optional: Vite runtime error overlay in native dev WebViews
      overrides: {
        app: { bundleId: "com.example.myapp.ios" }, // per-platform root overrides
        signing: { ios: { mode: "automatic", teamId: "ABCDE12345" } },
      },
    }),
    macos({
      minimumVersion: "14.0",
      overrides: { app: { bundleId: "com.example.myapp.macos" } },
    }), // optional — MACOSX_DEPLOYMENT_TARGET
    // platform("android", { minSdk: 26 }), // third-party example
  ],

  platformPlugins: [
    definePlatformPlugin({
      name: "android-platform",
      platform: "android",
      environments: ["android"], // default: [platform]
      extensions: [".android", ".mobile", ".native"], // default: [`.${platform}`, ".native"]
    }),
  ],

  // ── Code signing (optional) ───────────────────────────────────────────────
  signing: {
    ios: {
      mode: "automatic", // 'automatic' | 'manual'
      teamId: "ABCDE12345", // Apple Developer Team ID
    },
  },

  // ── OTA updates (optional) ────────────────────────────────────────────────
  updates: {
    url: "https://updates.example.com", // URL polled for new bundles
    channel: "production", // Channel name (e.g. 'beta', 'production')
  },

  // ── App icon (optional) ──────────────────────────────────────────────────
  icon: "./assets/icon.png", // 1024×1024 PNG (Xcode generates all sizes)

  // ── Splash screen (optional) ──────────────────────────────────────────────
  splash: {
    backgroundColor: "#1A1A2E", // Hex colour shown while the WebView loads
    image: "./assets/logo.png", // Optional centred image (path relative to project root)
  },

  // ── Initial native chrome state (optional) ────────────────────────────────
  // Applied before the WebView loads its first frame — no flash of wrong UI.
  defaultChrome: {
    navigationBar: { title: "Home", largeTitleMode: "always" },
    statusBar: { style: "light" },
  },
});
```

### Config field reference

| Field                    | Type                          | Required | Description                                                                                                    |
| ------------------------ | ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `app.name`               | `string`                      | ✅       | App display name and Xcode target name                                                                         |
| `app.bundleId`           | `string`                      | ✅       | Reverse-domain bundle ID (`com.example.app`)                                                                   |
| `app.version`            | `string`                      | ✅       | Marketing version string (`1.0.0`)                                                                             |
| `app.buildNumber`        | `number`                      | ✅       | Integer build number, incremented on each release                                                              |
| `platforms`              | `NativitePlatformConfig[]`    | ✅       | Platform entries such as `ios({...})`, `macos({...})`                                                          |
| `platformPlugins`        | `NativitePlatformPlugin[]`    | —        | Third-party platform integration hooks                                                                         |
| `platform().overrides`   | `NativiteRootConfigOverrides` | —        | Per-platform root overrides (`app`, `signing`, `updates`, `plugins`, `defaultChrome`, `icon`, `splash`, `dev`) |
| `ios().minimumVersion`   | `string`                      | —        | iOS deployment target                                                                                          |
| `ios().target`           | `"simulator" \| "device"`     | —        | Optional iOS dev launch target                                                                                 |
| `ios().simulator`        | `string`                      | —        | Optional iOS Simulator name                                                                                    |
| `ios().errorOverlay`     | `boolean`                     | —        | Optional native dev runtime error overlay toggle (default: `false`)                                            |
| `macos().minimumVersion` | `string`                      | —        | macOS deployment target                                                                                        |
| `signing.ios.mode`       | `"automatic" \| "manual"`     | —        | Xcode code signing mode                                                                                        |
| `signing.ios.teamId`     | `string`                      | —        | Apple Developer Team ID                                                                                        |
| `updates.url`            | `string`                      | —        | OTA update server URL                                                                                          |
| `updates.channel`        | `string`                      | —        | OTA release channel                                                                                            |
| `icon`                   | `string`                      | —        | Path to 1024×1024 PNG app icon (relative to project root)                                                      |
| `splash.backgroundColor` | `string`                      | —        | Launch screen background hex colour                                                                            |
| `splash.image`           | `string`                      | —        | Path to splash image (relative to project root)                                                                |
| `defaultChrome`          | `ChromeState`                 | —        | Chrome state applied before first load                                                                         |

### Third-party platform plugins

`platformPlugins` gives a universal extension point for platform support. Any platform that can host your web bundle can provide its own plugin hooks:

```ts
definePlatformPlugin({
  name: "android-platform",
  platform: "android",
  environments: ["android"], // optional, defaults to ["android"]
  extensions: [".android", ".mobile", ".native"], // optional, defaults to [".android", ".native"]
  async generate(ctx) {
    // Create/update native project artifacts for this platform
  },
  async dev(ctx) {
    // Launch dev runtime (emulator/device/etc.)
  },
  async build(ctx) {
    // Consume outDir + manifest after vite build
  },
});
```

Per-platform `overrides` let you override root config defaults for each platform (`app`, `signing`, `updates`, `plugins`, `defaultChrome`, `icon`, `splash`, `dev`).

---

## CLI

```bash
# Start dev server + platform launch hooks
npx nativite dev

# Run platform generation (Xcode for built-in Apple targets, plugin hooks for custom targets)
npx nativite generate

# Force-regenerate regardless of config hash
npx nativite generate --force

# Production builds (platform-specific output directories)
npx nativite build --platform ios
npx nativite build --platform macos

# Target a specific platform
npx nativite generate --platform ios
npx nativite generate --platform android
npx nativite dev --simulator "iPhone 15"
npx nativite dev --target device
```

---

## JavaScript API

### `nativite/client` — bridge & events

The core transport layer between your JavaScript and Swift.

```ts
import { bridge } from "nativite/client";

// Check if running inside a native shell
if (bridge.isNative) {
  console.log("Running in a Nativite WebView");
}

// Call a registered native plugin method
const result = await bridge.call("camera", "capture", { quality: 0.9 });

// Subscribe to native-push events
const unsub = bridge.subscribe("location:update", (coords) => {
  console.log(coords);
});
unsub(); // unsubscribe
```

Outside of a native WebView (e.g. in a regular browser during development), `bridge.isNative` is `false` and all `bridge.call()` invocations resolve with `undefined` — so your plugin code works without platform conditionals.

#### OTA updates

```ts
import { ota } from "nativite/client";

const { available, version } = await ota.check();
```

---

### `nativite/chrome` — native UI chrome

Control native UIKit chrome declaratively from JavaScript using singleton namespaces with named setters, `configure(...)`, and `on*` subscriptions. Only the keys you provide are changed — absent keys are left unchanged.

```ts
import { chrome } from "nativite/chrome";

// Configure the navigation bar
chrome.navigationBar.setTitle("Settings");
chrome.navigationBar.configure({ largeTitleMode: "never" });
chrome.navigationBar.setToolbarRight([
  { type: "button", id: "save", title: "Save", style: "done" },
]);
const unsubNav = chrome.navigationBar.onButtonTap(({ id }) => {
  if (id === "save") saveChanges();
});

// Configure the tab bar
chrome.tabBar.setTabs([
  { id: "home", title: "Home", systemImage: "house.fill" },
  { id: "search", title: "Search", systemImage: "magnifyingglass" },
  { id: "profile", title: "Profile", systemImage: "person.fill" },
]);
chrome.tabBar.setActiveTab("home");
const unsubTab = chrome.tabBar.onSelect(({ id }) => navigateTo(id));

// Simple elements
chrome.statusBar.setStyle("light");
chrome.homeIndicator.hide();
```

Toolbar and navigation-bar buttons can also expose native iOS menus and nested submenus:

```ts
chrome.toolbar.setItems([
  {
    type: "button",
    id: "more",
    systemImage: "ellipsis.circle",
    menu: {
      items: [
        { id: "refresh", title: "Refresh" },
        {
          id: "sort",
          title: "Sort",
          submenu: [
            { id: "sort.date", title: "By Date" },
            { id: "sort.name", title: "By Name" },
          ],
        },
      ],
    },
  },
]);
```

Each namespace exposes dedicated setters and subscriptions. Event handlers are additive and return unsubscribe functions.

#### Per-element namespaces

| Namespace              | Key methods                                                                                   | Description                                     |
| ---------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `chrome.navigationBar` | `show`, `hide`, `setTitle`, `setToolbar*`, `configure`                                        | Navigation bar title, buttons, menus, tint      |
| `chrome.tabBar`        | `show`, `hide`, `setTabs`, `setActiveTab`, `configure`                                        | Tab bar items, selection, badges                |
| `chrome.toolbar`       | `show`, `hide`, `setItems`, `configure`                                                       | Bottom toolbar items and iOS menus              |
| `chrome.searchBar`     | `setText`, `setPlaceholder`, `configure`                                                      | Search bar text and actions                     |
| `chrome.sheet`         | `present`, `dismiss`, `setDetents`, `setSelectedDetent`, `setURL`, `postMessage`, `configure` | Modal sheet detents, URL content, and messaging |
| `chrome.keyboard`      | `setAccessory`, `configure`                                                                   | Input accessory bar, dismiss mode               |
| `chrome.sidebar`       | `show`, `hide`, `setItems`, `setActiveItem`                                                   | iPad/macOS sidebar                              |
| `chrome.menuBar`       | `setMenus`                                                                                    | macOS menu bar                                  |
| `chrome.statusBar`     | `show`, `hide`, `setStyle`                                                                    | Status bar style, visibility                    |
| `chrome.homeIndicator` | `show`, `hide`                                                                                | Home indicator visibility                       |
| `chrome.window`        | `setTitle`, `setSubtitle`, `configure`                                                        | macOS window title bar                          |

#### Batch updates

Use `chrome.set()` to update multiple elements at once. This does not register event listeners:

```ts
chrome.set({
  statusBar: { style: "light" },
  homeIndicator: { hidden: true },
  navigationBar: { title: "Home" },
});
```

#### Event escape hatch

For cases where you need multiple listeners on the same event, or want to listen from a different part of your code, use `chrome.on()`:

```ts
// Stacking listeners — all fire for the same event
const unsub = chrome.on("tabBar.tabSelected", ({ id }) => {
  analytics.track("tab_switch", { id });
});

unsub(); // stop listening
```

Per-element `on*` listeners and `chrome.on()` listeners both fire for the same event — they don't interfere with each other.

#### Chrome events reference

| Event                           | Payload                           | Description                         |
| ------------------------------- | --------------------------------- | ----------------------------------- |
| `navigationBar.buttonTapped`    | `{ id }`                          | A nav bar button was tapped         |
| `navigationBar.backTapped`      | `{}`                              | The back button was tapped          |
| `tabBar.tabSelected`            | `{ id }`                          | A tab was selected                  |
| `toolbar.buttonTapped`          | `{ id }`                          | A toolbar button was tapped         |
| `searchBar.textChanged`         | `{ text }`                        | Search text changed                 |
| `searchBar.submitted`           | `{ text }`                        | Return key tapped in search bar     |
| `searchBar.cancelled`           | `{}`                              | Cancel button tapped                |
| `sheet.detentChanged`           | `{ detent }`                      | Sheet dragged to a new detent       |
| `sheet.dismissed`               | `{}`                              | Sheet dismissed                     |
| `sheet.message`                 | `{ message }`                     | Message posted from sheet webview   |
| `sheet.loadFailed`              | `{ message, code, domain, url? }` | Sheet webview load failed           |
| `sidebar.itemSelected`          | `{ id }`                          | Sidebar item selected               |
| `menuBar.itemSelected`          | `{ id }`                          | macOS menu item selected            |
| `keyboard.accessory.itemTapped` | `{ id }`                          | Keyboard accessory button tapped    |
| `safeArea.changed`              | `{ top, left, bottom, right }`    | Safe area changed (load / rotation) |

#### Sheet URL + messaging

Load a dedicated page in the sheet webview and exchange messages with the main webview.

- `chrome.sheet.setURL("/sheet")`:
  - Dev: loads `http(s)://<dev-host>/sheet`
  - Prod bundle: always loads bundled `dist/index.html` and applies `/sheet` via `history.replaceState(...)` (SPA-style, no hash routing)
- `chrome.sheet.setURL("./sheet/index.html")`: loads an explicit file relative to the current main webview URL.
- Calls to `chrome.*` from inside the sheet webview are ignored; only the primary app webview can mutate native chrome state.

```ts
chrome.sheet.setDetents(["small", "medium", "large"]);
chrome.sheet.setURL("/sheet");
chrome.sheet.present();

chrome.sheet.postMessage({ type: "init", theme: "light" });
const unsubSheetMessage = chrome.sheet.onMessage(({ message }) => {
  console.log("sheet -> main", message);
});
```

Inside the sheet page, use `window.nativiteSheet`:

```ts
window.nativiteSheet.postMessage({ type: "ready" });
const off = window.nativiteSheet.onMessage((message) => {
  console.log("main -> sheet", message);
});
```

If you already use `nativite/chrome` inside the sheet page, `chrome.sheet.postMessage(...)` also routes to the host app in that context.

Optional diagnostic hook while integrating:

```ts
const unsubSheetError = chrome.sheet.onLoadFailed((error) => {
  console.error("sheet load failed", error);
});
```

#### Keyboard input accessory

A native toolbar rendered above the software keyboard, useful for custom "Done" buttons or form navigation:

```ts
chrome.keyboard.setAccessory({
  items: [
    { type: "button", id: "prev", systemImage: "chevron.up" },
    { type: "button", id: "next", systemImage: "chevron.down" },
    { type: "flexibleSpace" },
    { type: "button", id: "done", title: "Done", style: "prominent" },
  ],
});
chrome.keyboard.configure({ dismissMode: "interactive" });
const unsubKeyboard = chrome.keyboard.onAccessoryItemTap(({ id }) => {
  if (id === "done") (document.activeElement as HTMLElement)?.blur();
});

// Remove the accessory bar
chrome.keyboard.setAccessory(null);
unsubKeyboard();
```

---

### `nativite/css-vars` — live device CSS variables

Nativite injects 50+ `--nk-*` CSS custom properties onto `:root` before any content renders, and keeps them live as the device state changes (rotation, dark mode, keyboard, Dynamic Type, etc.).

```ts
import { NKVars } from "nativite/css-vars";

// Read current values
const safeTop = NKVars.getNumber("safe-top"); // → 59 (points)
const isDark = NKVars.getBoolean("is-dark"); // → true | false
const kbHeight = NKVars.getNumber("keyboard-height"); // → 336

// Observe changes
const unsub = NKVars.observe("keyboard-height", (value) => {
  console.log("Keyboard height:", value); // e.g. "336.0px"
});

const unsub2 = NKVars.observeBoolean("is-dark", (dark) => {
  document.documentElement.classList.toggle("dark", dark);
});

const unsub3 = NKVars.observeNumber("safe-bottom", (pts) => {
  document.documentElement.style.setProperty("--footer-pad", `${pts}px`);
});

unsub();
```

Use them directly in CSS — they update without any JavaScript:

```css
.app {
  padding-top: var(--nk-safe-top);
  padding-bottom: var(--nk-safe-bottom);
}

.chat-input {
  /* Slide up with the keyboard, accounting for the tab bar */
  bottom: calc(var(--nk-keyboard-inset) + var(--nk-tab-height));
  transition-duration: var(--nk-keyboard-duration);
  transition-timing-function: var(--nk-keyboard-curve);
}

@media (prefers-color-scheme: dark) {
  /* Or use --nk-is-dark for finer control */
}
```

#### Available CSS variables

| Variable                                               | Type          | Description                                |
| ------------------------------------------------------ | ------------- | ------------------------------------------ |
| `--nk-safe-top/bottom/left/right`                      | `px`          | Safe area insets                           |
| `--nk-inset-top/bottom/left/right`                     | `px`          | Combined inset including chrome bars       |
| `--nk-nav-height` / `--nk-nav-visible`                 | `px` / `0\|1` | Navigation bar                             |
| `--nk-tab-height` / `--nk-tab-visible`                 | `px` / `0\|1` | Tab bar                                    |
| `--nk-toolbar-height` / `--nk-toolbar-visible`         | `px` / `0\|1` | Toolbar                                    |
| `--nk-status-height`                                   | `px`          | Status bar height                          |
| `--nk-keyboard-height`                                 | `px`          | Keyboard frame height                      |
| `--nk-keyboard-visible`                                | `0\|1`        | Keyboard currently shown                   |
| `--nk-keyboard-floating`                               | `0\|1`        | iPad floating keyboard                     |
| `--nk-keyboard-inset`                                  | `px`          | Effective keyboard inset (0 when floating) |
| `--nk-keyboard-duration`                               | `ms`          | Keyboard animation duration                |
| `--nk-keyboard-curve`                                  | easing        | Keyboard animation curve                   |
| `--nk-accessory-height`                                | `px`          | Input accessory bar height                 |
| `--nk-is-dark` / `--nk-is-light`                       | `0\|1`        | Dark/light mode                            |
| `--nk-contrast`                                        | `0\|1`        | High contrast enabled                      |
| `--nk-reduced-motion`                                  | `0\|1`        | Reduce motion enabled                      |
| `--nk-accent-r/g/b`                                    | `0–255`       | System accent colour channels              |
| `--nk-accent`                                          | `rgb(…)`      | System accent colour                       |
| `--nk-font-scale`                                      | number        | Dynamic Type scale factor                  |
| `--nk-font-body` … `--nk-font-largeTitle`              | `px`          | All 11 Dynamic Type sizes                  |
| `--nk-is-phone` / `--nk-is-tablet` / `--nk-is-desktop` | `0\|1`        | Device class                               |
| `--nk-is-portrait` / `--nk-is-landscape`               | `0\|1`        | Orientation                                |
| `--nk-display-scale`                                   | number        | Screen scale factor (2 or 3)               |
| `--nk-display-corner`                                  | `px`          | Display corner radius                      |

All variables have sensible defaults and are available immediately in both native and browser environments — you can use them freely during development without a native build.

---

## Project generation

When at least one built-in Apple platform is configured (`ios(...)` and/or `macos(...)`), `nativite generate` (or starting the Vite dev server) writes a complete, ready-to-open Xcode project under `.nativite/ios/`:

```
.nativite/
├── .hash                          # Config hash for dirty-checking
├── dev.json                       # Dev server URL written during `nativite dev`
└── ios/
    └── MyApp.xcodeproj/
        └── project.pbxproj
    └── MyApp/
        ├── AppDelegate.swift
        ├── ViewController.swift
        ├── NativiteBridge.swift   # WKScriptMessageHandlerWithReply RPC layer
        ├── NativiteChrome.swift   # Declarative UIKit chrome reconciler
        ├── NativiteVars.swift     # --nk-* CSS variable injector
        ├── NativiteKeyboard.swift # Input accessory view manager
        ├── OTAUpdater.swift        # (only when updates config is set)
        ├── LaunchScreen.storyboard # (only when splash config is set)
        ├── Info.plist              # iOS Info.plist
        ├── Info-macOS.plist        # (only when macos(...) is configured)
        └── Assets.xcassets/
            ├── AppIcon.appiconset/
            └── Splash.imageset/    # (only when splash.image is set)
```

The project is always **fully regenerated from scratch** when the config hash changes — there is no merge or patch step. You should add `.nativite/` to `.gitignore`.

### Dirty-checking

The generator SHA-256 hashes the normalised config (with plugins sorted by name for stability) and skips regeneration when the hash matches the previous run. Force a regeneration with `nativite generate --force`.

---

## Vite plugin

```ts
// vite.config.ts
import { nativite } from "nativite/vite";

export default defineConfig({
  plugins: [nativite()],
});
```

The plugin does the following:

- **Registers native platform environments** (`ios`, `ipad`, `macos`, plus plugin-defined ones) alongside `client`, each with `__PLATFORM__`, `__IS_NATIVE__`, and `VITE_NATIVITE` defines.
- **Resolves platform file extensions** using built-in suffix sets (`.ios/.mobile/.native`, `.macos/.desktop/.native`) or plugin-provided suffixes for custom platforms.
- **Auto-generates the Xcode project** when Apple targets are configured and the config hash changes.
- **Builds and launches Apple targets in dev** (iOS Simulator and/or macOS app), and runs third-party platform `dev` hooks when configured.
- **Writes `manifest.json`** to `dist-<platform>/` during production builds, then runs third-party platform `build` hooks when configured.

### Platform-specific files

Nativite resolves platform variants per native environment:

- iOS: `.ios.*` > `.mobile.*` > `.native.*` > base file
- macOS: `.macos.*` > `.desktop.*` > `.native.*` > base file
- custom platforms: plugin `extensions` order > base file

```
Button.tsx           ← used in browser
Button.ios.tsx       ← used in iOS native env
Button.mobile.tsx    ← fallback for iOS native env
Button.macos.tsx     ← used in macOS native env
```

### Global constants

Available in all your source files without an import:

| Constant        | Type                                                   | Example                       |
| --------------- | ------------------------------------------------------ | ----------------------------- |
| `__PLATFORM__`  | `"ios" \| "ipad" \| "macos" \| "web" \| (string & {})` | `"ios"`, `"web"`, `"android"` |
| `__IS_NATIVE__` | `boolean`                                              | `true` inside WKWebView       |
| `__DEV__`       | `boolean`                                              | `true` during `vite dev`      |

Add `nativite/globals` to your project's type declarations to get full TypeScript support for these constants:

```ts
// vite-env.d.ts
/// <reference types="vite/client" />
/// <reference types="nativite/globals" />
```

```ts
if (__IS_NATIVE__) {
  // Only runs inside the native WKWebView build
}
```

---

## Advanced usage

### Registering native plugin handlers (Swift)

In `AppDelegate.swift` or `ViewController.swift`, register handlers on the bridge:

```swift
bridge.register(namespace: "camera", method: "capture") { args, completion in
  // args contains whatever you passed from JS
  // call completion exactly once
  completion(.success(["url": "file:///..."]))
}
```

Then call from JavaScript:

```ts
const { url } = (await bridge.call("camera", "capture", { quality: 0.9 })) as { url: string };
```

### Default chrome (no flash of unstyled UI)

Set `defaultChrome` in your config to apply chrome state before the WebView has loaded its first frame:

```ts
export default defineConfig({
  defaultChrome: {
    navigationBar: {
      title: "Home",
      largeTitleMode: "always",
      barTintColor: "#1A1A2E",
    },
    tabBar: {
      items: [
        { id: "home", title: "Home", systemImage: "house.fill" },
        { id: "profile", title: "Profile", systemImage: "person.fill" },
      ],
    },
    statusBar: { style: "light" },
  },
});
```

### macOS support

Add `macos(...)` to your top-level `platforms` array and Nativite generates a second native target in the same Xcode project. All Swift source files are shared between platforms using `#if os(iOS)` / `#if os(macOS)` conditionals — you get a single project with two build targets.

```ts
import { defineConfig, ios, macos } from "nativite";

export default defineConfig({
  app: {
    name: "MyApp",
    bundleId: "com.example.myapp",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [ios({ minimumVersion: "17.0" }), macos({ minimumVersion: "14.0" })],
});
```

The macOS target:

- Creates an `NSWindow` with `WKWebView` (same bridge, same RPC protocol)
- Supports `chrome.window.*` for title bar customisation (title, subtitle, separator style, full-size content)
- Supports `chrome.menuBar.*` for building native `NSMenu` hierarchies with key equivalents
- Supports `chrome.sidebar.*` for sidebar item selection events
- iOS-only chrome elements (`navigationBar`, `tabBar`, `toolbar`, `statusBar`, `homeIndicator`, `sheet`, `keyboard`) are silently ignored on macOS
- Sets `--nk-is-desktop: 1`, `--nk-is-phone: 0`, `--nk-is-tablet: 0`
- No software keyboard variables (always zero on macOS)

During `nativite dev`, both the iOS Simulator and macOS app are launched automatically when both platforms are configured.

### OTA over-the-air updates

When `updates` is configured, the generated `OTAUpdater.swift` checks a platform-scoped manifest on every launch (`<updates.url>/ios/manifest.json` for iOS, `<updates.url>/macos/manifest.json` for macOS). If a newer bundle is available it downloads and applies it silently. The next launch serves the updated bundle from the local cache.

```ts
export default defineConfig({
  updates: {
    url: "https://updates.example.com/myapp",
    channel: "production",
  },
});
```

Deploy updates by uploading `dist-ios/` to `<updates.url>/ios/` and `dist-macos/` to `<updates.url>/macos/` (each including its generated `manifest.json`). For custom platforms, update distribution is handled by that platform's plugin.

---

## Package exports

| Import              | Contents                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `nativite`          | `defineConfig`, `ios`, `macos`, `platform`, `definePlatformPlugin`, `NativiteConfigSchema`, `NativiteConfig` type |
| `nativite/vite`     | `nativite()` plugin, `platformExtensionsPlugin`, re-exports `defineConfig`                                        |
| `nativite/client`   | `bridge`, `ota`                                                                                                   |
| `nativite/chrome`   | `chrome`, all chrome state/options types                                                                          |
| `nativite/css-vars` | `NKVars`, `NKVarName`                                                                                             |
| `nativite/globals`  | Ambient types for `__PLATFORM__`, `__IS_NATIVE__`, `__DEV__`                                                      |
| `nativite/cli`      | CLI entry point (`nativite` binary)                                                                               |

---

## Development

```bash
bun install

# Build the package
bun run build

# Run tests
bun test

# Type-check
bun run typecheck

# Lint
bun run lint

# Format
bun run fmt
```

Tests use Bun's built-in test runner. No additional test framework is required.

---

## Requirements

- **macOS** — required for the Xcode toolchain (`xcodebuild`, `xcrun simctl`)
- **Xcode 16+** with iOS 17 SDK
- **Node.js 18+** or **Bun 1.0+**
- **Vite 5+** (peer dependency, optional — only needed for the Vite plugin)
- **TypeScript 5+**

---

## Licence

MIT
