// ─── Chrome State Types ───────────────────────────────────────────────────────
// Pure TypeScript types with no runtime imports.
// Imported by both src/chrome/index.ts (runtime) and src/index.ts (config schema).

export type BarButtonItem = {
  /** Unique ID used to identify this button in events. */
  id: string;
  /** Button label text. Use either title or systemImage, not both. */
  title?: string;
  /** SF Symbol name, e.g. "plus", "trash", "square.and.arrow.up". */
  systemImage?: string;
  style?: "plain" | "done" | "destructive";
  disabled?: boolean;
};

export type NavigationBarState = {
  title?: string;
  /** Large title display mode. Defaults to "automatic". */
  largeTitleMode?: "always" | "never" | "automatic";
  /** Override the back button label. Pass null to hide entirely. */
  backButtonTitle?: string | null;
  /** Hex colour string, e.g. "#FFFFFF". */
  tintColor?: string;
  /** Hex colour string for the bar background. */
  barTintColor?: string;
  translucent?: boolean;
  hidden?: boolean;
  leftButtons?: BarButtonItem[];
  rightButtons?: BarButtonItem[];
};

export type TabItem = {
  /** Unique ID used to identify this tab in events. */
  id: string;
  title: string;
  /** SF Symbol name for the tab icon. */
  systemImage?: string;
  /** Badge label text. Pass null to hide. */
  badge?: string | null;
  /** Hex colour for the badge background. */
  badgeColor?: string;
};

export type TabBarState = {
  items: TabItem[];
  /** ID of the currently selected tab. */
  selectedTabId?: string;
  /** Hex colour for the selected item tint. */
  tintColor?: string;
  /** Hex colour for unselected item tint. */
  unselectedTintColor?: string;
  /** Hex colour for the bar background. */
  barTintColor?: string;
  translucent?: boolean;
  hidden?: boolean;
};

export type ToolbarItem =
  | ({ type: "button" } & BarButtonItem)
  | { type: "flexibleSpace" }
  | { type: "fixedSpace"; width: number };

export type ToolbarState = {
  items: ToolbarItem[];
  /** Hex colour for the bar background. */
  barTintColor?: string;
  translucent?: boolean;
  hidden?: boolean;
};

export type StatusBarState = {
  /** "light" = white text/icons, "dark" = black text/icons. */
  style?: "light" | "dark";
  hidden?: boolean;
};

export type HomeIndicatorState = {
  hidden?: boolean;
};

export type SearchBarState = {
  placeholder?: string;
  /** Hex colour for the bar background. */
  barTintColor?: string;
  /** Pre-fill the search text. */
  text?: string;
  /** Show the cancel button. */
  showsCancelButton?: boolean;
};

export type SheetDetent = "small" | "medium" | "large";

export type SheetState = {
  presented: boolean;
  detents?: SheetDetent[];
  selectedDetent?: SheetDetent;
  grabberVisible?: boolean;
  /** Hex colour for the sheet background. */
  backgroundColor?: string;
  /** Corner radius in points. */
  cornerRadius?: number;
};

/** An item in the keyboard input accessory bar. */
export type KeyboardAccessoryItem =
  | {
      type: "button";
      /** Unique ID used to identify this button in events. */
      id: string;
      title?: string;
      /** SF Symbol name, e.g. "checkmark", "arrow.right". */
      systemImage?: string;
      style?: "plain" | "prominent";
      disabled?: boolean;
    }
  | { type: "flexibleSpace" }
  | { type: "fixedSpace"; width: number };

export type KeyboardState = {
  /** Native input accessory bar shown above the keyboard. Pass null to remove. */
  inputAccessory?: {
    items: KeyboardAccessoryItem[];
    /** Hex colour for the accessory bar background. */
    barTintColor?: string;
  } | null;
  /** How the keyboard is dismissed when the user scrolls. */
  dismissMode?: "none" | "onDrag" | "interactive";
};

/** iPad / macOS sidebar. */
export type SidebarState = {
  items: Array<{
    id: string;
    title: string;
    systemImage?: string;
  }>;
  selectedItemId?: string;
  /** Whether the sidebar column is visible. */
  visible?: boolean;
};

/** macOS window title bar. */
export type WindowState = {
  title?: string;
  subtitle?: string;
  titlebarSeparatorStyle?: "automatic" | "none" | "line" | "shadow";
  titleHidden?: boolean;
  /** Whether content extends under the title bar (fullSizeContentView). */
  fullSizeContent?: boolean;
};

/** macOS menu bar item. */
export type MenuItem = {
  id: string;
  title: string;
  /** Key equivalent, e.g. "s" for Cmd+S. */
  keyEquivalent?: string;
  /** SF Symbol name for the menu icon. */
  systemImage?: string;
  disabled?: boolean;
  checked?: boolean;
  submenu?: MenuItem[];
};

export type MenuBarState = {
  /** Extra menus to add to the app's menu bar (after the built-in ones). */
  menus: Array<{
    title: string;
    items: MenuItem[];
  }>;
};

// ─── Chrome Options Types (State + inline callbacks) ─────────────────────────
// These extend the *State types with optional callback properties for the
// fluent per-element API. Callbacks are JS-only — they're stripped before
// sending state over the bridge and registered as event listeners internally.

export type NavigationBarOptions = NavigationBarState & {
  /** Called when a navigation bar button is tapped. */
  onButtonTap?: ((data: ChromeEventMap["navigationBar.buttonTapped"]) => void) | null;
  /** Called when the back button is tapped. */
  onBackTap?: ((data: ChromeEventMap["navigationBar.backTapped"]) => void) | null;
};

export type TabBarOptions = TabBarState & {
  /** Called when the user selects a tab. */
  onSelect?: ((data: ChromeEventMap["tabBar.tabSelected"]) => void) | null;
};

export type ToolbarOptions = ToolbarState & {
  /** Called when a toolbar button is tapped. */
  onButtonTap?: ((data: ChromeEventMap["toolbar.buttonTapped"]) => void) | null;
};

export type SearchBarOptions = SearchBarState & {
  /** Called when the search bar text changes. */
  onTextChange?: ((data: ChromeEventMap["searchBar.textChanged"]) => void) | null;
  /** Called when the search button (return key) is tapped. */
  onSubmit?: ((data: ChromeEventMap["searchBar.submitted"]) => void) | null;
  /** Called when the search cancel button is tapped. */
  onCancel?: ((data: ChromeEventMap["searchBar.cancelled"]) => void) | null;
};

export type SheetOptions = SheetState & {
  /** Called when the sheet's detent changes (user dragged it). */
  onDetentChange?: ((data: ChromeEventMap["sheet.detentChanged"]) => void) | null;
  /** Called when the sheet is dismissed. */
  onDismiss?: ((data: ChromeEventMap["sheet.dismissed"]) => void) | null;
};

export type KeyboardOptions = KeyboardState & {
  /** Called when a keyboard accessory bar button is tapped. */
  onAccessoryItemTap?: ((data: ChromeEventMap["keyboard.accessory.itemTapped"]) => void) | null;
};

export type SidebarOptions = SidebarState & {
  /** Called when a sidebar item is selected. */
  onItemSelect?: ((data: ChromeEventMap["sidebar.itemSelected"]) => void) | null;
};

export type MenuBarOptions = MenuBarState & {
  /** Called when a macOS menu item is selected. */
  onItemSelect?: ((data: ChromeEventMap["menuBar.itemSelected"]) => void) | null;
};

/**
 * The full chrome state descriptor. All fields are optional — only the keys
 * present in a setState() call are applied; absent keys are left unchanged.
 */
export type ChromeState = {
  navigationBar?: NavigationBarState;
  tabBar?: TabBarState;
  toolbar?: ToolbarState;
  statusBar?: StatusBarState;
  homeIndicator?: HomeIndicatorState;
  searchBar?: SearchBarState;
  sheet?: SheetState;
  keyboard?: KeyboardState;
  sidebar?: SidebarState;
  window?: WindowState;
  menuBar?: MenuBarState;
};

// ─── Chrome Event Types ───────────────────────────────────────────────────────

export type ChromeEventMap = {
  /** A navigation bar button was tapped. */
  "navigationBar.buttonTapped": { id: string };
  /** The back button was tapped. */
  "navigationBar.backTapped": Record<string, never>;
  /** The user selected a tab. */
  "tabBar.tabSelected": { id: string };
  /** A toolbar button was tapped. */
  "toolbar.buttonTapped": { id: string };
  /** The search bar text changed. */
  "searchBar.textChanged": { text: string };
  /** The search button (return key) was tapped. */
  "searchBar.submitted": { text: string };
  /** The search cancel button was tapped. */
  "searchBar.cancelled": Record<string, never>;
  /** The sheet's detent changed (user dragged it). */
  "sheet.detentChanged": { detent: SheetDetent };
  /** The sheet was dismissed. */
  "sheet.dismissed": Record<string, never>;
  /** A sidebar item was selected. */
  "sidebar.itemSelected": { id: string };
  /** A macOS menu item was selected. */
  "menuBar.itemSelected": { id: string };
  /** A keyboard accessory bar button was tapped. */
  "keyboard.accessory.itemTapped": { id: string };
  /** The safe area insets changed (on load or rotation). */
  "safeArea.changed": { top: number; left: number; bottom: number; right: number };
};

export type ChromeEventName = keyof ChromeEventMap;
export type ChromeEventHandler<E extends ChromeEventName> = (data: ChromeEventMap[E]) => void;
