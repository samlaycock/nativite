# Nativite

Build native iOS, macOS, and Android apps using your existing web stack — React, Vue, Svelte, or plain TypeScript. Nativite wraps your Vite web app in a native WebView and gives you a typed JavaScript bridge to control native platform chrome, CSS variables that reflect live device state, and a CLI that generates and launches native projects automatically. You can also register third-party platform plugins for additional WebView shells.

> **Status:** Early development. The API is functional but not yet stable.

---

## How it works

```
your web app  ──→  Vite build  ──→  dist-<platform>/
                                      ↓
nativite.config.ts  ──→  nativite dev / Vite plugin hooks  ──→  Xcode / Gradle project (or platform plugin hooks)
                                                           ↓
                                                   Native WebView loads dist/
                                                           ↕
                                                     JS bridge (typed RPC)
                                                           ↕
                                                   NativiteBridge (Swift / Kotlin)
```

1. You write a web app with Vite. Nativite registers per-platform native Vite environments (`ios`, `ipad`, `macos`, `android`, plus plugin-defined environments) while `client` remains the web environment.
2. `nativite dev` (or the Vite plugin) generates native projects — an Xcode project for Apple targets, a Gradle project for Android, or calls `generate` hooks for third-party platform plugins.
3. The generated app loads a bundled `dist/` directory inside a native WebView (from `dist-<platform>/`). In dev mode it loads from the Vite dev server instead.
4. Your JavaScript talks to Swift/Kotlin over a typed async RPC bridge. Native chrome (title bars, navigation, toolbars, keyboards, etc.) is controlled declaratively by passing element descriptors to a stackable `chrome()` function — e.g. `chrome(titleBar({ title: "Home" }), navigation({ items: [...] }))`.

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
import { defineConfig, ios, macos, android } from "nativite";

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
    // android({ minSdk: 26 }),        // optional — adds an Android target
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
import { defineConfig, definePlatformPlugin, ios, macos, android, platform } from "nativite";

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
    // android({ minSdk: 26 }),              // optional — adds an Android target
  ],

  platformPlugins: [
    definePlatformPlugin({
      name: "electron-platform",
      platform: "electron",
      environments: ["electron"], // default: [platform]
      extensions: [".electron", ".desktop", ".native"], // default: [`.${platform}`, ".native"]
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
    titleBar: { title: "Home", largeTitleMode: "large" },
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
| `platforms`              | `NativitePlatformConfig[]`    | ✅       | Platform entries such as `ios({...})`, `macos({...})`, `android({...})`                                        |
| `plugins`                | `NativitePlugin[]`            | —        | Native bridge plugins (camera, location, etc.) — adds namespaces, Swift/Kotlin sources, and resources          |
| `platformPlugins`        | `NativitePlatformPlugin[]`    | —        | Third-party platform integration hooks                                                                         |
| `platform().overrides`   | `NativiteRootConfigOverrides` | —        | Per-platform root overrides (`app`, `signing`, `updates`, `plugins`, `defaultChrome`, `icon`, `splash`, `dev`) |
| `ios().minimumVersion`   | `string`                      | ✅       | iOS deployment target                                                                                          |
| `ios().target`           | `"simulator" \| "device"`     | —        | Optional iOS dev launch target                                                                                 |
| `ios().simulator`        | `string`                      | —        | Optional iOS Simulator name                                                                                    |
| `ios().errorOverlay`     | `boolean`                     | —        | Optional native dev runtime error overlay toggle (default: `false`)                                            |
| `macos().minimumVersion` | `string`                      | ✅       | macOS deployment target                                                                                        |
| `android().minSdk`       | `number`                      | ✅       | Android minimum SDK version                                                                                    |
| `android().targetSdk`    | `number`                      | —        | Android target SDK version (optional)                                                                          |
| `signing.ios.mode`       | `"automatic" \| "manual"`     | —        | iOS code signing mode                                                                                          |
| `signing.ios.teamId`     | `string`                      | —        | Apple Developer Team ID (iOS)                                                                                  |
| `signing.macos.mode`     | `"automatic" \| "manual"`     | —        | macOS code signing mode                                                                                        |
| `signing.macos.teamId`   | `string`                      | —        | Apple Developer Team ID (macOS)                                                                                |
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
  name: "electron-platform",
  platform: "electron",
  environments: ["electron"], // optional, defaults to ["electron"]
  extensions: [".electron", ".desktop", ".native"], // optional, defaults to [".electron", ".native"]
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

# Explicit dev server URL override (otherwise reads .nativite/dev.json)
npx nativite dev --url http://10.0.0.5:5173
```

---

## JavaScript API

### `nativite/client` — bridge & events

The core transport layer between your JavaScript and native code.

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

Control native platform chrome declaratively from JavaScript. The `chrome()` function takes element descriptors created by factory functions and returns a cleanup function. Layers stack — calling `chrome()` multiple times merges state, and cleanup restores only the areas declared in that call.

```ts
import {
  chrome,
  titleBar,
  navigation,
  toolbar,
  statusBar,
  homeIndicator,
  keyboard,
  sheet,
  button,
  navItem,
} from "nativite/chrome";

// Apply a layer of chrome — returns a cleanup function
const cleanup = chrome(
  titleBar({
    title: "Settings",
    largeTitleMode: "inline",
    trailingItems: [{ id: "save", label: "Save", style: "primary" }],
  }),
  navigation({
    items: [
      { id: "home", label: "Home", icon: "house.fill" },
      { id: "search", label: "Search", icon: "magnifyingglass" },
      { id: "profile", label: "Profile", icon: "person.fill" },
    ],
    activeItem: "home",
  }),
  statusBar({ style: "light" }),
  homeIndicator({ hidden: true }),
);

// Listen for events
const unsub = chrome.on("navigation.itemPressed", ({ id }) => {
  navigateTo(id);
});

// Cleanup removes this layer — other layers remain
cleanup();
unsub();
```

Title bar and toolbar buttons can expose native menus with nested submenus:

```ts
chrome(
  toolbar({
    items: [
      {
        id: "more",
        icon: "ellipsis.circle",
        menu: {
          items: [
            { id: "refresh", label: "Refresh" },
            {
              id: "sort",
              label: "Sort",
              children: [
                { id: "sort.date", label: "By Date" },
                { id: "sort.name", label: "By Name" },
              ],
            },
          ],
        },
      },
    ],
  }),
);
```

#### Factory functions

Each area of native chrome has a factory function that returns a `ChromeElement` descriptor:

| Factory                      | Config type                | Description                                                      |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------- |
| `titleBar(config)`           | `TitleBarConfig`           | Title, subtitle, leading/trailing buttons, search bar, tint      |
| `navigation(config)`         | `NavigationConfig`         | Primary navigation items (tab bar on mobile, sidebar on desktop) |
| `toolbar(config)`            | `ToolbarConfig`            | Bottom toolbar items and menus                                   |
| `sidebarPanel(config)`       | `SidebarPanelConfig`       | Collapsible sidebar with nested items (iPad/macOS)               |
| `statusBar(config)`          | `StatusBarConfig`          | Status bar style and visibility                                  |
| `homeIndicator(config)`      | `HomeIndicatorConfig`      | Home indicator visibility (iOS)                                  |
| `keyboard(config)`           | `KeyboardConfig`           | Input accessory toolbar, dismiss mode                            |
| `menuBar(config)`            | `MenuBarConfig`            | macOS menu bar menus                                             |
| `tabBottomAccessory(config)` | `TabBottomAccessoryConfig` | Webview accessory below the tab bar                              |

Named child webviews (each takes a name string and config):

| Factory                   | Config type       | Description                             |
| ------------------------- | ----------------- | --------------------------------------- |
| `sheet(name, config)`     | `SheetConfig`     | Modal bottom sheet with detents         |
| `drawer(name, config)`    | `DrawerConfig`    | Side drawer (leading or trailing)       |
| `appWindow(name, config)` | `AppWindowConfig` | macOS secondary window                  |
| `popover(name, config)`   | `PopoverConfig`   | Floating popover anchored to an element |

#### Item types

**`ButtonItem`** — used in title bar leading/trailing items, toolbar items, and keyboard accessory:

| Property   | Type                                    | Description                                      |
| ---------- | --------------------------------------- | ------------------------------------------------ |
| `id`       | `string`                                | Unique identifier                                |
| `label`    | `string?`                               | Visible label (omit when using icon alone)       |
| `icon`     | `string?`                               | SF Symbol (iOS/macOS) or Material Icon (Android) |
| `style`    | `"plain" \| "primary" \| "destructive"` | Semantic style                                   |
| `disabled` | `boolean?`                              | Greyed out                                       |
| `tint`     | `string?`                               | Custom foreground hex colour                     |
| `badge`    | `string \| number \| null`              | Badge overlay                                    |
| `menu`     | `MenuConfig?`                           | Dropdown menu attached to this button            |

**`BarItem`** — `ButtonItem | FlexibleSpace | FixedSpace`:

```ts
// Spacers:
{ type: "flexible-space" }
{ type: "fixed-space", width: 16 }
```

**`NavigationItem`** — used in `navigation()`:

| Property   | Type                       | Description                               |
| ---------- | -------------------------- | ----------------------------------------- |
| `id`       | `string`                   | Unique identifier                         |
| `label`    | `string`                   | Display label                             |
| `icon`     | `string`                   | Required icon (SF Symbol / Material Icon) |
| `subtitle` | `string?`                  | Secondary text (iOS 18+)                  |
| `badge`    | `string \| number \| null` | Badge overlay                             |
| `disabled` | `boolean?`                 | Greyed out                                |
| `role`     | `"search"?`                | iOS 18+ search tab                        |

**`MenuItem`** — used in menus and `menuBar()`:

| Property        | Type                       | Description                           |
| --------------- | -------------------------- | ------------------------------------- |
| `id`            | `string`                   | Unique identifier                     |
| `label`         | `string`                   | Display label                         |
| `icon`          | `string?`                  | Icon                                  |
| `disabled`      | `boolean?`                 | Greyed out                            |
| `checked`       | `boolean?`                 | Renders with a checkmark              |
| `style`         | `"plain" \| "destructive"` | Semantic style                        |
| `keyEquivalent` | `string?`                  | macOS shortcut (e.g. `"s"` for Cmd+S) |
| `children`      | `MenuItem[]?`              | Nested submenu                        |

#### Event subscription

Use `chrome.on()` to listen for native events. Returns an unsubscribe function.

```ts
// Typed — handler receives the correct event shape
const unsub = chrome.on("titleBar.trailingItemPressed", ({ id }) => {
  if (id === "save") saveChanges();
});

// Wildcard — fires for every chrome event
const unsubAll = chrome.on((event) => {
  analytics.track("chrome_event", { type: event.type });
});

unsub();
unsubAll();
```

#### Chrome events reference

| Event                           | Payload                        | Description                             |
| ------------------------------- | ------------------------------ | --------------------------------------- |
| `titleBar.leadingItemPressed`   | `{ id }`                       | A leading title bar button was pressed  |
| `titleBar.trailingItemPressed`  | `{ id }`                       | A trailing title bar button was pressed |
| `titleBar.menuItemPressed`      | `{ id }`                       | A title bar menu item was pressed       |
| `titleBar.backPressed`          | `{}`                           | The back button was pressed             |
| `titleBar.searchChanged`        | `{ value }`                    | Title bar search text changed           |
| `titleBar.searchSubmitted`      | `{ value }`                    | Title bar search submitted              |
| `titleBar.searchCancelled`      | `{}`                           | Title bar search cancelled              |
| `navigation.itemPressed`        | `{ id }`                       | A navigation item was pressed           |
| `navigation.backPressed`        | `{}`                           | Navigation back was pressed             |
| `navigation.searchChanged`      | `{ value }`                    | Navigation search text changed          |
| `navigation.searchSubmitted`    | `{ value }`                    | Navigation search submitted             |
| `navigation.searchCancelled`    | `{}`                           | Navigation search cancelled             |
| `sidebarPanel.itemPressed`      | `{ id }`                       | Sidebar item selected                   |
| `toolbar.itemPressed`           | `{ id }`                       | A toolbar button was pressed            |
| `toolbar.menuItemPressed`       | `{ id }`                       | A toolbar menu item was pressed         |
| `keyboard.itemPressed`          | `{ id }`                       | Keyboard accessory button pressed       |
| `menuBar.itemPressed`           | `{ id }`                       | macOS menu item selected                |
| `sheet.presented`               | `{ name }`                     | Sheet was presented                     |
| `sheet.dismissed`               | `{ name }`                     | Sheet was dismissed                     |
| `sheet.detentChanged`           | `{ name, detent }`             | Sheet dragged to a new detent           |
| `sheet.loadFailed`              | `{ name, message, code }`      | Sheet webview load failed               |
| `drawer.presented`              | `{ name }`                     | Drawer was presented                    |
| `drawer.dismissed`              | `{ name }`                     | Drawer was dismissed                    |
| `appWindow.presented`           | `{ name }`                     | App window was presented                |
| `appWindow.dismissed`           | `{ name }`                     | App window was dismissed                |
| `popover.presented`             | `{ name }`                     | Popover was presented                   |
| `popover.dismissed`             | `{ name }`                     | Popover was dismissed                   |
| `tabBottomAccessory.presented`  | `{}`                           | Tab bottom accessory was presented      |
| `tabBottomAccessory.dismissed`  | `{}`                           | Tab bottom accessory was dismissed      |
| `tabBottomAccessory.loadFailed` | `{ message, code }`            | Tab bottom accessory load failed        |
| `message`                       | `{ from, payload }`            | Inter-webview message received          |
| `safeArea.changed`              | `{ top, right, bottom, left }` | Safe area changed (load / rotation)     |

#### Child webviews (sheets, drawers, windows, popovers)

Named child webviews each load their own URL in a separate native webview. They are controlled declaratively — set `presented: true` to show, `false` (or remove the element) to dismiss.

```ts
// Present a sheet
const cleanup = chrome(
  sheet("details", {
    url: "/details",
    presented: true,
    detents: ["medium", "large"],
    activeDetent: "medium",
    grabberVisible: true,
  }),
);

// Listen for sheet events
chrome.on("sheet.dismissed", ({ name }) => {
  if (name === "details") cleanup();
});

// Present a drawer
chrome(
  drawer("settings", {
    url: "/settings",
    presented: true,
    side: "trailing",
    width: "medium",
  }),
);

// Present a macOS window
chrome(
  appWindow("editor", {
    url: "/editor",
    presented: true,
    title: "Editor",
    size: { width: 800, height: 600 },
    resizable: true,
  }),
);

// Present a popover anchored to a DOM element
chrome(
  popover("tooltip", {
    url: "/tooltip",
    presented: true,
    size: { width: 300, height: 200 },
    anchorElementId: "help-button",
  }),
);
```

#### Inter-webview messaging

Use `chrome.messaging` to communicate between the main webview and child webviews (sheets, drawers, etc.):

```ts
// From the main webview — send to a child by name
chrome.messaging.postToChild("details", { type: "init", theme: "light" });

// From the main webview — broadcast to all children
chrome.messaging.broadcast({ type: "themeChanged", dark: true });

// From a child webview — send to the parent
chrome.messaging.postToParent({ type: "ready" });

// Listen for incoming messages (works in both main and child webviews)
const unsub = chrome.messaging.onMessage((from, payload) => {
  console.log(`Message from ${from}:`, payload);
});
```

#### Splash screen control

Control when the splash screen hides. By default it auto-hides when the page finishes loading.

```ts
import { chrome } from "nativite/chrome";

// Must be called synchronously at module top level — before any async work
chrome.splash.preventAutoHide();

// Later, when your app is ready:
async function init() {
  await loadData();
  chrome.splash.hide();
}
```

#### Keyboard input accessory

A native toolbar rendered above the software keyboard, useful for custom "Done" buttons or form navigation:

```ts
const cleanup = chrome(
  keyboard({
    accessory: {
      items: [
        { id: "prev", icon: "chevron.up" },
        { id: "next", icon: "chevron.down" },
        { type: "flexible-space" },
        { id: "done", label: "Done", style: "primary" },
      ],
    },
    dismissMode: "interactive",
  }),
);

chrome.on("keyboard.itemPressed", ({ id }) => {
  if (id === "done") (document.activeElement as HTMLElement)?.blur();
});

// Remove the accessory bar
cleanup();
```

---

### `nativite/css-vars` — live device CSS variables

Nativite injects `--nk-*` CSS custom properties onto `:root` before any content renders, and keeps them live as the device state changes (rotation, dark mode, keyboard, Dynamic Type, etc.).

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
| `--nk-nav-depth`                                       | number        | Navigation stack depth                     |
| `--nk-title-collapse`                                  | `0\|1`        | Title bar collapsed state                  |
| `--nk-pop-gesture`                                     | `0\|1`        | Back swipe gesture in progress             |
| `--nk-sheet-visible`                                   | `0\|1`        | Sheet currently visible                    |
| `--nk-sheet-detent`                                    | number        | Current sheet detent fraction              |
| `--nk-is-dark` / `--nk-is-light`                       | `0\|1`        | Dark/light mode                            |
| `--nk-contrast`                                        | `0\|1`        | High contrast enabled                      |
| `--nk-reduced-motion`                                  | `0\|1`        | Reduce motion enabled                      |
| `--nk-reduced-transparency`                            | `0\|1`        | Reduce transparency enabled                |
| `--nk-accent-r/g/b`                                    | `0–255`       | System accent colour channels              |
| `--nk-accent`                                          | `rgb(…)`      | System accent colour                       |
| `--nk-font-scale`                                      | number        | Dynamic Type scale factor                  |
| `--nk-font-body` … `--nk-font-largeTitle`              | `px`          | All 11 Dynamic Type sizes                  |
| `--nk-is-phone` / `--nk-is-tablet` / `--nk-is-desktop` | `0\|1`        | Device class                               |
| `--nk-is-portrait` / `--nk-is-landscape`               | `0\|1`        | Orientation                                |
| `--nk-is-compact-width`                                | `0\|1`        | Compact horizontal size class              |
| `--nk-split-fraction`                                  | number        | Split view fraction (1 = full width)       |
| `--nk-display-scale`                                   | number        | Screen scale factor (2 or 3)               |
| `--nk-display-corner`                                  | `px`          | Display corner radius                      |

All variables have sensible defaults and are available immediately in both native and browser environments — you can use them freely during development without a native build.

---

## Project generation

When at least one built-in Apple platform is configured (`ios(...)` and/or `macos(...)`), `nativite dev` (or starting the Vite dev server) writes a complete, ready-to-open Xcode project under `.nativite/ios/`:

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

The generator SHA-256 hashes the normalised config (with plugins sorted by name for stability) and skips regeneration when the hash matches the previous run. Change the config or restart `nativite dev` to trigger regeneration.

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

- **Registers native platform environments** (`ios`, `ipad`, `macos`, `android`, plus plugin-defined ones) alongside `client`, each with `__PLATFORM__`, `__IS_NATIVE__`, and `VITE_NATIVITE` defines.
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
| `__IS_NATIVE__` | `boolean`                                              | `true` inside native WebView  |
| `__DEV__`       | `boolean`                                              | `true` during `vite dev`      |

Add `nativite/globals` to your project's type declarations to get full TypeScript support for these constants:

```ts
// vite-env.d.ts
/// <reference types="vite/client" />
/// <reference types="nativite/globals" />
```

```ts
if (__IS_NATIVE__) {
  // Only runs inside the native WebView build
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
    titleBar: {
      title: "Home",
      largeTitleMode: "large",
      tint: "#1A1A2E",
    },
    navigation: {
      items: [
        { id: "home", label: "Home", icon: "house.fill" },
        { id: "profile", label: "Profile", icon: "person.fill" },
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
- Supports `titleBar()` for window title bar customisation (title, subtitle, separator style, full-size content)
- Supports `menuBar()` for building native `NSMenu` hierarchies with key equivalents
- Supports `sidebarPanel()` for sidebar item selection events
- iOS-only chrome elements (`navigation`, `toolbar`, `statusBar`, `homeIndicator`, `keyboard`) are silently ignored on macOS
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

| Import              | Contents                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `nativite`          | `defineConfig`, `ios`, `macos`, `android`, `platform`, `definePlatformPlugin`, `definePlugin`, `NativiteConfigSchema`, all types |
| `nativite/vite`     | `nativite()` plugin                                                                                                              |
| `nativite/client`   | `bridge`, `ota`                                                                                                                  |
| `nativite/chrome`   | `chrome`, factory functions (`titleBar`, `navigation`, `toolbar`, etc.), all chrome types                                        |
| `nativite/css-vars` | `NKVars`, `NKVarName`                                                                                                            |
| `nativite/utils`    | `platform()`, `web()`, `ios()`, `android()`, `macos()`, `windows()`, `linux()` — platform-specific value selection helpers       |
| `nativite/globals`  | Ambient types for `__PLATFORM__`, `__IS_NATIVE__`, `__DEV__`                                                                     |
| `nativite/cli`      | CLI entry point (`nativite` binary)                                                                                              |

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
