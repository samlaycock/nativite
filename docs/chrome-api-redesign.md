# Chrome API Redesign

**Date:** 2026-02-27
**Status:** Proposal

---

## 1. Problems with the Current API

Before designing the new API, it helps to be precise about what is wrong.

### 1.1 Fragmented item types

There are three separate shapes for "a button in a bar":

- `BarButtonItem` — used in `NavigationBarState.toolbarLeft/Right`
- `ToolbarButtonItem extends BarButtonItem` — used in `ToolbarState` (adds `type: "button"` and `menu`)
- `KeyboardAccessoryItem` — an anonymous union used in `KeyboardState.inputAccessory`

A button in the nav bar cannot carry a menu. A keyboard accessory button has a
different `style` vocabulary (`"plain" | "prominent"`) than a nav bar button
(`"plain" | "done" | "destructive"`). None of these types are composable across
contexts. Code cannot be shared; types cannot be reused.

Separately, `MenuItem` (used in `MenuBarState`) and `ToolbarMenuItem` (used in
`ToolbarButtonMenu`) are almost identical but distinct. Submenus on one cannot
be passed to the other.

### 1.2 Imperative, split API surface

The runtime chrome object forces every property through a different setter:

```ts
chrome.navigationBar.setTitle("Settings");
chrome.navigationBar.setToolbarRight([...]);
chrome.navigationBar.configure({ largeTitleMode: "always" });
```

Three calls, three bridge round-trips, for what is conceptually one state
snapshot. `chrome.set()` was added as a relief valve, but it bypasses the
per-element state merging that `setTitle` etc. rely on — it is a footgun.

There is also no way to read back the current state; the API is write-only from
the JS side, which complicates testing and framework integration.

### 1.3 Only one child webview

The `sheet` namespace is the sole concept for mounting the app at a child route.
There is no way to describe a drawer, or (on macOS) a second window, all of
which are common patterns. The sheet's messaging API (`sheet.postMessage` /
`sheet.onMessage`) is one-to-one; there is no broadcast or peer-to-peer model.

The `sheet.postMessage` implementation also routes through
`window.nativiteSheet.postMessage` inside the sheet, exposing an internal global
as a semi-public API.

### 1.4 `searchBar` is not part of `navigationBar`

On every native platform a search bar lives inside (or immediately adjacent to)
the navigation/title bar. Having `chrome.searchBar` as a sibling of
`chrome.navigationBar` implies they are independent, but the native
implementation ties them together.

### 1.5 `window` conflicts with the global `window`

`chrome.window` is a namespace for macOS window chrome. Having `.window` on a
singleton is a collision risk with reader expectations and autocomplete noise.
The concept also needs a richer equivalent on non-macOS platforms rather than
simply being absent.

### 1.6 `sidebar` is ambiguous

`SidebarState` describes iPad/macOS primary navigation (a list of selectable
items replacing the tab bar). But "sidebar" also suggests a secondary panel —
think a document browser's folder list, or a filter drawer. Having one word mean
both makes the design harder to extend.

### 1.7 Platform gaps are not systematic

Some chrome areas only make sense on some platforms (e.g. `homeIndicator` is
iOS-only, `menuBar` is macOS/Electron-only) but this is not modelled in the
type system at all. Calls to unsupported APIs silently do nothing.

### 1.8 No ergonomic lifecycle integration

The existing setters are global mutations with no ownership or cleanup story.
In a component-based app, when a screen sets `chrome.tabBar.hide()` and then
unmounts, there is no principled way to restore the tab bar — the developer must
track what was previously set and manually undo it.

---

## 2. Design Goals

1. **A single, unified set of primitive item types** used everywhere that buttons
   and menus appear.
2. **JSX-like declarative API in plain JavaScript** — factory functions construct
   chrome area descriptors, and `chrome()` applies them. This mirrors how
   `React.createElement` underlies JSX, giving the same composability and
   readability without requiring a framework or transform.
3. **`chrome()` returns a cleanup function** that restores only the areas it
   touched, making React `useEffect` cleanup trivial (`return chrome(...)`) and
   giving vanilla JS a clear ownership and teardown contract. The stacking
   mechanism is an internal implementation detail.
4. **Named child webviews** as a first-class concept, supporting sheets, drawers,
   popovers, and (on desktop) windows, with a consistent messaging interface.
5. **Platform-neutral naming** that maps naturally to each platform's idioms
   without exposing UIKit/AppKit vocabulary in the public API.
6. **Composable event system** — a single typed `chrome.on()` for all events,
   no per-method listeners.
7. **Graceful, documented unavailability** — platform-specific chrome areas are
   typed as optional; the platform layer ignores unknown areas silently but the
   type system and docs say why.

---

## 3. Core Primitive Types

These are the building blocks used in every chrome area that renders interactive
items. Unifying them is the single highest-leverage change in this redesign.

### 3.1 ButtonItem

Used anywhere a tappable button or icon can appear: title bar, toolbar, keyboard
accessory. All bar contexts accept the same type.

```ts
interface ButtonItem {
  /** Unique ID used in events. */
  readonly id: string;
  /** Visible label. Omit when using icon alone. */
  readonly label?: string;
  /**
   * Platform icon identifier.
   * On iOS/macOS this is an SF Symbol name ("plus", "square.and.arrow.up").
   * On Android this will be a Material Symbol name.
   * On Electron this will be a named icon or asset path.
   * The platform layer resolves the value; the JS layer is agnostic.
   */
  readonly icon?: string;
  /**
   * Semantic style applied by the platform.
   * "primary"     — highlighted / prominent (e.g. "Done" on iOS)
   * "destructive" — red tint
   * "plain"       — default
   */
  readonly style?: "plain" | "primary" | "destructive";
  readonly disabled?: boolean;
  /** Badge overlaid on the item. Pass null to remove. */
  readonly badge?: string | number | null;
  /**
   * Attach a drop-down menu to this button.
   * On iOS/macOS renders as a UIMenu / NSMenu.
   * On other platforms the platform layer chooses an appropriate control.
   * When a menu is present, tapping the button opens the menu rather than
   * firing an itemTapped event.
   */
  readonly menu?: MenuConfig;
}
```

### 3.2 MenuConfig and MenuItem

Used wherever a hierarchical menu appears: button menus, macOS menu bar.

```ts
interface MenuConfig {
  /** Optional title rendered at the top of the menu. */
  readonly title?: string;
  readonly items: readonly MenuItem[];
}

interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly disabled?: boolean;
  /** Renders with a checkmark. */
  readonly checked?: boolean;
  /**
   * Semantic style.
   * "destructive" — rendered in red.
   */
  readonly style?: "plain" | "destructive";
  /** Key shortcut, e.g. "s" for Cmd+S (macOS/Electron only). */
  readonly keyEquivalent?: string;
  /** Nested submenu. */
  readonly children?: readonly MenuItem[];
}
```

`MenuItem` supersedes both the old `ToolbarMenuItem` and `MenuItem` (menu bar)
types, which were almost identical.

### 3.3 Spacers

Reused wherever a toolbar-like layout needs spacing:

```ts
type FlexibleSpace = { readonly type: "flexible-space" };
type FixedSpace = { readonly type: "fixed-space"; readonly width: number };
type BarItem = ButtonItem | FlexibleSpace | FixedSpace;
```

### 3.4 NavigationItem

Used in the primary navigation (tab bar / sidebar):

```ts
interface NavigationItem {
  readonly id: string;
  readonly label: string;
  /** Required: an icon is mandatory for primary navigation items. */
  readonly icon: string;
  readonly badge?: string | number | null;
  readonly disabled?: boolean;
}
```

### 3.5 SidebarItem

Used in secondary sidebar panels. Supports tree structures for outline views.

```ts
interface SidebarItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly badge?: string | number | null;
  /** Child items for collapsible sections (macOS / iPadOS outline view). */
  readonly children?: readonly SidebarItem[];
}
```

---

## 4. Chrome Areas

Each area has a config interface and a corresponding factory function (see §7).

### 4.1 Title Bar

**Replaces:** `NavigationBarState` + `WindowState` + `SearchBarState`

The "title bar" is the horizontal strip at the top of the screen or window. On
mobile it is a navigation bar; on desktop it is a window title bar.

```ts
interface TitleBarConfig {
  readonly title?: string;
  /**
   * Secondary line below the title.
   * iOS: rendered as a prompt (small text below title in nav bar).
   * macOS: rendered as the window subtitle.
   * Others: rendered as secondary text where the layout permits.
   */
  readonly subtitle?: string;
  /**
   * Display mode for the title on iOS/iPadOS.
   * "large"     — large title above scroll content
   * "inline"    — standard compact title
   * "automatic" — large when at top of scroll, inline when scrolled (default)
   * Ignored on non-iOS platforms.
   */
  readonly largeTitleMode?: "large" | "inline" | "automatic";
  /**
   * Override the back button label. Null hides the label (icon only).
   * Only meaningful on iOS where a navigation stack is active.
   */
  readonly backLabel?: string | null;
  /** Items on the leading (left / start) side. */
  readonly leadingItems?: readonly BarItem[];
  /** Items on the trailing (right / end) side. */
  readonly trailingItems?: readonly BarItem[];
  /** Embed a search bar inside or below the title bar. */
  readonly searchBar?: SearchBarConfig;
  /** Whether the title bar is visible. */
  readonly hidden?: boolean;
  /**
   * macOS: whether the web content extends underneath the title bar.
   * Equivalent to NSWindow.styleMask.fullSizeContentView.
   */
  readonly fullSizeContent?: boolean;
  /**
   * macOS: separator style between the title bar and content.
   */
  readonly separatorStyle?: "automatic" | "none" | "line" | "shadow";
}

interface SearchBarConfig {
  readonly placeholder?: string;
  readonly value?: string;
  readonly cancelButtonVisible?: boolean;
}
```

**Justification for merging `NavigationBarState`, `WindowState`, and
`SearchBarState`:**
All three describe the chrome at the top of the screen. A developer working on
a settings screen should think of one thing ("title bar"), not three. The
platform implementations are already coupled internally. Merging them into a
single config object reduces the concept count and makes the relationship
between fields (e.g. search bar lives inside the nav bar) explicit.

The `subtitle` field generalises both the iOS navigation bar prompt and the
macOS window subtitle into a single concept. On platforms that support neither,
it is silently ignored.

---

### 4.2 Navigation (Primary)

**Replaces:** `TabBarState` and `SidebarState` (primary navigation role only)

Primary navigation is the mechanism by which the user switches between top-level
sections of the app. Its visual representation adapts to the platform:

| Platform | Default rendering |
|---|---|
| iOS (phone) | Tab bar at the bottom |
| iPadOS | Tab bar at the bottom or sidebar (platform adapts) |
| macOS | Sidebar |
| Android | Bottom navigation bar |
| Electron | Sidebar |

```ts
interface NavigationConfig {
  readonly items: readonly NavigationItem[];
  readonly activeItem?: string;
  /**
   * Style hint for how the primary navigation should be rendered.
   * "tabs"    — force a horizontal tab bar (bottom on mobile)
   * "sidebar" — force a sidebar (leading column)
   * "auto"    — let the platform decide based on screen size and idiom (default)
   */
  readonly style?: "tabs" | "sidebar" | "auto";
  readonly hidden?: boolean;
}
```

**Why a single `navigation` instead of `tabBar` + `sidebar`?**

The iOS tab bar and the iPad/macOS sidebar are the same concept: choose the
active section of the app. Apple's own SwiftUI `TabView` adapts to both
representations from a single declaration. Nativite should do the same. The
`style: "auto"` default means iPhone gets a tab bar, iPad/macOS get a sidebar
— all from the same config.

---

### 4.3 Toolbar (Supplementary)

**Replaces:** `ToolbarState`

The toolbar is a secondary row of actions that is contextual to the current
content. On iOS it sits at the bottom; on macOS it is `NSToolbar` (typically at
the top, integrated with the window chrome).

```ts
interface ToolbarConfig {
  readonly items: readonly BarItem[];
  readonly hidden?: boolean;
}
```

`BarItem` is reused here, so a toolbar button and a title bar button are the
same type. The `menu` field on `ButtonItem` provides inline menus where needed.

---

### 4.4 Sidebar Panel (Secondary)

**New concept** (partially overlaps with the secondary role of old `SidebarState`)

A persistent side panel for supplementary navigation: file trees, filter lists,
outline views. Unlike primary navigation, this panel does not replace the main
content area.

On iOS phone this degrades to a modal or drawer presentation since there is not
enough screen space for a persistent side panel.

```ts
interface SidebarPanelConfig {
  readonly items: readonly SidebarItem[];
  readonly activeItem?: string;
  readonly title?: string;
  readonly visible?: boolean;
}
```

---

### 4.5 Status Bar

**Replaces:** `StatusBarState` (unchanged in semantics)

```ts
interface StatusBarConfig {
  /**
   * "light"  — white icons (for dark backgrounds)
   * "dark"   — black icons (for light backgrounds)
   * "auto"   — system decides based on colour scheme (default)
   */
  readonly style?: "light" | "dark" | "auto";
  readonly hidden?: boolean;
}
```

Platform support: iOS, Android. Ignored on macOS and Electron.

---

### 4.6 Home Indicator

**Replaces:** `HomeIndicatorState` (unchanged)

```ts
interface HomeIndicatorConfig {
  readonly hidden?: boolean;
}
```

Platform support: iOS only. Silently ignored elsewhere.

---

### 4.7 Keyboard Accessory

**Replaces:** `KeyboardState`

```ts
interface KeyboardConfig {
  /** Toolbar rendered above the software keyboard. Pass null to remove. */
  readonly accessory?: { readonly items: readonly BarItem[] } | null;
  /** How the keyboard is dismissed by scrolling. */
  readonly dismissMode?: "none" | "onDrag" | "interactive";
}
```

`accessory.items` uses `BarItem[]` — the same unified type — so a keyboard
accessory button and a title bar button are structurally identical. Code is
shareable across all bar contexts.

Platform support: iOS, iPadOS. Silently ignored on macOS and Electron.

---

### 4.8 Menu Bar

**Replaces:** `MenuBarState`

```ts
interface MenuBarConfig {
  /**
   * Extra menus appended after the OS built-in menus (Apple, File, Edit...).
   * Each entry corresponds to one top-level menu bar item.
   */
  readonly menus: readonly {
    readonly id: string;
    readonly label: string;
    readonly items: readonly MenuItem[];
  }[];
}
```

`MenuItem` is the same unified type used in button menus. macOS menu bar items
and button dropdown items are structurally identical. Platform support: macOS,
Electron. Silently ignored elsewhere.

---

## 5. Child Webviews

**Replaces and generalises:** `SheetState`

Every app has one "main" webview. A child webview mounts the same app at a
specific URL/route inside a platform chrome container (sheet, drawer, window,
popover). Multiple child webviews can coexist.

Child webviews are identified by a **developer-chosen name** (a plain string).
The name is the address used by the messaging API and in events.

All child webview configs share a common base:

```ts
interface ChildWebviewBase {
  /**
   * The URL to load in this child webview.
   * "/route" keeps the same host (dev server in dev, SPA entry in prod).
   */
  readonly url: string;
  /** Whether the child webview is currently presented. */
  readonly presented?: boolean;
  /**
   * Background colour of the container (hex string, e.g. "#1C1C1E").
   * Match the app background to avoid a flash-of-white on load.
   */
  readonly backgroundColor?: string;
}
```

### 5.1 Sheets

```ts
interface SheetConfig extends ChildWebviewBase {
  /**
   * Available stop positions.
   * "small"  — ~25% of screen height
   * "medium" — ~50% of screen height
   * "large"  — ~90% of screen height
   * "full"   — full screen
   */
  readonly detents?: readonly ("small" | "medium" | "large" | "full")[];
  readonly activeDetent?: "small" | "medium" | "large" | "full";
  readonly grabberVisible?: boolean;
  /**
   * Whether the user can dismiss by swiping down.
   * When false, the app must dismiss programmatically.
   */
  readonly dismissible?: boolean;
  readonly cornerRadius?: number;
}
```

Platform mapping:
- iOS/iPadOS: `UISheetPresentationController`
- macOS: Modal panel or `NSPanel`
- Android: `BottomSheetDialogFragment`
- Electron: Custom panel or frameless `BrowserWindow`

### 5.2 Drawers

```ts
interface DrawerConfig extends ChildWebviewBase {
  /**
   * Which edge the drawer slides in from.
   * "leading"  — left on LTR, right on RTL
   * "trailing" — right on LTR, left on RTL
   */
  readonly side?: "leading" | "trailing";
  /**
   * Width of the drawer.
   * Semantic sizes: "small" (~280pt), "medium" (~360pt), "large" (~440pt).
   * Numeric values are interpreted as points/dp.
   */
  readonly width?: "small" | "medium" | "large" | number;
  /** Whether the user can dismiss by tapping the scrim. */
  readonly dismissible?: boolean;
}
```

Platform mapping:
- iOS: Slide-in overlay panel
- iPadOS: Overlay panel on the leading/trailing edge
- macOS: Overlay side panel
- Android: `DrawerLayout`
- Electron: Overlay panel

### 5.3 App Windows

App windows open the same app at a route in a separate native window. Only
supported on platforms with a windowing model.

```ts
interface AppWindowConfig extends ChildWebviewBase {
  readonly title?: string;
  readonly size?: { readonly width: number; readonly height: number };
  readonly minSize?: { readonly width: number; readonly height: number };
  readonly resizable?: boolean;
  /** Blocks interaction with the opener window while open. */
  readonly modal?: boolean;
}
```

Platform mapping:
- macOS: `NSWindow`
- Electron: `BrowserWindow`
- iOS/Android: **Not supported.** The platform layer logs a warning and ignores
  the config. Use a sheet or drawer instead.

### 5.4 Popovers

Small floating panels anchored to a UI element. Fall back to sheets on small
screens.

```ts
interface PopoverConfig extends ChildWebviewBase {
  readonly size?: { readonly width: number; readonly height: number };
  /**
   * ID of a DOM element in the main webview that the popover anchors to.
   * The platform uses the element's bounding box as the source rect.
   */
  readonly anchorElementId?: string;
}
```

Platform mapping:
- iPadOS: `UIPopoverPresentationController`
- macOS: `NSPopover`
- iOS phone: Falls back to a medium sheet
- Android: Falls back to a sheet
- Electron: Custom floating window

---

## 6. ChromeState

The `ChromeState` type is the complete description of all chrome. It is used
in `nativite.config.ts` (`defaultChrome`) and internally by the runtime.

```ts
interface ChromeState {
  /** Title bar / navigation bar / window title bar. */
  readonly titleBar?: TitleBarConfig;
  /** Primary navigation (tab bar / sidebar). */
  readonly navigation?: NavigationConfig;
  /** Secondary sidebar panel. */
  readonly sidebarPanel?: SidebarPanelConfig;
  /** Supplementary action toolbar. */
  readonly toolbar?: ToolbarConfig;
  /** Keyboard input accessory. */
  readonly keyboard?: KeyboardConfig;
  /** iOS/Android status bar. */
  readonly statusBar?: StatusBarConfig;
  /** iOS home indicator. */
  readonly homeIndicator?: HomeIndicatorConfig;
  /** macOS/Electron menu bar. */
  readonly menuBar?: MenuBarConfig;

  // ── Child webviews — keyed by developer-chosen name ─────────────────────────
  readonly sheets?: Readonly<Record<string, SheetConfig>>;
  readonly drawers?: Readonly<Record<string, DrawerConfig>>;
  readonly appWindows?: Readonly<Record<string, AppWindowConfig>>;
  readonly popovers?: Readonly<Record<string, PopoverConfig>>;
}
```

---

## 7. Runtime API

### 7.1 `chrome()` — declaration and cleanup

`chrome` is a callable function. Each call declares a set of chrome area
descriptors and returns a cleanup function. When the cleanup function is called,
only the areas declared in that call are restored to what they were before the
call — all other areas are untouched.

```ts
declare function chrome(...elements: ChromeElement[]): () => void;
```

Calls stack: if two calls both declare `titleBar`, the most recent wins. When
the more recent call's cleanup runs, the earlier call's `titleBar` value is
restored. This makes React `useEffect` cleanup trivial — just `return chrome(...)`.

`chrome` also carries the event and messaging APIs as properties:

```ts
declare namespace chrome {
  /** Subscribe to a specific event type. Returns an unsubscribe function. */
  function on<T extends ChromeEventType>(
    type: T,
    handler: (event: Extract<ChromeEvent, { readonly type: T }>) => void,
  ): () => void;

  /** Subscribe to all chrome events. Returns an unsubscribe function. */
  function on(handler: (event: ChromeEvent) => void): () => void;

  /** Inter-webview messaging. */
  const messaging: ChromeMessaging;
}
```

### 7.2 Factory functions

Each chrome area has a corresponding factory function that constructs a
`ChromeElement` descriptor for use in `chrome()`. These are named exports from
`nativite/chrome`.

```ts
// Chrome area factories
declare function titleBar(config: TitleBarConfig): ChromeElement;
declare function navigation(config: NavigationConfig): ChromeElement;
declare function toolbar(config: ToolbarConfig): ChromeElement;
declare function sidebarPanel(config: SidebarPanelConfig): ChromeElement;
declare function keyboard(config: KeyboardConfig): ChromeElement;
declare function statusBar(config: StatusBarConfig): ChromeElement;
declare function homeIndicator(config: HomeIndicatorConfig): ChromeElement;
declare function menuBar(config: MenuBarConfig): ChromeElement;

// Child webview factories — take a name and a config
declare function sheet(name: string, config: SheetConfig): ChromeElement;
declare function drawer(name: string, config: DrawerConfig): ChromeElement;
declare function appWindow(name: string, config: AppWindowConfig): ChromeElement;
declare function popover(name: string, config: PopoverConfig): ChromeElement;

// Item constructors — convenience wrappers with full type inference
declare function button(config: ButtonItem): ButtonItem;
declare function navItem(config: NavigationItem): NavigationItem;
declare function menuItem(config: MenuItem): MenuItem;
```

**Why factory functions rather than plain object literals?**

Plain object literals work and are always accepted by the config interfaces.
Factory functions add three things:
1. Each factory is a named unit — `titleBar({ ... })` reads like a JSX element
   (`<TitleBar ... />`), making chrome declarations scan visually the same way
   a component tree does.
2. They serve as natural composition boundaries — you can extract
   `const myNav = navigation({ ... })` into a shared module with clear intent.
3. `button()`, `navItem()`, `menuItem()` provide inference sites — TypeScript
   infers the narrowest type from the literal, which plain object literals in
   arrays sometimes fail to do.

### 7.3 Messaging

```ts
interface ChromeMessaging {
  /**
   * Send a JSON-encoded message to the parent webview.
   * No-op if this is the main webview (has no parent).
   */
  postToParent(payload: unknown): void;

  /**
   * Send a message to a named child webview.
   * No-op if the named child webview is not currently presented.
   */
  postToChild(name: string, payload: unknown): void;

  /**
   * Send a message to all currently-presented child webviews.
   */
  broadcast(payload: unknown): void;

  /**
   * Subscribe to incoming messages.
   * `from` is the child webview name, or "main" for the main webview.
   * Returns an unsubscribe function.
   */
  onMessage(handler: (from: string | "main", payload: unknown) => void): () => void;
}
```

**Why a first-class messaging API?**

The current API routes messages through `sheet.postMessage` / `sheet.onMessage`
— a one-to-one, asymmetric channel that relies on `window.nativiteSheet` inside
the child. The new API is symmetric: any webview can address any other by name.
The payload is always JSON-encoded. `postToParent` works regardless of what kind
of container the child webview is (sheet, drawer, window, popover).

---

## 8. Events

All events use a discriminated union on `type`, so TypeScript narrows the event
object automatically inside `chrome.on()` handlers.

```ts
type ChromeEvent =
  // Title bar
  | { readonly type: "titleBar.leadingItemTapped";  readonly id: string }
  | { readonly type: "titleBar.trailingItemTapped"; readonly id: string }
  | { readonly type: "titleBar.menuItemSelected";   readonly id: string }
  | { readonly type: "titleBar.backTapped" }
  | { readonly type: "titleBar.searchBar.changed";   readonly value: string }
  | { readonly type: "titleBar.searchBar.submitted"; readonly value: string }
  | { readonly type: "titleBar.searchBar.cancelled" }

  // Primary navigation
  | { readonly type: "navigation.itemSelected"; readonly id: string }

  // Secondary sidebar panel
  | { readonly type: "sidebarPanel.itemSelected"; readonly id: string }

  // Toolbar
  | { readonly type: "toolbar.itemTapped";       readonly id: string }
  | { readonly type: "toolbar.menuItemSelected"; readonly id: string }

  // Keyboard accessory
  | { readonly type: "keyboard.accessoryItemTapped"; readonly id: string }

  // macOS menu bar
  | { readonly type: "menuBar.itemSelected"; readonly id: string }

  // Child webviews — all carry the name key for disambiguation
  | { readonly type: "sheet.presented";     readonly name: string }
  | { readonly type: "sheet.dismissed";     readonly name: string }
  | { readonly type: "sheet.detentChanged"; readonly name: string; readonly detent: string }
  | { readonly type: "sheet.loadFailed";    readonly name: string; readonly message: string; readonly code: number }
  | { readonly type: "drawer.presented";    readonly name: string }
  | { readonly type: "drawer.dismissed";    readonly name: string }
  | { readonly type: "appWindow.presented"; readonly name: string }
  | { readonly type: "appWindow.dismissed"; readonly name: string }
  | { readonly type: "popover.presented";   readonly name: string }
  | { readonly type: "popover.dismissed";   readonly name: string }

  // Messaging
  | { readonly type: "message"; readonly from: string | "main"; readonly payload: unknown }

  // System
  | { readonly type: "safeArea.changed"; readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };

type ChromeEventType = ChromeEvent["type"];
```

**Changes from current `ChromeEventMap`:**

- Migrated from a `Record<string, DataType>` map to a discriminated union,
  enabling exhaustiveness checking and automatic narrowing in handlers.
- `navigationBar.buttonTapped` split into `titleBar.leadingItemTapped` and
  `titleBar.trailingItemTapped` — the old event did not indicate which side.
- `tabBar.tabSelected` → `navigation.itemSelected`.
- `sidebar.itemSelected` → `sidebarPanel.itemSelected`.
- Child webview events now carry `name` to disambiguate multiple instances.
- `sheet.message` removed; replaced by the unified `message` event.
- `toolbar.menuItemSelected` is new — the old API conflated menu selections with
  button taps.

---

## 9. Platform Equivalency Table

| Chrome area | iOS phone | iPadOS | macOS | Android | Electron |
|---|---|---|---|---|---|
| `titleBar` | `UINavigationBar` | `UINavigationBar` | Window titlebar | `ActionBar` | Custom/OS titlebar |
| `navigation` | `UITabBarController` (bottom) | `UITabBarController` or sidebar | `NSSplitView` sidebar | `BottomNavigationView` | Sidebar |
| `sidebarPanel` | Slide-in drawer | `UISplitViewController` column | `NSSplitView` column | Slide-in drawer | Side panel |
| `toolbar` | `UIToolbar` (bottom) | `UIToolbar` (bottom) | `NSToolbar` (top) | Bottom app bar | Custom toolbar |
| `statusBar` | `UIStatusBar` | `UIStatusBar` | ❌ Not applicable | Status bar | ❌ Not applicable |
| `homeIndicator` | Home indicator | Home indicator | ❌ Not applicable | ❌ Not applicable | ❌ Not applicable |
| `keyboard.accessory` | Input accessory view | Input accessory view | ❌ Not applicable | ❌ Not applicable | ❌ Not applicable |
| `menuBar` | ❌ Not applicable | ❌ Not applicable | `NSMenuBar` | ❌ Not applicable | `Menu` |
| `sheets.*` | `UISheetPresentationController` | `UISheetPresentationController` | `NSPanel` | `BottomSheetDialogFragment` | Custom panel |
| `drawers.*` | Custom overlay | Overlay or split view | Overlay side panel | `DrawerLayout` | Side panel |
| `appWindows.*` | ❌ Not supported | ❌ Not supported | `NSWindow` | ❌ Not supported | `BrowserWindow` |
| `popovers.*` | Falls back to sheet | `UIPopoverPresentationController` | `NSPopover` | Falls back to sheet | Custom window |

When a platform does not support a chrome area, the platform layer logs a
development-mode warning and ignores the config silently in production:
- **Not applicable** — the concept does not exist on this platform
- **Not supported** — the platform has the concept but it is not yet implemented
- **Falls back** — a platform-appropriate approximation is used instead

---

## 10. Usage Examples

### 10.1 App-level chrome (entry point)

```ts
import { chrome, navigation, statusBar, navItem } from "nativite/chrome";

// Set up the persistent foundation once at app boot.
// No cleanup needed — this lives for the lifetime of the app.
chrome(
  navigation({
    items: [
      navItem({ id: "home",    label: "Home",    icon: "house" }),
      navItem({ id: "inbox",   label: "Inbox",   icon: "tray" }),
      navItem({ id: "profile", label: "Profile", icon: "person.circle" }),
    ],
    activeItem: "home",
  }),
  statusBar({ style: "auto" }),
);

chrome.on("navigation.itemSelected", ({ id }) => {
  router.navigate(`/${id}`);
});
```

### 10.2 Per-screen chrome

Each screen declares only the areas it owns. Calling `chrome()` returns a
cleanup that restores exactly those areas when the screen unmounts.

```ts
import { chrome, titleBar, navigation, toolbar, button } from "nativite/chrome";

// ── Inbox screen ─────────────────────────────────────────────────────────────
function mountInbox() {
  return chrome(
    titleBar({ title: "Inbox", largeTitleMode: "large" }),
    navigation({ activeItem: "inbox" }),
    // toolbar not declared — no toolbar on this screen
  );
}

// ── Thread screen ─────────────────────────────────────────────────────────────
function mountThread(thread: Thread) {
  return chrome(
    titleBar({ title: thread.subject }),
    // navigation not declared — tab bar from app-level chrome shows through
    toolbar({
      items: [
        button({ id: "reply",   icon: "arrowshape.turn.up.left" }),
        { type: "flexible-space" },
        button({ id: "archive", icon: "archivebox" }),
      ],
    }),
  );
}

// Router wires lifecycle:
let cleanup: (() => void) | null = null;

router.on("enter:inbox",  ()       => { cleanup = mountInbox(); });
router.on("enter:thread", (thread) => { cleanup = mountThread(thread); });
router.on("leave",        ()       => { cleanup?.(); cleanup = null; });
```

### 10.3 React `useEffect` integration

`chrome()` returning a cleanup function makes React integration a single line:

```tsx
import { chrome, titleBar, toolbar, button } from "nativite/chrome";

function ThreadScreen({ thread }: { thread: Thread }) {
  useEffect(() => {
    return chrome(
      titleBar({ title: thread.subject }),
      toolbar({
        items: [
          button({ id: "reply",   icon: "arrowshape.turn.up.left" }),
          button({ id: "archive", icon: "archivebox" }),
        ],
      }),
    );
  }, [thread.subject]);

  // ...
}
```

When `thread.subject` changes, React calls the cleanup (restoring the previous
title and removing the toolbar) then re-runs the effect with the new values.
When the component unmounts, the same cleanup runs automatically.

Events compose cleanly alongside chrome declarations:

```tsx
useEffect(() => {
  const offChrome = chrome(
    titleBar({ title: thread.subject }),
    toolbar({ items: [button({ id: "reply", icon: "arrowshape.turn.up.left" })] }),
  );

  const offEvents = chrome.on("toolbar.itemTapped", ({ id }) => {
    if (id === "reply") openReply();
  });

  return () => {
    offChrome();
    offEvents();
  };
}, [thread.subject]);
```

### 10.4 Shared chrome as plain variables

Because factory calls return plain values, reusable chrome pieces are just
variables or functions — no special API required:

```ts
import { navigation, navItem, button } from "nativite/chrome";

// Shared across all screens that show primary navigation:
const mainNav = (activeItem: string) =>
  navigation({
    items: [
      navItem({ id: "home",  label: "Home",  icon: "house" }),
      navItem({ id: "inbox", label: "Inbox", icon: "tray" }),
    ],
    activeItem,
  });

// Reused without duplication:
chrome(titleBar({ title: "Home" }),  mainNav("home"));
chrome(titleBar({ title: "Inbox" }), mainNav("inbox"));
```

### 10.5 Unified button menus

The same `ButtonItem` with `menu` works in the title bar, toolbar, and keyboard
accessory — no special types required:

```ts
import { button, menuItem } from "nativite/chrome";

const sortButton = button({
  id: "sort",
  icon: "arrow.up.arrow.down",
  menu: {
    title: "Sort by",
    items: [
      menuItem({ id: "sort-name", label: "Name", checked: true }),
      menuItem({ id: "sort-date", label: "Date" }),
      menuItem({ id: "sort-size", label: "Size" }),
    ],
  },
});

// In the title bar trailing area:
chrome(titleBar({ trailingItems: [sortButton] }));

// Or in the toolbar — same object, no changes:
chrome(toolbar({ items: [sortButton] }));
```

### 10.6 Presenting a named sheet

```ts
import { chrome, sheet } from "nativite/chrome";

// Present:
chrome(
  sheet("settings", {
    url: "/settings",
    presented: true,
    detents: ["medium", "large"],
    activeDetent: "medium",
    grabberVisible: true,
  }),
);

// Dismiss when the user swipes it down:
chrome.on("sheet.dismissed", ({ name }) => {
  if (name === "settings") {
    chrome(sheet("settings", { url: "/settings", presented: false }));
  }
});
```

### 10.7 Messaging between webviews

```ts
// ── Main webview ──────────────────────────────────────────────────────────────
chrome.messaging.onMessage((from, payload) => {
  if (from === "settings") {
    const msg = payload as { type: string };
    if (msg.type === "saved") {
      chrome(sheet("settings", { url: "/settings", presented: false }));
    }
  }
});

// ── Settings sheet webview (/settings) ───────────────────────────────────────
async function handleSave() {
  await saveToServer(gatherForm());
  chrome.messaging.postToParent({ type: "saved" });
}
```

### 10.8 macOS window and menu bar

```ts
import { chrome, titleBar, menuBar, appWindow, menuItem } from "nativite/chrome";

chrome(
  titleBar({
    title: "My App",
    subtitle: "Document.md",
    fullSizeContent: true,
    separatorStyle: "none",
  }),
  menuBar({
    menus: [
      {
        id: "view",
        label: "View",
        items: [
          menuItem({ id: "zoom-in",  label: "Zoom In",  keyEquivalent: "+" }),
          menuItem({ id: "zoom-out", label: "Zoom Out", keyEquivalent: "-" }),
          menuItem({ id: "reset",    label: "Reset Zoom" }),
        ],
      },
    ],
  }),
  appWindow("preferences", {
    url: "/preferences",
    presented: false,
    title: "Preferences",
    size: { width: 640, height: 480 },
    resizable: false,
  }),
);

chrome.on("menuBar.itemSelected", ({ id }) => {
  if (id === "zoom-in") zoomIn();
});
```

---

## 11. Static Config Integration

`ChromeState` is used in `nativite.config.ts` as `defaultChrome`. This
describes the initial chrome before any runtime `chrome()` calls have been made.
It is a plain object (no factory functions required here).

```ts
// nativite.config.ts
import { defineConfig, ios, macos } from "nativite";

export default defineConfig({
  app: { name: "My App", bundleId: "com.example.myapp", version: "1.0", buildNumber: 1 },
  platforms: [ios({ minimumVersion: "17.0" }), macos({ minimumVersion: "14.0" })],

  defaultChrome: {
    navigation: {
      items: [
        { id: "home",    label: "Home",    icon: "house" },
        { id: "explore", label: "Explore", icon: "magnifyingglass" },
        { id: "profile", label: "Profile", icon: "person.circle" },
      ],
      activeItem: "home",
    },
    statusBar: { style: "auto" },
  },
});
```

---

## 12. Migration from Current API

### Renamed concepts

| Current | New | Notes |
|---|---|---|
| `navigationBar` | `titleBar` | Covers window title bar too |
| `searchBar` (top-level) | `titleBar.searchBar` | Nested where it belongs |
| `tabBar` | `navigation` | Adapts to sidebar automatically |
| `sidebar` | `sidebarPanel` | Secondary panel; `navigation` is primary |
| `window` (macOS) | `titleBar` + `appWindows.*` | Title bar config in titleBar; new windows in appWindows |
| `sheet` (single) | `sheets.*` (named) | Multiple sheets supported |

### Renamed event names

| Current | New |
|---|---|
| `navigationBar.buttonTapped` | `titleBar.leadingItemTapped` or `titleBar.trailingItemTapped` |
| `navigationBar.backTapped` | `titleBar.backTapped` |
| `tabBar.tabSelected` | `navigation.itemSelected` |
| `toolbar.buttonTapped` | `toolbar.itemTapped` |
| `searchBar.textChanged` | `titleBar.searchBar.changed` |
| `searchBar.submitted` | `titleBar.searchBar.submitted` |
| `searchBar.cancelled` | `titleBar.searchBar.cancelled` |
| `sheet.detentChanged` | `sheet.detentChanged` (now carries `name`) |
| `sheet.dismissed` | `sheet.dismissed` (now carries `name`) |
| `sheet.message` | `message` event via `chrome.messaging` |
| `sidebar.itemSelected` | `sidebarPanel.itemSelected` |
| `keyboard.accessory.itemTapped` | `keyboard.accessoryItemTapped` |

### API changes

| Current | New |
|---|---|
| `chrome.navigationBar.setTitle("x")` | `chrome(titleBar({ title: "x" }))` |
| `chrome.navigationBar.show()` | `chrome(titleBar({ hidden: false }))` |
| `chrome.navigationBar.setToolbarRight([...])` | `chrome(titleBar({ trailingItems: [...] }))` |
| `chrome.tabBar.setTabs([...])` | `chrome(navigation({ items: [...] }))` |
| `chrome.sheet.present()` | `chrome(sheet("name", { url, presented: true }))` |
| `chrome.sheet.postMessage(x)` | `chrome.messaging.postToParent(x)` (in child) or `chrome.messaging.postToChild("name", x)` (from main) |
| `chrome.set({ ... })` | `chrome(titleBar(...), navigation(...), ...)` |
| `chrome.on("event", h)` → unsub | `chrome.on("event", h)` → unsub (unchanged) |
| `chrome.off("event", h)` | Use the returned unsubscribe function |

### Renamed types

| Current | New |
|---|---|
| `BarButtonItem` | `ButtonItem` |
| `ToolbarButtonItem` | `ButtonItem` (same type everywhere) |
| `ToolbarMenuItem` | `MenuItem` |
| `ToolbarButtonMenu` | `MenuConfig` |
| `KeyboardAccessoryItem` | `BarItem` |
| `SheetDetent` | `"small" \| "medium" \| "large" \| "full"` (adds `"full"`) |
| `ChromeEventMap` (Record) | `ChromeEvent` (discriminated union) |
