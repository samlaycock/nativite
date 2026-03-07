# nativite

## 1.0.0

### Major Changes

- cfbe0e1: Simplify the public API surface by removing redundant and internal exports.

  ### Removed from `nativite/chrome`

  - `button(...)`
  - `navItem(...)`
  - `menuItem(...)`
  - `_handleIncoming(...)`
  - `_resetChromeState()`
  - `_drainFlush()`

  Use plain object literals for chrome items instead of constructor wrappers.

  ### Removed from `nativite/vite`

  - `defineConfig` re-export
  - `platformExtensionsPlugin` export

  Only `nativite()` and supporting types are now exported from `nativite/vite`.

  ### Removed from `nativite`

  The following internal wire/build types are no longer exported:

  - `BridgeCallMessage`
  - `BridgeEventMessage`
  - `JsToNativeMessage`
  - `NativeToJsMessage`
  - `DevJson`
  - `BuildManifest`

  ### Renamed export

  - `nativite/css-vars` → `nativite/css`

  ### Documentation alignment

  - CLI docs now reflect the currently supported command surface.
  - Chrome docs now use plain object literals instead of removed constructor helpers.

- a47e3f1: Refactor `chrome` API to singleton instance API with named setters and explicit `on*` subscriptions.

  ## Breaking Changes

  The per-element function call API (`chrome.navigationBar(opts)`, `chrome.toolbar(opts)`, etc.) has been replaced with a singleton namespace API. Each chrome element is now accessed as a property of `chrome` with dedicated methods for state updates and event subscriptions.

  ### Before

  ```typescript
  chrome.navigationBar({
    title: "Settings",
    toolbarRight: [
      { type: "button", id: "save", title: "Save", style: "done" },
    ],
    onButtonTap: ({ id }) => console.log("Tapped:", id),
  });

  chrome.tabBar({
    items: [{ id: "home", title: "Home", systemImage: "house.fill" }],
    onSelect: ({ id }) => navigate(id),
  });
  ```

  ### After

  ```typescript
  chrome.navigationBar.setTitle("Settings");
  chrome.navigationBar.setToolbarRight([
    { type: "button", id: "save", title: "Save", style: "done" },
  ]);
  chrome.navigationBar.show();

  const unsub = chrome.navigationBar.onButtonTap(({ id }) =>
    console.log("Tapped:", id)
  );
  unsub(); // unsubscribe when done

  chrome.tabBar.setTabs([
    { id: "home", title: "Home", systemImage: "house.fill" },
  ]);
  chrome.tabBar.show();
  const unsubTab = chrome.tabBar.onSelect(({ id }) => navigate(id));
  ```

  ## API Reference

  Each element exposes a consistent set of methods:

  - **`show()` / `hide()`** — control visibility (sheet uses `present()` / `dismiss()`)
  - **Named content setters** — `setTitle()`, `setTabs()`, `setActiveTab()`, `setItems()`, etc.
  - **`configure(opts)`** — set appearance/styling properties (tint colour, translucency, etc.)
  - **`on*` subscriptions** — `onButtonTap()`, `onSelect()`, `onTextChange()`, etc. Each returns an unsubscribe function

  ### `chrome.navigationBar`

  `show()`, `hide()`, `setTitle(title)`, `setToolbarLeft(items)`, `setToolbarRight(items)`, `configure({ tintColor, barTintColor, translucent, backButtonTitle, largeTitleMode })`, `onButtonTap(handler)`, `onBackTap(handler)`

  ### `chrome.tabBar`

  `show()`, `hide()`, `setTabs(items)`, `setActiveTab(id)`, `configure({ tintColor, unselectedTintColor, barTintColor, translucent })`, `onSelect(handler)`

  ### `chrome.toolbar`

  `show()`, `hide()`, `setItems(items)`, `configure({ barTintColor, translucent })`, `onButtonTap(handler)`

  ### `chrome.statusBar`

  `show()`, `hide()`, `setStyle("light" | "dark")`

  ### `chrome.homeIndicator`

  `show()`, `hide()`

  ### `chrome.searchBar`

  `setText(text)`, `setPlaceholder(placeholder)`, `configure({ barTintColor, showsCancelButton })`, `onTextChange(handler)`, `onSubmit(handler)`, `onCancel(handler)`

  ### `chrome.sheet`

  `present()`, `dismiss()`, `setDetents(detents)`, `setSelectedDetent(detent)`, `configure({ grabberVisible, backgroundColor, cornerRadius })`, `onDetentChange(handler)`, `onDismiss(handler)`

  ### `chrome.keyboard`

  `setAccessory(accessory | null)`, `configure({ dismissMode })`, `onAccessoryItemTap(handler)`

  ### `chrome.sidebar`

  `show()`, `hide()`, `setItems(items)`, `setActiveItem(id)`, `onItemSelect(handler)`

  ### `chrome.window`

  `setTitle(title)`, `setSubtitle(subtitle)`, `configure({ titlebarSeparatorStyle, titleHidden, fullSizeContent })`

  ### `chrome.menuBar`

  `setMenus(menus)`, `onItemSelect(handler)`

  ## Other Changes

  - State is **merged** across calls to the same element — calling `setTitle("Hello")` then `setToolbarRight([...])` preserves the title in subsequent bridge sends.
  - `*Options` types removed from public API (`NavigationBarOptions`, `TabBarOptions`, etc.). Use the corresponding `*State` types with named setters instead.
  - New `Unsubscribe` type exported: `() => void`.
  - `chrome.on()`, `chrome.off()`, and `chrome.set()` are unchanged.

### Minor Changes

- eb96e59: Add iOS native menu/submenu support to `ToolbarItem` button entries used by `chrome.toolbar` and `chrome.navigationBar`.

  `ToolbarItem` buttons now accept a `menu` object with nested `submenu` items, and the generated `NativiteChrome.swift` template now builds recursive `UIMenu`/`UIAction` trees so menu selections emit the existing `toolbar.buttonTapped` / `navigationBar.buttonTapped` events by item id.

- 477c095: Add new Vite-injected compile-time platform family globals driven by platform
  plugin traits:

  - `__IS_NATIVE__`
  - `__IS_MOBILE__`
  - `__IS_DESKTOP__`

  Extend `definePlatformPlugin()` with optional trait flags:

  - `native`
  - `mobile`
  - `desktop`

  The platform registry now serializes these traits into
  `NATIVITE_PLATFORM_METADATA`, and the Vite plugin consumes that metadata so
  `__IS_NATIVE__`, `__IS_MOBILE__`, and `__IS_DESKTOP__` are driven by platform
  plugin declarations in normal CLI-driven builds/dev.

  Trait defaults when omitted are:

  - `native: true`
  - `mobile: false`
  - `desktop: false`

- 3cc42d6: Add platform-specific root HTML entry support to `nativite/vite`.

  For native targets, the Vite plugin now resolves `index.<platform>.html`
  variants (for example `index.ios.html`, `index.mobile.html`, `index.native.html`)
  before falling back to `index.html`.

  In native builds, the resolved platform HTML entry is wired as the Rollup
  `index` input while preserving the emitted output filename as `index.html`.
  In dev, native WebView HTML document requests are rewritten to the same resolved
  platform HTML entry when one exists.

- 05856cd: Expand `chrome.sheet` into a functional sheet-webview surface on iOS.

  ## Added

  - `chrome.sheet.setURL(url)` to load URL content inside the sheet webview.
    - Relative URLs are resolved against the current main webview URL.
  - `chrome.sheet.postMessage(message)` to send messages from the main webview context to the sheet webview.
  - `chrome.sheet.onMessage(handler)` and new `sheet.message` event payloads to receive messages from the sheet webview.
  - `chrome.sheet.onLoadFailed(handler)` and `sheet.loadFailed` event payloads for native load diagnostics.
  - `window.nativiteSheet` ambient typing for sheet-webview JavaScript messaging.

  ## Changed

  - `small` detent is now supported in iOS native detent mapping for `setDetents` and `setSelectedDetent`.
  - iOS sheet implementation now mounts a dedicated `NativiteWebView` (with bridge parity) rather than a blank controller, while keeping existing detent + dismiss events.
  - Root-prefixed sheet URLs (for example `"/sheet"`) now bootstrap as SPA routes in bundled `file://` mode by loading `dist/index.html` and applying the route via the History API.
  - Dev-server native request routing now preserves HTML document navigations for sheet routes so `"/sheet"` is served as HTML instead of being misclassified as a module transform.
  - `__chrome__` bridge mutations are now accepted only from the primary app webview, so using `chrome.*` inside the sheet webview can no longer mutate parent app chrome state.
  - Primary and sheet webviews now use transparent backgrounds over `systemBackground`, so pre-render blank/loading states follow light/dark mode instead of flashing white in dark mode.
  - Sheet-hosted `NativiteWebView` instances now opt out of root scroll locking and keep scroll interaction enabled, and sheet scrolling no longer always expands detents from content drags. This restores reliable tap/scroll interactivity inside sheet web content.
  - Sheet webview scrolling now disables rubber-band bounce (`bounces = false`) to prevent content moving beyond viewport bounds.
  - `chrome.sheet.postMessage(...)` now routes to `window.nativiteSheet.postMessage(...)` when called from inside the sheet context, so sheet-to-host messaging works with either API style.

  ## Notes

  - macOS continues to ignore `sheet` chrome keys in this phase.

- 016ca76: Add `tabBottomAccessory()` factory function for iOS 26 `tabViewBottomAccessory` support.

  ## Added

  - `tabBottomAccessory(config)` factory function to declare a persistent child webview between tab content and the tab bar.
  - `TabBottomAccessoryConfig` type extending `ChildWebviewBase` with `url`, `presented`, and `backgroundColor` properties.
  - `tabBottomAccessory.presented`, `tabBottomAccessory.dismissed`, and `tabBottomAccessory.loadFailed` chrome events.
  - Native iOS template: `NativiteTabBottomAccessoryController` child webview positioned above the tab bar, with URL loading, SPA routing, and messaging support.

### Patch Changes

- 907b24c: Fix OTA bridge/runtime behavior across generated native targets:

  - Android `NativiteBridge` now registers built-in `__nativite__.__ping__` and `__nativite__.__ota_check__` handlers so `ota.check()` no longer fails with "No handler" errors.
  - iOS/macOS `NativiteBridge` now wires `__ota_check__` to the OTA updater when updates are configured, returning live `{ available, version? }` status instead of a static placeholder.
  - `OTAUpdater` now uses `updates.channel` when resolving manifest/assets (`/<channel>/<platform>/...`) with fallback to the legacy `/<platform>/...` path.
  - OTA status now reports staged updates and persists staged version metadata for bridge status responses.
  - Added regression tests and updated OTA/bridge docs to match the generated behavior.

- 74d212f: Rename legacy `nk`-prefixed identifiers to `nv` equivalents across native templates, runtime helpers, tests, and documentation.

  This includes:

  - CSS custom properties (`--nv-*`)
  - JS bridge helpers (`window.__nv_patch`, `__nv_vars__`)
  - Platform data attributes (`data-nv-platform`)
  - CSS variable helper exports (`NVVars`, `NVVarName`)

  This removes a legacy package-name prefix so generated variables are now aligned with the current naming convention.

- a47e3f1: Improve native development error-overlay behavior.

  - Add `ios({ errorOverlay: boolean })` config support for toggling Vite runtime error overlays in native dev WebViews.
  - In `nativite dev`, the selected platform's `dev.errorOverlay` setting now controls `server.hmr.overlay` (default remains disabled).
  - Keep Vite overlay controls inside native top/bottom insets so dismiss/action controls remain reachable when the overlay is enabled.
  - Add regression tests for config normalization, dev-server overlay toggling, and native overlay inset styling.

- eb96e59: Add a small visual gap between the iOS keyboard and `chrome.keyboard` input accessory bar.

  The generated `NativiteKeyboard.swift` template now separates toolbar height from total accessory height and reserves a fixed gap so accessory controls are no longer flush against the keyboard.

- a47e3f1: Fix CSS custom properties not being set in iOS/macOS WKWebView.

  The `buildInitScript()` function in `NativiteVars.swift` was embedding Swift multi-line string literals (`defaults` and `devOverlayInsets`) directly into a single-quoted JavaScript string. Multi-line strings contain literal newlines, which are invalid inside a JS single-quoted string literal, causing a silent syntax error in `WKUserScript`. This prevented the `<style>` element from being created and `window.__nv_patch` from being defined, so no `--nv-*` CSS variables were ever given a value in the WebView.

  The fix collapses both strings to a single line (stripping newlines and surrounding whitespace) before embedding them in the JS, so the generated script is always syntactically valid.

- 05856cd: Refactor platform runtime integration so built-in Apple platforms run through the platform plugin system:

  - add first-party `nativite-ios` and `nativite-macos` platform plugins with built-in extension/environments metadata and generate/dev/build hooks.
  - resolve all configured platforms through plugin lookup in the platform registry, removing dedicated built-in runtime branching.
  - route CLI and Vite lifecycle execution through `runtime.plugin` hooks consistently, including richer hook context (`rootConfig`, generate `mode`).
  - harden generation stale checks in `generateProject` so legacy Xcode project metadata triggers regeneration even when the config hash is unchanged.
  - reserve `ios`/`macos` platform plugin identifiers in config validation so first-party platform plugins cannot be overridden accidentally.

- a47e3f1: Fix native dev HMR behavior so React Fast Refresh can run on native variant edits without forced full page reloads.

  - Replace native variant `full-reload` broadcasting with bridged `update` payloads sent to the client HMR channel.
  - Keep native-only hot updates deduped per file-change token to avoid duplicate HMR broadcasts.
  - Add regression tests that assert native variant updates emit `update` payloads instead of forced `full-reload`.

- 67127d9: Wire iOS `errorOverlay` config into Vite dev overlay defaults and validate Android `targetSdk` values.

  - `nativite/vite`: when `NATIVITE_DEV_ERROR_OVERLAY` is not set, the plugin now reads `ios({ errorOverlay })` from `nativite.config.ts` to decide the default Vite HMR overlay setting.
  - `NATIVITE_DEV_ERROR_OVERLAY` remains the highest-precedence override for forcing overlay on/off.
  - Config schema now requires `android.targetSdk` (when provided) to be an integer.
  - Added regression tests for both behaviors and updated docs.

- a47e3f1: Fix native asset loading in both dev and build modes:

  - native dev middleware now bypasses direct static asset requests (like SVG image URLs) while still transforming module-style asset imports (`?import`, `?url`) and Vite HTML proxy module requests.
  - native dev middleware now treats explicit Vite module-query requests as authoritative even when WKWebView sends ambiguous `Sec-Fetch-Dest` / `Accept` headers.
  - native production builds now default to `base: "./"` (unless the user already set `base`) so `file://` WKWebView bundles resolve generated asset URLs correctly.
  - in DEBUG builds, the generated native ViewController now persists the resolved dev server URL in `UserDefaults`, so simulator app relaunches keep targeting the last known dev server even when launch-time env vars are absent.
  - in DEBUG builds, generated iOS/macOS WebViews now set `isInspectable = true` on supported OS versions so Safari Develop debugging works without manual native code edits.

- 00c2e53: Improve native CSS variable accuracy across platforms.

  - Android now reports `--nv-nav-*`, `--nv-tab-*`, and `--nv-toolbar-*` from measured Compose chrome geometry instead of fixed height guesses.
  - Android now updates device/orientation/theme flags (`--nv-is-phone`, `--nv-is-tablet`, `--nv-is-portrait`, `--nv-is-dark`, etc.) from runtime configuration changes.
  - iOS now uses consistent inset-top math (`safe-top + nav-height`) so `--nv-inset-top` no longer double-counts status bar height.
  - macOS now seeds appearance variables on startup and pushes chrome geometry with measured navigation height semantics.

- a47e3f1: Remove legacy/deprecated API compatibility paths and keep the supported API surface focused:

  - Stop synthesizing `app.platforms` in parsed config output. `platforms` is now the single source of truth for configured platforms.
  - Remove internal/runtime reliance on `config.app.platforms` across generation, Vite integration, plugin resolution, and platform override logic.
  - Remove the legacy bridge RPC fallback path that depended on `window.nativiteReceive` `response/error` messages.
  - Keep bridge RPC calls on the current `postMessageWithReply` API and use `window.nativiteReceive` for native push events only.
  - Update test fixtures and schema expectations to reflect the simplified, forward-only API model.

- a907be8: Enable Safari Web Inspector for SwiftUI-hosted child webviews on Apple platforms.

  `NativiteChromeState` now marks `NativiteChildWebView` instances as inspectable in `DEBUG` builds (`iOS 16.4+`, `macOS 13.3+`) so sheet/drawer/popover/app-window webviews appear in Safari Develop tools.

- a47e3f1: Fix iOS splash behavior so a splash overlay remains visible until the first web page load finishes.

  - Show a dark-mode-aware default splash overlay on iOS when `config.splash` is not provided.
  - Add a centered loading spinner to the default splash overlay.
  - Keep the splash overlay visible until `WKWebView` `didFinish` fires.
  - Render the configured splash image in the runtime overlay when `config.splash.image` is set.
  - Add regression tests for the iOS splash overlay lifecycle.

- a47e3f1: Fix external link handling in generated native WebViews:

  - iOS and macOS ViewController templates now intercept link-activated and new-window (`target="_blank"`) navigations in `WKWebView`.
  - HTTP(S) links that leave the current in-app origin now open in the device default browser instead of silently doing nothing.

- a907be8: Re-add the `nativite build` CLI command for production builds.

  - Added a production build command flow that loads configured runtimes, sets Nativite platform environment variables, and runs Vite in production mode.
  - `nativite build` now builds all configured platforms by default.
  - Added optional `--platform <platform>` targeting for single-platform builds.
  - Added unit tests for build command behavior and failure cases.
  - Updated docs to describe production build behavior and platform-specific output directories.
  - Tightened production vs dev native runtime behavior:
    - Apple copy phase now includes `dev.json` only for non-Release builds.
    - Android webview now gates dev URL resolution and WebView debugging by `BuildConfig.DEBUG`.
    - Android project generation now removes stale `assets/dev.json` outside dev mode.
