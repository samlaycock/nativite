# Android Chrome UI Components

> Maps to: `src/android/templates/nativite-chrome.ts`
> Generated file: `NativiteChrome.kt` (contains `NativiteApp` and all chrome composables)

The Chrome UI layer is implemented entirely in Jetpack Compose with Material 3 components. The root `NativiteApp` composable reads from `bridge.chromeState` and renders all chrome areas.

## Root Composable

```kotlin
@Composable
fun NativiteApp(bridge: NativiteBridge)
```

Uses a `Scaffold` with `topBar` and `bottomBar` slots to lay out the chrome areas around the main webview.

## Title Bar

**Composable:** `NativiteTitleBar`
**Material 3 Component:** `TopAppBar` / `LargeTopAppBar`

### Configuration

| Property         | Type               | Description                             |
| ---------------- | ------------------ | --------------------------------------- |
| `title`          | `String?`          | Primary title text                      |
| `subtitle`       | `String?`          | Secondary text below title              |
| `leadingItems`   | `BarItem[]`        | Left-side action buttons                |
| `trailingItems`  | `BarItem[]`        | Right-side action buttons               |
| `tint`           | `String?`          | Hex colour for icons/text               |
| `searchBar`      | `SearchBarConfig?` | Inline search bar below title           |
| `largeTitleMode` | `String`           | `"large"`, `"inline"`, or `"automatic"` |
| `hidden`         | `Boolean`          | Whether to hide the title bar           |

### Large Title Mode

- `"large"` → Uses `LargeTopAppBar` with scroll-collapse behaviour
- `"inline"` → Uses compact `TopAppBar`
- `"automatic"` → Switches between large and inline based on scroll state

### Search Bar

**Composable:** `NativiteTitleBarSearch`

Renders a `BasicTextField` with search icon below the title bar.

**Events:**

- `titleBar.searchChanged` — Fires on every keystroke with `{ value }`
- `titleBar.searchSubmitted` — Fires on enter/submit
- `titleBar.searchCancelled` — Fires when search is cleared

### Events

- `titleBar.leadingItemPressed` with `{ id }`
- `titleBar.trailingItemPressed` with `{ id }`
- `titleBar.menuItemPressed` with `{ id }` (from dropdown menus)

## Navigation Bar

**Composable:** `NativiteNavigationBar`
**Material 3 Component:** `NavigationBar` with `NavigationBarItem`

### Configuration

| Property     | Type               | Description                           |
| ------------ | ------------------ | ------------------------------------- |
| `items`      | `NavigationItem[]` | Tab items (label, icon required)      |
| `activeItem` | `String?`          | Currently selected tab ID             |
| `searchBar`  | `SearchBarConfig?` | Search field used by search-role item |
| `hidden`     | `Boolean`          | Whether to hide the nav bar           |

### Icon Resolution

Icons are resolved via reflection against `androidx.compose.material.icons.Icons.Default` and `Icons.AutoMirrored.Filled`. The `materialIcon()` function uses a cache for efficient repeated lookups.

### Events

- `navigation.itemPressed` with `{ id }`
- `navigation.searchChanged` with `{ value }`
- `navigation.searchSubmitted` with `{ value }`
- `navigation.searchCancelled`

### Item Features

- Label text
- Material Icon
- Badge overlay
- Subtitle text
- Disabled state

## Toolbar

**Composable:** `NativiteToolbar`
**Material 3 Component:** `BottomAppBar`

### Configuration

| Property | Type        | Description                         |
| -------- | ----------- | ----------------------------------- |
| `items`  | `BarItem[]` | Button items, flexible/fixed spaces |
| `hidden` | `Boolean`   | Whether to hide the toolbar         |

### Item Types

- **Button**: Icon and/or label with press handler
- **Flexible Space** (`"flexible-space"`): Expands to fill available width
- **Fixed Space** (`"fixed-space"`): Fixed-width spacer

### Events

- `toolbar.itemPressed` with `{ id }`
- `toolbar.menuItemPressed` with `{ id }` (from dropdown menus)

## Sheets

**Composable:** `NativiteSheet`
**Material 3 Component:** `ModalBottomSheet`

### Configuration

| Property         | Type       | Description                                                     |
| ---------------- | ---------- | --------------------------------------------------------------- |
| `url`            | `String`   | URL to load in the sheet's webview                              |
| `presented`      | `Boolean`  | Whether the sheet is shown                                      |
| `detents`        | `String[]` | Allowed stop points: `"small"`, `"medium"`, `"large"`, `"full"` |
| `activeDetent`   | `String?`  | Current detent                                                  |
| `grabberVisible` | `Boolean`  | Show the drag handle                                            |
| `dismissible`    | `Boolean`  | Whether swipe-to-dismiss is enabled                             |
| `cornerRadius`   | `Number?`  | Custom corner radius                                            |

### Detent Mapping

| Detent   | Height         |
| -------- | -------------- |
| `small`  | 25% of screen  |
| `medium` | 50% of screen  |
| `large`  | 75% of screen  |
| `full`   | 100% of screen |

### Events

- `sheet.presented` with `{ name }`
- `sheet.dismissed` with `{ name }`
- `sheet.detentChanged` with `{ name, detent }`

Each sheet contains a `NativiteWebView` child for its content.

## Drawers

**Composable:** `NativiteDrawers`
**Material 3 Component:** `ModalNavigationDrawer`

### Configuration

| Property          | Type                | Description                                      |
| ----------------- | ------------------- | ------------------------------------------------ |
| `url`             | `String`            | URL to load in the drawer's webview              |
| `presented`       | `Boolean`           | Whether the drawer is shown                      |
| `side`            | `String`            | `"leading"` or `"trailing"`                      |
| `width`           | `String` / `Number` | `"small"`, `"medium"`, `"large"`, or pixel value |
| `dismissible`     | `Boolean`           | Whether tap-outside dismisses                    |
| `backgroundColor` | `String?`           | Hex background colour                            |

### Trailing Drawer

Trailing (right-side) drawers are implemented by flipping the layout direction of the `ModalNavigationDrawer`.

### Events

- `drawer.presented` with `{ name }`
- `drawer.dismissed` with `{ name }`

## Popovers

**Composable:** `NativitePopover`
**Compose Component:** `Popup`

### Configuration

| Property    | Type                | Description                          |
| ----------- | ------------------- | ------------------------------------ |
| `url`       | `String`            | URL to load in the popover's webview |
| `presented` | `Boolean`           | Whether the popover is shown         |
| `size`      | `{ width, height }` | Popover dimensions                   |

### Events

- `popover.presented` with `{ name }`
- `popover.dismissed` with `{ name }`

## Status Bar

**Composable:** `NativiteStatusBar`
**API:** `WindowCompat.getInsetsController()`

### Configuration

| Property | Type      | Description                      |
| -------- | --------- | -------------------------------- |
| `style`  | `String`  | `"light"`, `"dark"`, or `"auto"` |
| `hidden` | `Boolean` | Whether to hide the status bar   |

### Implementation

- `"light"` → `isAppearanceLightStatusBars = false` (light icons on dark background)
- `"dark"` → `isAppearanceLightStatusBars = true` (dark icons on light background)
- Hidden via `hide(WindowInsetsCompat.Type.statusBars())`

## Home Indicator (System Navigation Bar)

**Composable:** `NativiteHomeIndicator`
**API:** `WindowCompat.getInsetsController()`

### Configuration

| Property | Type      | Description                               |
| -------- | --------- | ----------------------------------------- |
| `hidden` | `Boolean` | Whether to hide the system navigation bar |

### Implementation

- Hidden via `hide(WindowInsetsCompat.Type.navigationBars())`
- Sets `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` for gesture reveal

## Keyboard Accessory

**Composable:** `NativiteKeyboardAccessory`
**Compose Component:** `Surface` with `AnimatedVisibility`

### Configuration

| Property          | Type        | Description                      |
| ----------------- | ----------- | -------------------------------- |
| `accessory.items` | `BarItem[]` | Buttons shown above the keyboard |

### Implementation

- Detects keyboard presence via `WindowInsets.ime.getBottom()`
- Shows/hides with `AnimatedVisibility` animation
- Renders above the soft keyboard surface

### Events

- `keyboard.itemPressed` with `{ id }`

## Tab Bottom Accessory

**Composable:** `NativiteTabBottomAccessory`

A 44dp tall content area docked above the navigation bar or toolbar, containing a child `NativiteWebView`.

### Events

- `tabBottomAccessory.presented`
- `tabBottomAccessory.dismissed`
- `tabBottomAccessory.loadFailed` with `{ message, code }`

## Shared Components

### BarItemButton

Renders individual bar items across all chrome areas with:

- Material Icon lookup via reflection
- Text labels with style-based colouring
- Disabled state (reduced opacity)
- Badge overlay
- Custom tint colour
- Dropdown menu (`NativiteDropdownMenu`)

### NativiteDropdownMenu

Material 3 `DropdownMenu` with single-level `DropdownMenuItem` entries.

### materialIcon()

Reflection-based lookup against `Icons.Default` and `Icons.AutoMirrored.Filled` with LRU caching for performance.
