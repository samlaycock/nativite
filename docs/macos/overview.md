# macOS Platform Overview

macOS shares the same codebase as iOS via Apple's unified Swift/SwiftUI framework with conditional compilation (`#if os(macOS)` / `#if os(iOS)`). All generated Swift files are shared between iOS and macOS with platform-specific branches.

## Shared Files with iOS

The macOS project is generated from the same templates as iOS:

| File                        | iOS Behaviour                              | macOS Behaviour                                                                   |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| `NativiteApp.swift`         | `WindowGroup { NativiteRootView() }`       | Same + `.defaultSize(width: 1024, height: 768)` + `@NSApplicationDelegateAdaptor` |
| `AppDelegate.swift`         | Splash overlay, NavigationStack            | No splash, simpler layout                                                         |
| `ViewController.swift`      | `UIViewController` + `WKWebView`           | `NSViewController` + `WKWebView`                                                  |
| `NativiteBridge.swift`      | Identical                                  | Identical                                                                         |
| `NativiteChrome.swift`      | UIKit reconciliation (tabs, toolbar, etc.) | Subset of UIKit chrome areas                                                      |
| `NativiteChromeState.swift` | All areas                                  | All areas + macOS-specific (sidebar, menu bar, app windows)                       |
| `NativiteVars.swift`        | Full variable set                          | Reduced set (no keyboard, no status bar)                                          |
| `NativiteKeyboard.swift`    | Input accessory + dismiss mode             | Not generated (no software keyboard)                                              |

## macOS-Specific Features

### Sidebar Panel

| Property     | Type            | Description                                 |
| ------------ | --------------- | ------------------------------------------- |
| `items`      | `SidebarItem[]` | Sidebar navigation items (supports nesting) |
| `activeItem` | `String?`       | Selected item ID                            |
| `title`      | `String?`       | Sidebar header title                        |
| `visible`    | `Boolean`       | Whether sidebar is visible                  |
| `width`      | `Number?`       | Custom sidebar width                        |
| `collapsed`  | `Boolean`       | Whether sidebar is collapsed                |

### Menu Bar

| Property | Type            | Description                             |
| -------- | --------------- | --------------------------------------- |
| `menus`  | `MenuBarMenu[]` | Menu bar menus (File, Edit, View, etc.) |

Each menu contains:

- `title` — Menu title in the menu bar
- `items` — Array of `MenuItem` with support for:
  - `keyEquivalent` — Keyboard shortcut (e.g., `"s"` for Cmd+S)
  - `children` — Nested submenus

### App Windows

Named child webviews presented as separate macOS windows:

| Property    | Type                | Description                   |
| ----------- | ------------------- | ----------------------------- |
| `url`       | `String`            | URL to load                   |
| `presented` | `Boolean`           | Whether the window is shown   |
| `title`     | `String?`           | Window title                  |
| `size`      | `{ width, height }` | Window dimensions             |
| `minSize`   | `{ width, height }` | Minimum dimensions            |
| `resizable` | `Boolean`           | Whether window can be resized |
| `modal`     | `Boolean`           | Whether window is modal       |

### Drawers

macOS drawers behave similarly to iOS but use macOS-native presentation.

### Popovers

macOS popovers are presented as native `NSPopover`-style floating panels, anchored to a specific element.

## App Delegate

```swift
class NativiteAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}
```

- `.regular` activation policy: The app appears in the Dock and has proper window management.
- Terminates when the last window is closed.

## CSS Variables Differences

| Variable             | iOS                      | macOS                                |
| -------------------- | ------------------------ | ------------------------------------ |
| `--nv-keyboard-*`    | Available                | Not available (no software keyboard) |
| `--nv-status-height` | Available                | Not available (no status bar)        |
| `--nv-is-desktop`    | `0`                      | `1`                                  |
| `--nv-is-landscape`  | Dynamic                  | Always `1`                           |
| `--nv-font-*`        | Dynamic Type values      | Fixed HIG values                     |
| Appearance tracking  | Trait collection changes | `NSApplication` notifications        |

macOS chrome geometry notes:

- `--nv-nav-height` is derived from live `NSWindow` titlebar/content layout geometry.
- `--nv-tab-height` is derived from the rendered navigation segmented-control container height.
- `--nv-toolbar-*` remains `0` because macOS toolbar content is part of top window chrome, not a bottom toolbar inset.

## View Controller

Uses `NSViewController` instead of `UIViewController`:

- Same `WKWebView` hosting pattern
- User-Agent: `Nativite/macos/1.0`
- No status bar or home indicator overrides
- Appearance changes tracked via `NSApplication.didChangeScreenParametersNotification`

## Development Workflow

> Maps to: `src/platforms/first-party.ts` (macOS platform plugin)

1. Generates project in `.nativite/macos/`
2. Builds with `xcodebuild`
3. Kills any existing app instance
4. Launches the built binary directly (no simulator needed)
5. Dev URL passed via `NATIVITE_DEV_URL` environment variable

### File Extension Resolution

```
.macos → .desktop → .native → fallback
```

Example: `Button.macos.tsx` → `Button.desktop.tsx` → `Button.native.tsx` → `Button.tsx`
