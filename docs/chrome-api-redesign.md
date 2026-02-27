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
There is no way to describe a sidebar child webview, a drawer, or (on macOS) a
second window, all of which are common patterns. And the sheet's messaging API
(`sheet.postMessage` / `sheet.onMessage`) is one-to-one with the sheet; there
is no broadcast or peer-to-peer model.

The `sheet.postMessage` implementation also has a quirk: inside the sheet webview
itself it routes through `window.nativiteSheet.postMessage`, exposing an
implementation detail as a semi-public global.

### 1.4 `searchBar` is not part of `navigationBar`

On every native platform a search bar lives inside (or immediately adjacent to)
the navigation/title bar. Having `chrome.searchBar` as a sibling of
`chrome.navigationBar` implies they are independent, but in practice the native
implementation ties them together. The separation also means you need two
separate state senders and two separate `ChromeState` keys for what is a single
component.

### 1.5 `window` conflicts with the global `window`

`chrome.window` is a namespace for macOS window chrome. Having `.window` on a
singleton is a collision risk with reader expectations and autocomplete noise
(`chrome.window.set...` looks like it could be a DOM op). The concept also
needs a richer equivalent on non-macOS platforms rather than simply being absent.

### 1.6 `sidebar` is ambiguous

`SidebarState` describes iPad/macOS primary navigation (a list of selectable
items replacing the tab bar). But "sidebar" also suggests a secondary panel —
think a document browser's folder list, or a filter drawer. Having one word mean
both makes the design harder to extend.

### 1.7 Platform gaps are not systematic

Some chrome areas only make sense on some platforms (e.g. `homeIndicator` is
iOS-only, `menuBar` is macOS/Electron-only) but this is not modelled in the
type system at all. A user calling `chrome.window.setTitle()` from an iOS app
gets nothing, with no feedback. Platform support should be declared in types,
not discovered at runtime.

---

## 2. Design Goals

1. **A single, unified set of primitive item types** used everywhere that buttons
   and menus appear.
2. **Declarative state** — describe the whole chrome as a plain object; the
   library reconciles it. One call, one bridge message.
3. **Named child webviews** as a first-class concept, supporting sheets, drawers,
   popovers, and (on desktop) windows, all with a consistent messaging interface.
4. **Platform-neutral naming** that maps naturally to each platform's idioms
   without exposing UIKit/AppKit vocabulary in the public API.
5. **Composable event system** — a single typed `chrome.on()` for all events,
   no per-method listeners.
6. **Observable state** — `chrome.getState()` returns the current snapshot.
7. **Graceful, documented unavailability** — platform-specific chrome areas are
   typed as optional; the platform layer ignores unknown areas silently but the
   type system and docs say why.

---

## 3. Core Primitive Types

These are the building blocks used in every chrome area that renders interactive
items. Unifying them is the single highest-leverage change in this redesign.

### 3.1 ButtonItem

Used anywhere a tappable button or icon can appear: navigation bar, toolbar,
keyboard accessory.

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
   * On Electron this will be a path or named icon.
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
   * firing a "buttonTapped" event.
   */
  readonly menu?: MenuConfig;
}
```

### 3.2 MenuConfig and MenuItem

Used wherever a hierarchical menu appears: button menus, macOS menu bar, sidebar
context menus.

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
   * "destructive" — rendered in red; platform may show confirmation.
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

Used in `navigation.items` (primary nav — tabs / sidebar):

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

**Replaces:** `TabBarState` (partially) and `SidebarState` (partially)

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
active section of the app. Apple's own SwiftUI API (`TabView`) uses one type
that adapts to both representations. Nativite should do the same. A developer
should not need to understand the underlying UIKit implementation (tab bar
controller vs split view controller) to achieve adaptive navigation.

The `style: "auto"` default means iPhone gets a tab bar, iPad/macOS get a
sidebar — all from the same config.

---

### 4.3 Toolbar (Supplementary)

**Replaces:** `ToolbarState`

The toolbar is a secondary row of actions that is contextual to what is
currently visible. On iOS it sits at the bottom; on macOS it is `NSToolbar`
(typically at the top, integrated with the window chrome).

```ts
interface ToolbarConfig {
  readonly items: readonly BarItem[];
  readonly hidden?: boolean;
}
```

The simplification here is intentional: `BarItem` is reused, so a toolbar
button looks identical to a navigation bar button. The `menu` field on
`ButtonItem` gives inline menus where needed.

---

### 4.4 Sidebar Panel (Secondary)

**New concept** (partially overlaps with old `SidebarState`)

A secondary sidebar panel for supplementary navigation, such as a file tree,
filter list, or outline view. Unlike primary navigation, this is an always-
visible panel that does not replace the main content area.

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

Note that `accessory.items` uses `BarItem[]` — the same unified type — so a
keyboard accessory button and a nav bar button are the same shape. Code is
shareable across all bar contexts.

Platform support: iOS, iPadOS. Silently ignored on macOS (hardware keyboard
normal) and Electron.

---

### 4.8 Menu Bar

**Replaces:** `MenuBarState`

```ts
interface MenuBarConfig {
  /**
   * Extra menus appended after the OS built-in menus (Apple, File, Edit...).
   * Each menu corresponds to one top-level menu bar entry.
   */
  readonly menus: readonly {
    readonly id: string;
    readonly label: string;
    readonly items: readonly MenuItem[];
  }[];
}
```

`MenuItem` is now the same unified type used in button menus, so macOS menu bar
items and button dropdown items are structurally identical. Platform support:
macOS, Electron. Silently ignored elsewhere.

---

## 5. Child Webviews

**Replaces and generalises:** `SheetState`

Every app has one "main" webview. A child webview mounts the same app at a
specific URL/route, presented within a platform chrome container (sheet, drawer,
window, popover). Multiple child webviews can coexist.

Child webviews are identified by a **developer-chosen name** (a plain string
key). The name is the address used by the messaging API.

All child webview config types share a common base:

```ts
interface ChildWebviewBase {
  /**
   * The URL to load in this child webview.
   * "/route" keeps the same host (dev server in dev, SPA entry in prod).
   * Relative paths resolve against the main webview URL.
   */
  readonly url: string;
  /** Whether the child webview is currently presented. */
  readonly presented?: boolean;
  /**
   * Background colour of the container (hex string, e.g. "#FFFFFF").
   * Useful for matching the app's background to avoid flash-of-white.
   */
  readonly backgroundColor?: string;
}
```

### 5.1 Sheets

```ts
interface SheetConfig extends ChildWebviewBase {
  /**
   * Available stop positions for the sheet.
   * "small"  — ~25% of screen height
   * "medium" — ~50% of screen height
   * "large"  — ~90% of screen height
   * "full"   — full screen
   */
  readonly detents?: readonly ("small" | "medium" | "large" | "full")[];
  readonly activeDetent?: "small" | "medium" | "large" | "full";
  readonly grabberVisible?: boolean;
  /**
   * Whether the user can dismiss the sheet by swiping down.
   * When false, the app must dismiss it programmatically.
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
   * "leading" — left on LTR, right on RTL
   * "trailing" — right on LTR, left on RTL
   */
  readonly side?: "leading" | "trailing";
  /**
   * Width of the drawer.
   * Semantic sizes: "small" (~280pt), "medium" (~360pt), "large" (~440pt).
   * Numeric value is interpreted as points/dp.
   */
  readonly width?: "small" | "medium" | "large" | number;
  /** Whether the user can dismiss by tapping the scrim behind the drawer. */
  readonly dismissible?: boolean;
}
```

Platform mapping:
- iOS: Slide-in panel over content
- iPadOS: Overlay panel on the leading/trailing edge
- macOS: Overlay side panel
- Android: `DrawerLayout`
- Electron: Overlay panel

### 5.3 Windows

Windows open the app in a separate native window. Only supported on platforms
where the windowing model allows it.

```ts
interface WindowConfig extends ChildWebviewBase {
  readonly title?: string;
  readonly size?: { readonly width: number; readonly height: number };
  readonly minSize?: { readonly width: number; readonly height: number };
  readonly resizable?: boolean;
  /** Blocks interaction with the parent window while open. */
  readonly modal?: boolean;
}
```

Platform mapping:
- macOS: `NSWindow`
- Electron: `BrowserWindow`
- iOS/Android: **Not supported.** The platform layer will log a warning and
  ignore the config. Use a sheet or drawer instead.

### 5.4 Popovers

Small floating panels anchored to a UI element. On small screens they fall back
to sheets.

```ts
interface PopoverConfig extends ChildWebviewBase {
  readonly size?: { readonly width: number; readonly height: number };
  /**
   * DOM element ID (in the main webview) that the popover anchors to.
   * The platform uses the element's bounding box as the anchor point.
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

## 6. Full ChromeState

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

  // ── Child webviews ──────────────────────────────────────────────────────────
  // All are records keyed by a developer-chosen name.
  readonly sheets?: Readonly<Record<string, SheetConfig>>;
  readonly drawers?: Readonly<Record<string, DrawerConfig>>;
  readonly windows?: Readonly<Record<string, WindowConfig>>;
  readonly popovers?: Readonly<Record<string, PopoverConfig>>;
}
```

The same `ChromeState` type is used in:
- `nativite.config.ts` (`defaultChrome`) — static initial state
- `nativite/chrome` runtime API — dynamic state updates

---

## 7. Runtime API

### 7.1 The `chrome` singleton

```ts
export declare const chrome: {
  /**
   * Deep-merge a partial state patch into the current chrome state.
   * Only the keys present in `patch` are applied; all other keys are
   * left unchanged.
   *
   * @example
   * // Update only the title — other titleBar fields are preserved.
   * chrome.update({ titleBar: { title: "Settings" } });
   */
  update(patch: DeepPartial<ChromeState>): void;

  /**
   * Fully replace the chrome state. All chrome areas are reset to
   * the values given (or to their defaults for any omitted keys).
   */
  set(state: ChromeState): void;

  /**
   * Return a deep-frozen snapshot of the current chrome state.
   */
  getState(): Readonly<ChromeState>;

  /**
   * Subscribe to a specific chrome event type (type-safe).
   * Returns an unsubscribe function.
   *
   * @example
   * const off = chrome.on("titleBar.trailingItemTapped", ({ id }) => { ... });
   * off(); // unsubscribe
   */
  on<T extends ChromeEventType>(
    type: T,
    handler: (event: Extract<ChromeEvent, { readonly type: T }>) => void,
  ): () => void;

  /**
   * Subscribe to all chrome events.
   * Returns an unsubscribe function.
   */
  on(handler: (event: ChromeEvent) => void): () => void;

  /** Inter-webview messaging. */
  readonly messaging: ChromeMessaging;
};
```

**Key changes from current API:**

- `update()` replaces the per-element setters (`setTitle`, `show`, `hide`,
  `configure`...). One method, one call, one bridge message per update.
- `set()` fully replaces state (was `chrome.set()` — same semantics, but now
  that `update()` handles merging, `set()` is a clear reset/replace operation).
- `getState()` is new — the current API is write-only.
- `on()` is overloaded: typed event name → typed handler, or handler for all
  events. The per-namespace `on*` methods (e.g. `onButtonTap`, `onSelect`) are
  removed; they added API surface without adding capability.
- `off()` is removed. The `on()` return value (an unsubscribe function) is
  sufficient and follows the established pattern in the codebase.

### 7.2 Messaging

```ts
interface ChromeMessaging {
  /**
   * Send a JSON-encoded message to the parent webview.
   * No-op if this is the main webview (has no parent).
   */
  postToParent(payload: unknown): void;

  /**
   * Send a message to a named child webview.
   * `name` must match a key in sheets/drawers/windows/popovers.
   * No-op if the named child webview is not currently presented.
   */
  postToChild(name: string, payload: unknown): void;

  /**
   * Send a message to all currently-presented child webviews.
   */
  broadcast(payload: unknown): void;

  /**
   * Subscribe to incoming messages.
   * `from` is the name of the sender: the string key of the child webview,
   * or "main" if the message came from the main webview.
   * Returns an unsubscribe function.
   */
  onMessage(handler: (from: string | "main", payload: unknown) => void): () => void;
}
```

**Why a first-class messaging API?**

The current API only allows the sheet to send a message to the main webview and
vice versa, via `sheet.postMessage` / `sheet.onMessage`. This routing is
asymmetric, one-to-one, and relies on a `window.nativiteSheet` global inside the
child — an implementation detail leaking into the public API.

With named child webviews and a unified messaging interface, any webview can
address any other by name. The payload is always JSON-encoded. The API is
symmetric from every webview's perspective.

---

## 8. Events

All events use a discriminated union on `type`:

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
  | { readonly type: "window.presented";    readonly name: string }
  | { readonly type: "window.dismissed";    readonly name: string }
  | { readonly type: "popover.presented";   readonly name: string }
  | { readonly type: "popover.dismissed";   readonly name: string }

  // Messaging
  | { readonly type: "message"; readonly from: string | "main"; readonly payload: unknown }

  // System
  | { readonly type: "safeArea.changed"; readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };

type ChromeEventType = ChromeEvent["type"];
```

**Changes from current `ChromeEventMap`:**

- Migrated from a `Record<string, DataType>` map to a discriminated union. This
  gives proper exhaustiveness checking and narrows the event object type inside
  `on()` handlers automatically.
- `navigationBar.buttonTapped` split into `titleBar.leadingItemTapped` and
  `titleBar.trailingItemTapped` — the existing event does not distinguish which
  side of the bar the button was on.
- `tabBar.tabSelected` → `navigation.itemSelected` to match the renamed area.
- `sidebar.itemSelected` → `sidebarPanel.itemSelected`.
- `sheet.detentChanged`, `sheet.dismissed`, `sheet.loadFailed` now carry `name`
  so that multiple named sheets can be disambiguated from a single handler.
- `sheet.message` removed; replaced by the unified `message` event via
  `chrome.messaging`.
- `toolbar.menuItemSelected` is new — the current API fires `toolbar.buttonTapped`
  even for menu item selections, conflating two different interactions.

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
| `drawers.*` | Custom overlay | Overlay or `UISplitViewController` | Overlay side panel | `DrawerLayout` | Side panel |
| `windows.*` | ❌ Not supported | ❌ Not supported | `NSWindow` | ❌ Not supported | `BrowserWindow` |
| `popovers.*` | Falls back to sheet | `UIPopoverPresentationController` | `NSPopover` | Falls back to sheet | Custom window |

When a platform does not support a chrome area, the platform layer logs a
development-mode warning and ignores the config silently in production. The
reason for non-support is always one of three categories:
- **Not applicable** — the concept simply does not exist on this platform
  (e.g. home indicator on macOS)
- **Not supported** — the platform has the concept but Nativite has not yet
  implemented it
- **Falls back** — a reasonable approximation is used instead

---

## 10. Usage Examples

### 10.1 Basic navigation setup

```ts
import { chrome } from "nativite/chrome";

chrome.set({
  titleBar: {
    title: "Inbox",
    largeTitleMode: "large",
    trailingItems: [
      { id: "compose", icon: "square.and.pencil", style: "primary" },
    ],
  },
  navigation: {
    items: [
      { id: "inbox",   label: "Inbox",   icon: "tray" },
      { id: "sent",    label: "Sent",    icon: "paperplane" },
      { id: "archive", label: "Archive", icon: "archivebox" },
    ],
    activeItem: "inbox",
  },
});

chrome.on("titleBar.trailingItemTapped", ({ id }) => {
  if (id === "compose") openComposer();
});

chrome.on("navigation.itemSelected", ({ id }) => {
  router.navigate(`/${id}`);
});
```

### 10.2 Contextual toolbar update

```ts
// When a list item is selected, show contextual actions
function onItemSelected() {
  chrome.update({
    toolbar: {
      items: [
        { id: "delete", label: "Delete", icon: "trash", style: "destructive" },
        { type: "flexible-space" },
        { id: "share", label: "Share", icon: "square.and.arrow.up" },
      ],
    },
  });
}

// When selection is cleared, hide the toolbar
function onSelectionCleared() {
  chrome.update({ toolbar: { hidden: true } });
}

chrome.on("toolbar.itemTapped", ({ id }) => {
  if (id === "delete") deleteSelectedItem();
  if (id === "share") shareSelectedItem();
});
```

### 10.3 Presenting a named sheet

```ts
// Present a settings sheet
chrome.update({
  sheets: {
    settings: {
      url: "/settings",
      presented: true,
      detents: ["medium", "large"],
      activeDetent: "medium",
      grabberVisible: true,
    },
  },
});

// Dismiss when the platform swipes it down
chrome.on("sheet.dismissed", ({ name }) => {
  if (name === "settings") {
    chrome.update({ sheets: { settings: { presented: false } } });
  }
});
```

### 10.4 Messaging between webviews

```ts
// ── In the main webview ──────────────────────────────────────────────────────
chrome.messaging.onMessage((from, payload) => {
  if (from === "settings") {
    const data = payload as { type: string; value: unknown };
    if (data.type === "saved") {
      applySettings(data.value);
      chrome.update({ sheets: { settings: { presented: false } } });
    }
  }
});

// ── In the settings sheet webview (/settings) ────────────────────────────────
async function handleSave() {
  const formData = gatherForm();
  await saveToServer(formData);
  chrome.messaging.postToParent({ type: "saved", value: formData });
}
```

### 10.5 Multiple simultaneous child webviews

```ts
// Main webview manages a sheet and a drawer at the same time
chrome.update({
  sheets: {
    filters: {
      url: "/filters",
      presented: true,
      detents: ["medium"],
    },
  },
  drawers: {
    nav: {
      url: "/nav",
      presented: false,
      side: "leading",
    },
  },
});

// Broadcast to all currently-presented child webviews when theme changes
function applyTheme(theme: "light" | "dark") {
  chrome.messaging.broadcast({ type: "theme-changed", theme });
}
```

### 10.6 Unified button menus

The same `ButtonItem` with `menu` works in the nav bar, toolbar, and keyboard
accessory — no special types required:

```ts
const sortButton: ButtonItem = {
  id: "sort",
  icon: "arrow.up.arrow.down",
  menu: {
    title: "Sort by",
    items: [
      { id: "sort-name", label: "Name", checked: true },
      { id: "sort-date", label: "Date" },
      { id: "sort-size", label: "Size" },
    ],
  },
};

// In the nav bar
chrome.update({ titleBar: { trailingItems: [sortButton] } });

// Or in the toolbar — same type, no changes
chrome.update({ toolbar: { items: [sortButton] } });
```

### 10.7 macOS window and menu bar

```ts
chrome.update({
  titleBar: {
    title: "My App",
    subtitle: "Document.md",
    fullSizeContent: true,
    separatorStyle: "none",
  },
  menuBar: {
    menus: [
      {
        id: "view",
        label: "View",
        items: [
          { id: "zoom-in",  label: "Zoom In",  keyEquivalent: "+" },
          { id: "zoom-out", label: "Zoom Out", keyEquivalent: "-" },
          { id: "reset",    label: "Reset Zoom" },
        ],
      },
    ],
  },
  windows: {
    preferences: {
      url: "/preferences",
      presented: false,
      title: "Preferences",
      size: { width: 640, height: 480 },
      resizable: false,
    },
  },
});

chrome.on("menuBar.itemSelected", ({ id }) => {
  if (id === "zoom-in") zoomIn();
});
```

### 10.8 React integration pattern

The core API is framework-agnostic. A thin React wrapper follows naturally:

```tsx
// Hypothetical nativite/react hook (not designed here, shown for illustration)
function useChromeUpdate(state: DeepPartial<ChromeState>, deps: unknown[]) {
  useEffect(() => {
    chrome.update(state);
  }, deps);
}

function InboxScreen() {
  const [selectedCount, setSelectedCount] = useState(0);

  useChromeUpdate(
    {
      titleBar: { title: "Inbox" },
      toolbar: selectedCount > 0
        ? { hidden: false, items: [{ id: "delete", label: `Delete ${selectedCount}`, style: "destructive" }] }
        : { hidden: true },
    },
    [selectedCount],
  );
}
```

---

## 11. Static Config Integration

The `ChromeState` type is also used in `nativite.config.ts` as `defaultChrome`.
The defaults describe the initial chrome visible when the app first loads, before
any runtime `chrome.update()` calls have been made.

```ts
// nativite.config.ts
import { defineConfig, ios, macos } from "nativite";

export default defineConfig({
  app: { name: "My App", bundleId: "com.example.myapp", version: "1.0", buildNumber: 1 },
  platforms: [ios({ minimumVersion: "17.0" }), macos({ minimumVersion: "14.0" })],

  defaultChrome: {
    titleBar: { title: "My App", largeTitleMode: "automatic" },
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
| `searchBar` (top-level in ChromeState) | `titleBar.searchBar` | Nested where it belongs |
| `tabBar` | `navigation` | Adapts to sidebar automatically |
| `sidebar` | `sidebarPanel` | Secondary panel; `navigation` is the primary |
| `window` (macOS) | `titleBar` + `windows.*` | Title bar config is in titleBar; new windows in `windows.*` |
| `sheet` (single) | `sheets.*` (named record) | Multiple sheets supported |

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

### Renamed API methods

| Current | New |
|---|---|
| `chrome.navigationBar.setTitle("x")` | `chrome.update({ titleBar: { title: "x" } })` |
| `chrome.navigationBar.show()` | `chrome.update({ titleBar: { hidden: false } })` |
| `chrome.navigationBar.setToolbarRight([...])` | `chrome.update({ titleBar: { trailingItems: [...] } })` |
| `chrome.tabBar.setTabs([...])` | `chrome.update({ navigation: { items: [...] } })` |
| `chrome.sheet.present()` | `chrome.update({ sheets: { mySheet: { presented: true } } })` |
| `chrome.sheet.postMessage(x)` | `chrome.messaging.postToParent(x)` (inside child) or `chrome.messaging.postToChild("mySheet", x)` (from main) |
| `chrome.on("event", h)` → `unsub` | `chrome.on("event", h)` → `unsub` (unchanged) |
| `chrome.off("event", h)` | Use the returned unsubscribe function instead |

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
