# iOS SwiftUI Chrome State Model

> Maps to: `src/ios/templates/nativite-chrome-state.ts`
> Generated file: `NativiteChromeState.swift`

The Chrome State model bridges imperative UIKit chrome reconciliation with declarative SwiftUI views using the `@Observable` macro.

## Architecture

```swift
@Observable
class NativiteChromeState {
    // Published properties that SwiftUI views observe
    // Updated by NativiteChrome, read by SwiftUI modifiers
}
```

## State Properties

### Status Bar (iOS)

| Property          | Type                  | Description                       |
| ----------------- | --------------------- | --------------------------------- |
| `statusBarHidden` | `Bool`                | Whether the status bar is hidden  |
| `statusBarStyle`  | `StatusBarStyleValue` | `.default_`, `.light`, or `.dark` |

### Home Indicator (iOS)

| Property              | Type   | Description                          |
| --------------------- | ------ | ------------------------------------ |
| `homeIndicatorHidden` | `Bool` | Whether the home indicator is hidden |

### Splash Overlay (iOS)

| Property        | Type   | Description                                                                    |
| --------------- | ------ | ------------------------------------------------------------------------------ |
| `splashVisible` | `Bool` | Starts `true`, set `false` on page load or manually via `chrome.splash.hide()` |

If the developer calls `chrome.splash.preventAutoHide()` at module top level, the `didFinish` handler skips setting `splashVisible = false`. The splash stays visible until `chrome.splash.hide()` sends the `__chrome_splash_hide__` bridge message. See [Splash Screen Control](../shared/splash-screen.md).

### Title Bar

| Property                 | Type              | Description                       |
| ------------------------ | ----------------- | --------------------------------- |
| `titleBarTitle`          | `String?`         | Navigation title                  |
| `titleBarSubtitle`       | `String?`         | Subtitle (UIKit `prompt`)         |
| `titleBarLargeTitleMode` | `LargeTitleMode`  | `.automatic`, `.large`, `.inline` |
| `titleBarHidden`         | `Bool`            | Whether the title bar is hidden   |
| `titleBarBackLabel`      | `String?`         | Custom back button label          |
| `titleBarTint`           | `String?`         | Hex colour for tint               |
| `titleBarLeadingItems`   | `[BarItemState]`  | Left-side bar items               |
| `titleBarTrailingItems`  | `[BarItemState]`  | Right-side bar items              |
| `searchBar`              | `SearchBarState?` | Inline search bar config          |

### Toolbar

| Property        | Type             | Description                   |
| --------------- | ---------------- | ----------------------------- |
| `toolbarHidden` | `Bool`           | Whether the toolbar is hidden |
| `toolbarItems`  | `[BarItemState]` | Toolbar button items          |

### Navigation (Tabs)

| Property               | Type                    | Description                        |
| ---------------------- | ----------------------- | ---------------------------------- |
| `navigationItems`      | `[NavigationItemState]` | Tab bar items                      |
| `navigationActiveItem` | `String?`               | Currently selected tab ID          |
| `navigationHidden`     | `Bool`                  | Whether the tab bar is hidden      |
| `navigationStyle`      | `String`                | `"tabs"`, `"sidebar"`, or `"auto"` |

### Sidebar Panel (macOS)

| Property            | Type                 | Description                  |
| ------------------- | -------------------- | ---------------------------- |
| `sidebarItems`      | `[SidebarItemState]` | Sidebar navigation items     |
| `sidebarActiveItem` | `String?`            | Selected sidebar item ID     |
| `sidebarTitle`      | `String?`            | Sidebar title                |
| `sidebarWidth`      | `CGFloat?`           | Custom sidebar width         |
| `sidebarVisible`    | `Bool`               | Whether sidebar is visible   |
| `sidebarCollapsed`  | `Bool`               | Whether sidebar is collapsed |

### Menu Bar (macOS)

| Property       | Type                 | Description                       |
| -------------- | -------------------- | --------------------------------- |
| `menuBarMenus` | `[MenuBarMenuState]` | Menu bar menus (File, Edit, etc.) |

## Child Webview State

### Sheets

```swift
struct SheetState: Identifiable {
    let id: String
    var presented: Bool
    var url: String?
    var detents: [SheetDetent] = [.medium, .large]
    var activeDetent: SheetDetent?
    var grabberVisible: Bool = false
    var cornerRadius: CGFloat?
    var backgroundColor: String?
    var dismissible: Bool = true
}
```

### Drawers, Popovers, App Windows

These are all state-backed and rendered via SwiftUI modifiers on macOS:

- Drawers: `presented`, `url`, `width`, `edge`, `backgroundColor`
- Popovers: `presented`, `url`, `width`, `height`, `backgroundColor`
- App windows: `presented`, `url`, `width`, `height`, `title`, `backgroundColor`, `modal`, `resizable`

## Bar Item State

Shared structure for buttons in title bar, toolbar, and keyboard accessory:

```swift
struct BarItemState: Identifiable {
    let id: String
    var label: String?
    var icon: String?          // SF Symbol name
    var style: ItemStyle       // .plain, .primary, .destructive
    var tint: String?          // Hex colour override
    var disabled: Bool
    var badge: String?
    var menu: MenuState?
    var itemType: ItemType     // .button, .flexibleSpace, .fixedSpace
}
```

## Alert/Confirm/Prompt Dialogs

```swift
struct AlertState: Identifiable {
    var message: String
    var type: AlertType        // .alert, .confirm, .prompt
    var defaultText: String?
    var completion: ((AlertResult) -> Void)?
}
```

## Child Webview Registry

```swift
var childWebViews: [String: WKWebView]
```

Tracks all active child webviews (sheets, drawers, popovers, app windows) by their instance name for inter-webview messaging routing.

## Event Callback

```swift
var onChromeEvent: ((String, [String: Any]) -> Void)?
```

Routes SwiftUI interactions (button presses, tab selections, sheet dismissals) back to the bridge for delivery to JavaScript.

## SwiftUI View Modifiers

The chrome state model is consumed by several SwiftUI view modifiers applied in `NativiteRootView`:

| Modifier              | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `.nativiteSheets()`   | Presents/dismisses modal sheets                    |
| `.nativiteAlerts()`   | Shows alert/confirm/prompt dialogs                 |
| `.nativiteTitleBar()` | Renders title bar with items in SwiftUI navigation |
| `.nativiteToolbar()`  | Renders toolbar items                              |

macOS-specific modifiers:

| Modifier                   | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `.nativiteMacTitleBar()`   | macOS title bar buttons/search/tint      |
| `.nativiteMacToolbar()`    | macOS toolbar item group                 |
| `.nativiteMacNavigation()` | Segmented tab-style navigation           |
| `.nativiteMacSidebar()`    | Sidebar layout via `NavigationSplitView` |
| `.nativiteMacDrawers()`    | Leading/trailing drawer overlays         |
| `.nativiteMacPopovers()`   | Popover presentation                     |
| `.nativiteMacAppWindows()` | App-window surface presentation          |

## Child Webview Component

```swift
struct NativiteChildWebView: UIViewRepresentable  // iOS
struct NativiteChildWebView: NSViewRepresentable  // macOS
```

- Shares `WKWebsiteDataStore.default()` with the primary webview (shared cookies/storage).
- Registers instance name as `window.__nativekit_instance_name__` for identification.
- Sets `data-nv-platform` attribute on `documentElement`.
- Enables `WKWebView.isInspectable` in `DEBUG` builds (`iOS 16.4+` / `macOS 13.3+`) so child webviews are visible in Safari Develop tools.
- Tracked in `chromeState.childWebViews` for inter-webview messaging.

## Reusable Components

### NativiteBarButton

Renders individual bar items with:

- SF Symbol icons
- Text labels with style-based colouring
- Badge overlays
- Dropdown menus with nested submenus
- Disabled state (opacity reduction)
