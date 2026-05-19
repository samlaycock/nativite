# nativite

## 0.2.0

### Minor Changes

- 2c9dcb9: Add the initial Android QuickJS background task runtime adapter, generate the runtime dependency when background tasks are configured, and update generated Android projects to target SDK 36 with AGP 8.13.2/Kotlin 2.3.20.
- 9f0531b: Add Android WorkManager background task execution for generated background task manifests, including generated scheduling helpers, a CoroutineWorker runtime path, Android option validation, and WorkManager dependency generation.
- d180139: Add the first-party `nativite/plugins/app-integrity` plugin with iOS App Attest and Android Play Integrity bridge APIs, native generation contributions, package exports, and documentation.
- fd80496: Implement the first stable background task host context contract with result semantics, task-scoped storage, logging hooks, cancellation placeholders, and versioned native persisted task-state models that use the public `BackgroundTaskStatus` keys.
- 4f909f6: Generate native background task manifest resources for configured JavaScript background tasks.
- d81e7ee: Add the `nativite/background` public API for defining JavaScript background tasks, registering task entrypoints in Nativite config, and creating metadata manifests without serializing task runners.
- fdf6448: Add the public `background` WebView API for scheduling, cancelling, and querying registered background tasks through native bridge handlers.
- a83446d: Add the first-party `nativite/plugins/calendar` plugin with typed calendar, event, and reminder APIs, native iOS/Android source contributions, generated platform permissions, public package exports, and documentation.
- 5b502b4: Add the first-party `nativite/plugins/capture-protection` plugin with typed helpers, Android `FLAG_SECURE` capture prevention, iOS screenshot and capture-status detection, package exports, tests, and docs.
- c8f0ef3: Add the first-party `nativite/plugins/contacts` plugin with typed JavaScript helpers, native source contributions, permission manifest generation, docs, and public package exports.
- 4112727: Add declarative title bar web component support to `nativite/chrome` via `registerWebComponents()`.

  This introduces v1 custom elements for title bar authoring (`nv-titlebar`, `nv-title`, `nv-leadingitems`, `nv-trailingitems`, and `nv-button`) with automatic lifecycle setup/cleanup and DOM-driven updates while preserving the existing imperative chrome APIs.

- f837ecf: Add desktop web engine selection with macOS Chromium generation support, while keeping the system web engine as the default and rejecting mobile Chromium configuration.
- ee6c10d: Define the first-party plugin platform support matrix and register generated macOS unsupported stubs for first-party plugin namespaces without macOS native implementations.
- 2ac7f25: Implement the initial iOS background task runtime with BGTaskScheduler registration, Info.plist task identifiers, JavaScriptCore bundle execution, iOS task kind validation, native tests, and iOS documentation.
- fedea0e: Add the first-party `nativite/plugins/local-auth` plugin with typed local authentication helpers, native iOS and Android bridge contributions, generated Face ID/biometric manifest configuration, and documentation.
- db27737: Add macOS as a first-class `nativite test` platform with Apple tooling preflight, Vitest provider support, generated project smoke coverage, and updated platform testing docs.
- d8eed6e: Add `nativite test` to orchestrate native-aware app tests through Vitest Browser Mode with generated Nativite provider configuration.
- 7fca901: Add the local native test coordinator used by `nativite test`, including per-run session tokens, harness registration validation, command routing, artifact/log handling, and launch fallback guidance.
- 24847d2: Add generated native test harness support for iOS, macOS, and Android debug/test builds. Harness builds can load a test URL, register with a local coordinator using a per-run session token, and report native and WebView readiness without changing release bundle behavior.
- 5682d78: Add a first-party `nativite/plugins/notifications` plugin with typed local notification APIs, native iOS and Android bridge contributions, generation permissions, package exports, and documentation.
- bbba412: Add plugin contribution hooks for generated assets, platform metadata, app lifecycle startup, extra build entries, and Android version-catalog dependencies, then move background scheduler bridge registration behind an internal plugin contribution.
- 8160d9f: Add the first-party `nativite/plugins/secure-store` plugin with typed bridge helpers, Apple Keychain storage, Android Keystore-backed encrypted preferences, package exports, and documentation.
- 1d71166: Add the first-party `nativite/plugins/system-controls` plugin with typed helpers for keep-awake, orientation, app-scoped brightness, power status, native iOS/Android bridge implementations, package exports, and docs.
- 990be97: Add the `nativite/test` entrypoint with JavaScript stub-host helpers for app tests, chrome snapshot inspection, native event emission, bridge call mocking, and a separate coordinator-backed native harness command surface.
- 0337e3a: Add the public `nativite/vitest-browser-provider` entrypoint and wire `nativite test` generated configs to use the Vitest Browser Mode provider object.

### Patch Changes

- e7b9da0: Improve Android Gradle wrapper bootstrap diagnostics with an explicit Gradle preflight and actionable Java, Gradle, and Android SDK remediation steps.
- 5d5878b: Return structured unsupported status for Android OTA checks and document OTA as iOS/macOS-only for 1.0.
- dbc7791: Bundle registered background task entrypoints into native assets and reference the emitted files from generated background task manifests.
- 5510dc3: Add end-to-end background task examples, workflow documentation, troubleshooting notes, and generated-artifact smoke coverage.
- 16c5799: Make `nativite build` fail when the Nativite Vite plugin does not run or when expected web/native outputs are missing after a platform build.
- d1c6165: Add generated native app smoke test scripts and CI release gates for iOS, macOS, and Android projects.
  The smoke runner now also supports opt-in launch checks for macOS, booted iOS simulators, and connected Android devices or emulators, including a macOS startup observation window for immediate launch failures.
- e47dc75: Add a first-party `nativite/plugins/haptics` plugin with typed semantic haptic feedback helpers and iOS/Android native registrar contributions.
- 93ebdc4: Document the completed native-aware app testing roadmap across stub-host tests, Browser Mode support, native harness protocol, provider orchestration, CLI usage, and repository examples.
- 99cbbdb: Document the debug-only native test protocol for coordinator-backed `nativite/test` harness commands, including lifecycle, message envelopes, capabilities, transport, versioning, timeout, cancellation, and security requirements.
- 0837c9e: Document the Nativite 1.0 public API, semver, and support contract, including
  stable package exports, config, generated native project structure, NCLP/native
  bridge wire contracts, first-party plugin APIs, and CLI guarantees.
- 1aa8114: Run the full quality gate before release publishing and document the release gate.
- a842534: Align 1.0 documentation with Android SDK defaults and current Apple/Google Play release requirements.
- 535fc6d: Add fast fixture and CI guard coverage for the Nativite app testing stack, including stub-host examples, native provider examples, generated Android harness configuration, and the default-vs-native CI split.
- 5ebcb50: Document the recommended Nativite app testing strategy, add examples for regular Vitest, stub-host Browser Mode tests, and native provider execution, and expose authenticated native harness helpers for geometry, screenshots, and native logs.

## 0.1.0

### Minor Changes

- eb96e59: Add iOS native menu/submenu support to `ToolbarItem` button entries used by `chrome.toolbar` and `chrome.navigationBar`.

  `ToolbarItem` buttons now accept a `menu` object with nested `submenu` items, and the generated `NativiteChrome.swift` template now builds recursive `UIMenu`/`UIAction` trees so menu selections emit the existing `toolbar.buttonTapped` / `navigationBar.buttonTapped` events by item id.

- adb775d: Add sheet header chrome with `title`, `leadingItems`, and `trailingItems` support across the shared API, Android runtime, and iOS runtime.

  The change also emits `sheet.leadingItemPressed` and `sheet.trailingItemPressed` events so sheet header actions can be handled like other native chrome buttons.

- a743663: Add an optional `nativite dev` status dashboard that checks the Vite dev server URL, reports configured native platform project paths, and points developers back to the existing Vite and native IDE workflows.
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

- de81fb5: Add repeatable `nativite init --platform` selection and narrow host-aware defaults so generated configs no longer enable every first-party platform automatically.
- 117d401: Add validated native icon and splash asset generation with deterministic platform output names and asset-content generation hashing.
- 3027cd0: Improve native dev server discovery by preserving explicit Vite host settings, writing local/network/device URL diagnostics to `.nativite/dev.json`, and mirroring Android emulator, physical device, and USB reverse hints into debug assets.
- 982e9cc: Add `nativite init` to generate a minimal Nativite config for existing Vite projects and safely add the Nativite Vite plugin when the Vite config can be edited unambiguously.
- 3375295: Implement NCLP v2 chrome snapshots and shell readiness handling.

  The JavaScript chrome runtime now waits for validated `shell.ready`, compiles merged chrome state into versioned `chrome.snapshot` messages, filters unsupported host areas, emits state buckets for selected/disabled/hidden/badges/values, and maps incoming `chrome.event` envelopes back to the existing `ChromeEvent` API. iOS and Android shells now advertise supported areas, validate and revision-gate snapshot envelopes, enforce graph invariants and size caps, adapt snapshots to the current native renderer state shape, and preserve full NCLP node identity for native interaction events.

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

- 193576b: Add production OTA safeguards for Apple runtimes, including signed manifest verification, HTTPS enforcement, app-version gating, and rollback handling for failed first launches.
- a50c90c: Expose chrome platform capability helpers and warn when app code configures chrome areas unsupported by the active native runtime.
- 2d359a6: Remove the public `nativite dev` command and the associated terminal-owned native build, launch, hotkey, status polling, and dev URL resolver implementation. Generated debug native projects continue to use Vite dev server routing and `.nativite/dev.json`.
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

- 78026da: Align Android `shell.ready` chrome capabilities with the areas rendered by the Compose chrome root.
- 6d8dce4: Wire Android debug builds to consume Vite dev server metadata by mirroring `.nativite/dev.json` into generated Android debug assets and removing stale metadata outside dev mode.
- e4176ba: Support Android native plugin contributions during project generation.

  Android plugins can now provide Kotlin/Java sources, resources, Gradle dependencies, and bridge registrars through `platforms.android`. Android registrar declarations can include fully-qualified Kotlin import paths so plugin registration functions compile when they live outside the generated app package.

- 21f87bc: Clarify that OTA bundle staging and application currently apply to iOS and macOS only, while Android OTA checks return `{ available: false }` until Android parity is implemented.
- 8850c8b: Document the Android native plugin contribution contract.

  Android Gradle project generation now includes plugin Kotlin sources, resources, dependencies, and a generated native registrant, so Android plugins are no longer silently ignored.

- 57f260e: Copy the Android production web bundle into generated Gradle assets for release builds.

  Generated Android projects now copy `dist-android` into Gradle-generated assets
  before `mergeReleaseAssets`, and release builds fail clearly if the web bundle is
  missing.

- 2867427: Add production-safe `bridge.call()` failure handling with timeout support, `AbortSignal` cancellation, structured `NativiteBridgeError` codes, and strict mode rejection when no native bridge is available.
- 907b24c: Fix OTA bridge/runtime behavior across generated native targets:

  - Android `NativiteBridge` now registers built-in `__nativite__.__ping__` and `__nativite__.__ota_check__` handlers so `ota.check()` no longer fails with "No handler" errors.
  - iOS/macOS `NativiteBridge` now wires `__ota_check__` to the OTA updater when updates are configured, returning live `{ available, version? }` status instead of a static placeholder.
  - `OTAUpdater` now uses `updates.channel` when resolving manifest/assets (`/<channel>/<platform>/...`) with fallback to the legacy `/<platform>/...` path.
  - OTA status now reports staged updates and persists staged version metadata for bridge status responses.
  - Added regression tests and updated OTA/bridge docs to match the generated behavior.

- c2e7735: Print concise post-build next steps from `nativite build` after all requested platform builds succeed.
- 5494e98: Simplify the documented native setup around `nativite build`, and report generated native project and web bundle paths after each platform build.
- 5b07eba: Allow built-in platform helpers to be called without config by applying default iOS, macOS, and Android SDK settings during config normalization.
- f3cba52: Cache platform-extension import resolution results and invalidate affected entries from Vite watcher events.
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

- fac74cd: Clarify that `nativite build` prepares production native projects and embedded web bundles, while final signed app-store artifacts are produced by native toolchains or CI.
- 3d16b5c: Rework onboarding docs around the shortest path from an existing Vite app to a generated native shell.
- 44f2a4f: Prefer explicit native platform request markers for dev server environment routing while retaining User-Agent fallback support.
- 1ee89cd: Make `nativite init` update common Vite config shapes, including plugin variables, multiline plugin arrays, missing plugin properties, and `mergeConfig` override objects.
- eb96e59: Add a small visual gap between the iOS keyboard and `chrome.keyboard` input accessory bar.

  The generated `NativiteKeyboard.swift` template now separates toolbar height from total accessory height and reserves a fixed gap so accessory controls are no longer flush against the keyboard.

- a47e3f1: Fix CSS custom properties not being set in iOS/macOS WKWebView.

  The `buildInitScript()` function in `NativiteVars.swift` was embedding Swift multi-line string literals (`defaults` and `devOverlayInsets`) directly into a single-quoted JavaScript string. Multi-line strings contain literal newlines, which are invalid inside a JS single-quoted string literal, causing a silent syntax error in `WKUserScript`. This prevented the `<style>` element from being created and `window.__nv_patch` from being defined, so no `--nv-*` CSS variables were ever given a value in the WebView.

  The fix collapses both strings to a single line (stripping newlines and surrounding whitespace) before embedding them in the JS, so the generated script is always syntactically valid.

- d6ee04d: Add per-item tint support for navigation items and apply navigation/button tint consistently in native chrome renderers.
- 1bc16ac: Fix the published package layout for first-party native runtime templates.

  Swift and Kotlin runtime templates are now copied to `dist/runtime`, matching the path used by the bundled platform generators when generating iOS, macOS, and Android projects from the published package.

- 0ae894e: Add fixture-based native build tests that exercise real Vite apps, platform HTML entries, source variants, build manifests, and generated iOS/macOS project output.
- 9b96aab: Align CSS variable injection across platforms.

  Android now seeds the full shared `NVVarName` surface, updates safe-area values from system insets, and refreshes keyboard values during IME animation. The Apple runtimes stop emitting undocumented `--nv-sidebar-*` defaults so the runtime variable set matches the public JavaScript contract.

- 05856cd: Refactor platform runtime integration so built-in Apple platforms run through the platform plugin system:

  - add first-party `nativite-ios` and `nativite-macos` platform plugins with built-in extension/environments metadata and generate/dev/build hooks.
  - resolve all configured platforms through plugin lookup in the platform registry, removing dedicated built-in runtime branching.
  - route CLI and Vite lifecycle execution through `runtime.plugin` hooks consistently, including richer hook context (`rootConfig`, generate `mode`).
  - harden generation stale checks in `generateProject` so legacy Xcode project metadata triggers regeneration even when the config hash is unchanged.
  - reserve `ios`/`macos` platform plugin identifiers in config validation so first-party platform plugins cannot be overridden accidentally.

- d8759fd: Export `createCliProgram()` from `nativite/cli` and keep command-line parsing limited to the `nativite` executable entrypoint.
- 54f8b96: Hash OTA manifests from asset contents and include per-asset SHA-256 hashes and sizes so native runtimes can validate downloaded bundle bytes.
- a47e3f1: Fix native dev HMR behavior so React Fast Refresh can run on native variant edits without forced full page reloads.

  - Replace native variant `full-reload` broadcasting with bridged `update` payloads sent to the client HMR channel.
  - Keep native-only hot updates deduped per file-change token to avoid duplicate HMR broadcasts.
  - Add regression tests that assert native variant updates emit `update` payloads instead of forced `full-reload`.

- 9dcc265: Resolve local and package plugin files from their module directory when `definePlugin` or `definePlatformPlugin` receive `import.meta.url`.
- d69f1c9: Forward native chrome event envelopes through `nativite/client` unchanged so `chrome.on("titleBar.menuItemPressed")`, `chrome.on("toolbar.menuItemPressed")`, and `chrome.on("menuBar.itemPressed")` handlers receive menu item taps when the client bridge is imported.
- bb12f18: Run the iOS and Android native runtime test suites in GitHub Actions, and keep
  the iOS Swift runtime harness compilable on macOS by gating iOS-only sheet
  toolbar APIs.
- 67127d9: Wire iOS `errorOverlay` config into Vite dev overlay defaults and validate Android `targetSdk` values.

  - `nativite/vite`: when `NATIVITE_DEV_ERROR_OVERLAY` is not set, the plugin now reads `ios({ errorOverlay })` from `nativite.config.ts` to decide the default Vite HMR overlay setting.
  - `NATIVITE_DEV_ERROR_OVERLAY` remains the highest-precedence override for forcing overlay on/off.
  - Config schema now requires `android.targetSdk` (when provided) to be an integer.
  - Added regression tests for both behaviors and updated docs.

- 79f561d: Fix CommonJS package exports for the root, Vite, and CLI entrypoints by avoiding
  build output cycles and guarding CLI execution when imported.
- 1821157: Define the 1.0 public package API contract by making package exports ESM-only, keeping the CLI binary-only, and documenting that deep imports are unsupported.
- a9ab4c6: Add Bun scripts for running the native iOS Swift and Android Kotlin runtime test suites.
- 2a93700: Improve public release metadata, contribution guidance, TypeScript input scoping, test layout hygiene, and internal Nativite webview instance naming.
- 6ffd2dc: Move TypeScript from peer dependencies to development dependencies because
  Nativite does not import or require the consumer's TypeScript compiler at
  runtime.
- 5e7e018: Include generated runtime and template contents in native project dirty-check hashes so package upgrades regenerate stale iOS, macOS, and Android projects.
- dff8bf6: Use secure Android WebView mixed-content defaults by allowing mixed content only in debug builds and blocking it in release builds.
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

- f925de9: Document NCLP v2 as the stable public host wire protocol for Nativite 1.0.

  The README, Chrome API docs, and NCLP reference now distinguish the app-facing JavaScript chrome API from the host-facing wire protocol contract, define NCLP v2 compatibility and versioning rules, and clarify capability negotiation through `shell.ready areas`. A regression test now covers the stable `chrome.snapshot` envelope emitted by the JavaScript runtime.

- a47e3f1: Fix iOS splash behavior so a splash overlay remains visible until the first web page load finishes.

  - Show a dark-mode-aware default splash overlay on iOS when `config.splash` is not provided.
  - Add a centered loading spinner to the default splash overlay.
  - Keep the splash overlay visible until `WKWebView` `didFinish` fires.
  - Render the configured splash image in the runtime overlay when `config.splash.image` is set.
  - Add regression tests for the iOS splash overlay lifecycle.

- a9ab4c6: Reorganise native platform template sources into `src/native/<platform>` and update generator imports and docs to match.
- a47e3f1: Fix external link handling in generated native WebViews:

  - iOS and macOS ViewController templates now intercept link-activated and new-window (`target="_blank"`) navigations in `WKWebView`.
  - HTTP(S) links that leave the current in-app origin now open in the device default browser instead of silently doing nothing.

- 1ad80ac: Add typed bridge contracts for native plugin authors and app code.
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
