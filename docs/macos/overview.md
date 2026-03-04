# macOS Platform Overview

macOS shares the same codebase as iOS via Apple's unified Swift/SwiftUI framework with conditional compilation (`#if os(macOS)` / `#if os(iOS)`). All generated Swift files are shared between iOS and macOS with platform-specific branches.

## Shared Files with iOS

The macOS project is generated from the same templates as iOS:

| File                        | iOS Behaviour                                    | macOS Behaviour                                                                                                                    |
| --------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `NativiteApp.swift`         | `WindowGroup { NativiteRootView(chromeState:) }` | Same + app-level `chromeState`, `.commands { NativiteMenuBarCommands(...) }`, `.defaultSize(...)`, `@NSApplicationDelegateAdaptor` |
| `AppDelegate.swift`         | Splash overlay, NavigationStack                  | No splash; root representable + SwiftUI macOS chrome modifiers                                                                     |
| `ViewController.swift`      | `UIViewController` + `WKWebView`                 | `NSViewController` + `WKWebView`                                                                                                   |
| `NativiteBridge.swift`      | Identical                                        | Identical                                                                                                                          |
| `NativiteChrome.swift`      | UIKit + SwiftUI reconciliation                   | State-driven SwiftUI reconciliation + minimal NSWindow titlebar mapping                                                            |
| `NativiteChromeState.swift` | All areas                                        | All areas + macOS-specific (sidebar, menu bar, app windows)                                                                        |
| `NativiteVars.swift`        | Full variable set                                | Reduced set (no keyboard, no status bar)                                                                                           |
| `NativiteKeyboard.swift`    | Input accessory + dismiss mode                   | Not generated (no software keyboard)                                                                                               |

## SwiftUI vs AppKit

Current split in macOS chrome:

- **SwiftUI-driven**: title bar buttons/search, toolbar items, navigation tabs, sidebar, menu commands, sheets, drawers, popovers, app-window surface, alerts.
- **AppKit-driven**: window title/subtitle/separator/full-size-content/title-visibility flags only.

## macOS-Specific Features

### Toolbar

The macOS toolbar extends the base `toolbar()` API with placement groups, user customisation, display modes, and toolbar styles. These properties are macOS-only and ignored on iOS/Android.

#### Placement Groups

Items can target specific zones in the macOS window toolbar via `groups`:

| Placement         | Description                       |
| ----------------- | --------------------------------- |
| `automatic`       | System decides (default)          |
| `principal`       | Centre of the toolbar             |
| `secondaryAction` | Overflow / secondary actions area |
| `navigation`      | Leading navigation area           |
| `primaryAction`   | Trailing primary action area      |

When both `items` and `groups` are provided, macOS uses `groups`; iOS/Android prefer `items` and fall back to flattening `groups`.

#### Customisation

| Property       | Type      | Description                                               |
| -------------- | --------- | --------------------------------------------------------- |
| `customizable` | `Boolean` | Enable right-click → Customise Toolbar                    |
| `id`           | `String`  | Stable toolbar identifier for persisting user preferences |

Per-item `customization` on `ButtonItem`:

| Value        | Description                                      |
| ------------ | ------------------------------------------------ |
| `"default"`  | Included by default, user can remove             |
| `"hidden"`   | Not shown by default, user can add via customise |
| `"required"` | Always visible, cannot be removed                |

#### Display Mode

| Value            | Description         |
| ---------------- | ------------------- |
| `"iconAndLabel"` | Show both (default) |
| `"iconOnly"`     | Icons only          |
| `"labelOnly"`    | Labels only         |

#### Toolbar Style

Set via `toolbarStyle` in `ToolbarConfig`. Applied at the window level via `.windowToolbarStyle()`:

| Value        | Description                                         |
| ------------ | --------------------------------------------------- |
| `"unified"`  | Compact toolbar integrated with the title (default) |
| `"expanded"` | Larger toolbar with separate area below the title   |

Note: `toolbarStyle` is read from `defaultChrome` at build time and applied as a Scene modifier. It cannot be changed dynamically at runtime.

#### Coexistence with titleBar

Both `titleBar` and `toolbar` independently add items to the macOS window toolbar. The title bar uses `.navigation` and `.primaryAction` placements for its leading/trailing items, while toolbar groups can use any placement. Items from both sources are merged by SwiftUI.

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

macOS drawers are rendered by SwiftUI overlays using `NativiteChildWebView`, with leading/trailing edge placement.

### Popovers

macOS popovers are rendered by SwiftUI `.popover` with state-driven presentation.

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
- `--nv-tab-height` is derived from SwiftUI navigation visibility (fixed logical tab height when shown).
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
