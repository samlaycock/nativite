# iOS Chrome State Reconciliation

> Maps to: `src/ios/templates/nativite-chrome.ts`
> Generated file: `NativiteChrome.swift`

The Chrome reconciler translates declarative JavaScript chrome state into imperative UIKit/SwiftUI native UI components.

## Architecture

```swift
class NativiteChrome: NSObject
```

Holds weak references to:

- `ViewController` (UIKit host)
- `NativiteVars` (CSS variable injection)
- `NativiteKeyboard` (input accessory)
- `NativiteChromeState` (@Observable SwiftUI model)

## State Application

### Entry Point

```swift
func applyState(_ args: [String: Any])
```

Called whenever the bridge receives a `__chrome_set_state__` message. Runs on the main thread via `DispatchQueue.main.async`.

### Diff-Based Reset

The reconciler tracks which areas were applied in the previous state. When an area disappears from the new state, it is explicitly reset to avoid stale UI.

### Area Dispatch

Each chrome area has a dedicated apply method:

| Area           | Method                          | UIKit Component                   |
| -------------- | ------------------------------- | --------------------------------- |
| Title Bar      | `applyTitleBar()`               | `UINavigationItem`                |
| Navigation     | `applyNavigation()`             | `UITabBar` / `UITabBarController` |
| Toolbar        | `applyToolbar()`                | `UIToolbar`                       |
| Status Bar     | via `chromeState`               | `UIViewController` overrides      |
| Home Indicator | via `chromeState`               | `UIViewController` overrides      |
| Sheets         | via `chromeState`               | SwiftUI sheet modifier            |
| Keyboard       | `NativiteKeyboard.applyState()` | Input accessory view              |

## Title Bar

Configures `UINavigationItem` on the view controller:

- **title** / **subtitle** (via `navigationItem.prompt` for UIKit subtitle)
- **largeTitleMode**: `.automatic`, `.always` (large), `.never` (inline)
- **leadingItems** / **trailingItems**: Mapped to `UIBarButtonItem` arrays
- **searchBar**: `UISearchBar` integrated into the navigation item
- **tint**: Custom `tintColor` on the navigation bar
- **hidden**: Hides the entire navigation bar
- **backLabel**: Custom back button text (or `nil` for default)

Bar items support:

- SF Symbol icons via `UIImage(systemName:)`
- Text labels
- Badges (via a custom badge overlay)
- Dropdown menus (via `UIMenu`)
- Styles: `.plain`, `.primary` (bold), `.destructive` (red)

## Navigation (Tab Bar)

Two implementations based on iOS version:

### iOS 18+ (`UITabBarController`)

Uses the modern `UITab` and `UISearchTab` API:

- Creates `UITab` instances with SF Symbol icons
- Supports `UISearchTab` for tabs with `role: "search"`
- Detects structural changes via a fingerprint array (`"{id}:{role}"` strings)
- Full rebuild only when structure changes; otherwise updates in place

### iOS <18 (Legacy `UITabBar`)

Self-managed `UITabBar`:

- Manually positioned at the bottom of the view
- Creates `UITabBarItem` instances
- Handles selection via delegate callbacks

### Events

- `navigation.itemPressed` with the tab `id`
- Badge support on individual tabs

## Toolbar

Configures `UIToolbar` with `UIBarButtonItem` entries:

- Buttons, flexible spaces, fixed spaces
- Same item rendering as title bar (icons, labels, menus, badges)
- Events: `toolbar.itemPressed`, `toolbar.menuItemPressed`

## CSS Variable Sync

After applying state, calls `pushVarUpdates()` which reads UIKit geometry:

- Navigation bar height
- Tab bar height
- Toolbar height

These are passed to `NativiteVars.updateChrome()` to set:

- `--nv-nav-height`, `--nv-nav-visible`
- `--nv-tab-height`, `--nv-tab-visible`
- `--nv-toolbar-height`, `--nv-toolbar-visible`

## SwiftUI Integration

Areas that are better expressed in SwiftUI (status bar, home indicator, sheets, alerts, title bar overlays) are routed through `NativiteChromeState` — an `@Observable` model that SwiftUI views observe. The `NativiteChrome` class updates this model, and SwiftUI views react automatically.

Event callbacks from SwiftUI interactions flow back through `chromeState.onChromeEvent`, which the bridge picks up and delivers to JavaScript.
