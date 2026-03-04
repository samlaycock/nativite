# iOS View Controller

> Maps to: `src/ios/templates/view-controller.ts`
> Generated file: `ViewController.swift`

The `ViewController` is the primary `UIViewController` that hosts the main `WKWebView` and orchestrates all native subsystems (bridge, chrome, vars, keyboard).

## UIKit Class Hierarchy

```
UIViewController
  └── ViewController
        ├── owns: NativiteWebView (WKWebView subclass)
        ├── owns: NativiteBridge
        ├── owns: NativiteChrome
        ├── owns: NativiteVars
        ├── owns: NativiteKeyboard
        ├── owns: NativiteChromeState (@Observable)
        └── optional: OTAUpdater
```

## Initialization (`viewDidLoad`)

1. Creates a `WKWebViewConfiguration` using `WKWebsiteDataStore.default()` for shared storage across all webviews (main + child webviews in sheets/drawers).
2. Detects the device type at runtime and sets the User-Agent suffix:
   - iPhone: `Nativite/ios/1.0`
   - iPad: `Nativite/ipad/1.0`
3. Registers the JS bridge message handler via `addScriptMessageHandler(bridge, name: "nativite")`.
4. Installs the `NativiteVars` user script at `documentStart` so CSS variables are available before any other script runs.
5. Creates a `NativiteWebView` (custom `WKWebView` subclass that enables input accessory override).
6. Disables automatic content inset adjustment (`contentInsetAdjustmentBehavior = .never`) and root scrolling to give web content full control over its layout.

## Content Loading (`loadContent`)

The view controller resolves what URL to load based on the current mode:

### Development Mode (DEBUG builds only)

Resolves the dev URL from multiple sources (in priority order):

1. `NATIVITE_DEV_URL` environment variable
2. `UserDefaults` stored dev URL
3. `dev.json` file in the app bundle

### Production Mode

Loads the embedded `dist/index.html` bundle, or if an OTA update is available, the active OTA bundle.
Release builds do not attempt dev URL resolution.

## Platform Validation

After loading, the view controller reads `dist/manifest.json` and validates the `platform` field matches the current target (iOS/iPad or macOS). This prevents accidentally running an Android bundle on iOS.

## System Integration

### Status Bar

Overrides `preferredStatusBarStyle` and `prefersStatusBarHidden` to read from the `NativiteChromeState` model, allowing JavaScript to control the status bar appearance.

### Home Indicator

Overrides `prefersHomeIndicatorAutoHidden` from `chromeState`, enabling JavaScript to hide the home indicator gesture area.

### Trait Collection Changes (iOS 17+)

Registers for trait collection changes using the modern `registerForTraitChanges` API:

- `UITraitUserInterfaceStyle` (dark mode)
- `UITraitPreferredContentSizeCategory` (Dynamic Type)
- `UITraitAccessibilityContrast` (high contrast)

On change, calls `NativiteVars.updateTraits()` to push updated CSS variables to the web content.

## Navigation & Link Handling

### `WKNavigationDelegate`

- **External links**: Any navigation to a different origin opens via `UIApplication.shared.open()` in the system browser.
- **On navigation completion**: Re-pushes safe area and trait CSS variables, then hides the splash overlay (`chromeState.splashVisible = false`).

### `WKUIDelegate`

- Handles `window.open()` calls by either opening externally or loading in the same webview depending on the URL.

## Bridge Wiring

All subsystems are wired together during initialization:

```
bridge.viewController = self
vars.webView = webView
vars.observeSystemEvents()
keyboard.install(on: webView)
chrome.chromeState = chromeState
```

## Default Chrome

If the configuration includes a `defaultChrome` state, it is applied before content loads to ensure native UI is visible from the first frame (avoids flash of empty chrome).

## OTA Updates

On load, the view controller:

1. Calls `otaUpdater.applyPendingUpdateIfAvailable()` to switch to any staged bundle.
2. Calls `otaUpdater.checkForUpdate()` to fetch and stage the next update in the background.
