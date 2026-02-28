// ─── Chrome Types ──────────────────────────────────────────────────────────────
// Pure TypeScript types with no runtime imports.
// Imported by both src/chrome/index.ts (runtime) and src/index.ts (config schema).

// ─── Primitive Item Types ─────────────────────────────────────────────────────

export interface ButtonItem {
  readonly id: string;
  /** Visible label. Omit when using icon alone. */
  readonly label?: string;
  /**
   * Platform icon identifier.
   * On iOS/macOS this is an SF Symbol name ("plus", "square.and.arrow.up").
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
   * When present, tapping the button opens the menu rather than firing an
   * itemTapped event.
   */
  readonly menu?: MenuConfig;
}

export interface MenuConfig {
  /** Optional title rendered at the top of the menu. */
  readonly title?: string;
  readonly items: readonly MenuItem[];
}

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly disabled?: boolean;
  /** Renders with a checkmark. */
  readonly checked?: boolean;
  /** "destructive" — rendered in red. */
  readonly style?: "plain" | "destructive";
  /** Key shortcut, e.g. "s" for Cmd+S (macOS/Electron only). */
  readonly keyEquivalent?: string;
  /** Nested submenu. */
  readonly children?: readonly MenuItem[];
}

export type FlexibleSpace = { readonly type: "flexible-space" };
export type FixedSpace = { readonly type: "fixed-space"; readonly width: number };
export type BarItem = ButtonItem | FlexibleSpace | FixedSpace;

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  /** Required: an icon is mandatory for primary navigation items. */
  readonly icon: string;
  readonly badge?: string | number | null;
  readonly disabled?: boolean;
}

export interface SidebarItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly badge?: string | number | null;
  /** Child items for collapsible sections (macOS / iPadOS outline view). */
  readonly children?: readonly SidebarItem[];
}

// ─── Chrome Area Config Interfaces ────────────────────────────────────────────

export interface SearchBarConfig {
  readonly placeholder?: string;
  readonly value?: string;
  readonly cancelButtonVisible?: boolean;
}

export interface TitleBarConfig {
  readonly title?: string;
  /**
   * Secondary line below the title.
   * iOS: rendered as a prompt below the title in the nav bar.
   * macOS: rendered as the window subtitle.
   */
  readonly subtitle?: string;
  /**
   * Display mode for the title on iOS/iPadOS.
   * "large"     — large title above scroll content
   * "inline"    — standard compact title
   * "automatic" — large when at top of scroll, inline when scrolled (default)
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
  readonly hidden?: boolean;
  /**
   * macOS: whether the web content extends underneath the title bar.
   * Equivalent to NSWindow.styleMask.fullSizeContentView.
   */
  readonly fullSizeContent?: boolean;
  /** macOS: separator style between the title bar and content. */
  readonly separatorStyle?: "automatic" | "none" | "line" | "shadow";
}

export interface NavigationConfig {
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

export interface ToolbarConfig {
  readonly items: readonly BarItem[];
  readonly hidden?: boolean;
}

export interface SidebarPanelConfig {
  readonly items: readonly SidebarItem[];
  readonly activeItem?: string;
  readonly title?: string;
  readonly visible?: boolean;
}

export interface StatusBarConfig {
  /**
   * "light"  — white icons (for dark backgrounds)
   * "dark"   — black icons (for light backgrounds)
   * "auto"   — system decides based on colour scheme (default)
   */
  readonly style?: "light" | "dark" | "auto";
  readonly hidden?: boolean;
}

export interface HomeIndicatorConfig {
  readonly hidden?: boolean;
}

export interface KeyboardConfig {
  /** Toolbar rendered above the software keyboard. Pass null to remove. */
  readonly accessory?: { readonly items: readonly BarItem[] } | null;
  readonly dismissMode?: "none" | "onDrag" | "interactive";
}

export interface MenuBarConfig {
  /** Extra menus appended after the OS built-in menus. */
  readonly menus: readonly {
    readonly id: string;
    readonly label: string;
    readonly items: readonly MenuItem[];
  }[];
}

// ─── Child Webview Config Interfaces ─────────────────────────────────────────

interface ChildWebviewBase {
  readonly url: string;
  readonly presented?: boolean;
  readonly backgroundColor?: string;
}

export interface SheetConfig extends ChildWebviewBase {
  readonly detents?: readonly ("small" | "medium" | "large" | "full")[];
  readonly activeDetent?: "small" | "medium" | "large" | "full";
  readonly grabberVisible?: boolean;
  readonly dismissible?: boolean;
  readonly cornerRadius?: number;
}

export interface DrawerConfig extends ChildWebviewBase {
  readonly side?: "leading" | "trailing";
  readonly width?: "small" | "medium" | "large" | number;
  readonly dismissible?: boolean;
}

export interface AppWindowConfig extends ChildWebviewBase {
  readonly title?: string;
  readonly size?: { readonly width: number; readonly height: number };
  readonly minSize?: { readonly width: number; readonly height: number };
  readonly resizable?: boolean;
  /** Blocks interaction with the opener window while open. */
  readonly modal?: boolean;
}

export interface PopoverConfig extends ChildWebviewBase {
  readonly size?: { readonly width: number; readonly height: number };
  /**
   * ID of a DOM element in the main webview that the popover anchors to.
   * The platform uses the element's bounding box as the source rect.
   */
  readonly anchorElementId?: string;
}

// ─── ChromeState ──────────────────────────────────────────────────────────────

export interface ChromeState {
  readonly titleBar?: TitleBarConfig;
  readonly navigation?: NavigationConfig;
  readonly sidebarPanel?: SidebarPanelConfig;
  readonly toolbar?: ToolbarConfig;
  readonly keyboard?: KeyboardConfig;
  readonly statusBar?: StatusBarConfig;
  readonly homeIndicator?: HomeIndicatorConfig;
  readonly menuBar?: MenuBarConfig;
  readonly sheets?: Readonly<Record<string, SheetConfig>>;
  readonly drawers?: Readonly<Record<string, DrawerConfig>>;
  readonly appWindows?: Readonly<Record<string, AppWindowConfig>>;
  readonly popovers?: Readonly<Record<string, PopoverConfig>>;
}

// ─── Chrome Events ────────────────────────────────────────────────────────────

export type ChromeEvent =
  | { readonly type: "titleBar.leadingItemPressed"; readonly id: string }
  | { readonly type: "titleBar.trailingItemPressed"; readonly id: string }
  | { readonly type: "titleBar.menuItemPressed"; readonly id: string }
  | { readonly type: "titleBar.backPressed" }
  | { readonly type: "titleBar.searchChanged"; readonly value: string }
  | { readonly type: "titleBar.searchSubmitted"; readonly value: string }
  | { readonly type: "titleBar.searchCancelled" }
  | { readonly type: "navigation.itemPressed"; readonly id: string }
  | { readonly type: "sidebarPanel.itemPressed"; readonly id: string }
  | { readonly type: "toolbar.itemPressed"; readonly id: string }
  | { readonly type: "toolbar.menuItemPressed"; readonly id: string }
  | { readonly type: "keyboard.itemPressed"; readonly id: string }
  | { readonly type: "menuBar.itemPressed"; readonly id: string }
  | { readonly type: "sheet.presented"; readonly name: string }
  | { readonly type: "sheet.dismissed"; readonly name: string }
  | { readonly type: "sheet.detentChanged"; readonly name: string; readonly detent: string }
  | {
      readonly type: "sheet.loadFailed";
      readonly name: string;
      readonly message: string;
      readonly code: number;
    }
  | { readonly type: "drawer.presented"; readonly name: string }
  | { readonly type: "drawer.dismissed"; readonly name: string }
  | { readonly type: "appWindow.presented"; readonly name: string }
  | { readonly type: "appWindow.dismissed"; readonly name: string }
  | { readonly type: "popover.presented"; readonly name: string }
  | { readonly type: "popover.dismissed"; readonly name: string }
  | { readonly type: "message"; readonly from: "main" | (string & {}); readonly payload: unknown }
  | {
      readonly type: "safeArea.changed";
      readonly top: number;
      readonly right: number;
      readonly bottom: number;
      readonly left: number;
    };

export type ChromeEventType = ChromeEvent["type"];

/** A function returned by subscriptions to remove the event listener. */
export type Unsubscribe = () => void;

// ─── Chrome Element Descriptor ────────────────────────────────────────────────
// Internal discriminated union used by the chrome() callable and factory functions.

export type ChromeElement =
  | { readonly _area: "titleBar"; readonly _config: TitleBarConfig }
  | { readonly _area: "navigation"; readonly _config: NavigationConfig }
  | { readonly _area: "toolbar"; readonly _config: ToolbarConfig }
  | { readonly _area: "sidebarPanel"; readonly _config: SidebarPanelConfig }
  | { readonly _area: "statusBar"; readonly _config: StatusBarConfig }
  | { readonly _area: "homeIndicator"; readonly _config: HomeIndicatorConfig }
  | { readonly _area: "keyboard"; readonly _config: KeyboardConfig }
  | { readonly _area: "menuBar"; readonly _config: MenuBarConfig }
  | { readonly _area: "sheet"; readonly _name: string; readonly _config: SheetConfig }
  | { readonly _area: "drawer"; readonly _name: string; readonly _config: DrawerConfig }
  | { readonly _area: "appWindow"; readonly _name: string; readonly _config: AppWindowConfig }
  | { readonly _area: "popover"; readonly _name: string; readonly _config: PopoverConfig };
