/// <reference lib="dom" />

import type { NativeToJsMessage } from "../index.ts";

import { _bridgeSend, _registerReceiveHandler } from "../client/index.ts";

// ─── Re-export all pure types from the types module ──────────────────────────
// src/chrome/types.ts has zero runtime imports — safe to import from index.ts
// (which is imported by src/index.ts) without creating a circular dependency.

export type {
  BarButtonItem,
  ChromeEventHandler,
  ChromeEventMap,
  ChromeEventName,
  ChromeState,
  HomeIndicatorState,
  KeyboardAccessoryItem,
  KeyboardState,
  MenuBarState,
  MenuItem,
  NavigationBarState,
  SearchBarState,
  SheetDetent,
  SheetState,
  SidebarState,
  StatusBarState,
  TabBarState,
  TabItem,
  ToolbarItem,
  ToolbarState,
  Unsubscribe,
  WindowState,
} from "./types.ts";

import type {
  ChromeEventHandler,
  ChromeEventMap,
  ChromeEventName,
  ChromeState,
  HomeIndicatorState,
  KeyboardState,
  MenuBarState,
  NavigationBarState,
  SearchBarState,
  SheetDetent,
  SheetState,
  SidebarState,
  StatusBarState,
  TabBarState,
  TabItem,
  ToolbarItem,
  ToolbarState,
  Unsubscribe,
  WindowState,
} from "./types.ts";

// ─── Internal State ──────────────────────────────────────────────────────────

/** Stacking event listeners — added via on* methods and chrome.on(). */
const chromeEventListeners = new Map<ChromeEventName, Set<ChromeEventHandler<ChromeEventName>>>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Reset functions registered by each element state sender — for test use only. */
const _stateResetters: Array<() => void> = [];

/**
 * Creates a state sender for one chrome element. Each call merges the patch
 * into internally held state and sends the full merged state over the bridge.
 */
function createElementState<TState>(key: string): (patch: Partial<TState>) => void {
  let state: Partial<TState> = {};
  _stateResetters.push(() => {
    state = {};
  });
  return (patch: Partial<TState>): void => {
    state = { ...state, ...patch };
    _bridgeSend("__chrome__", "__chrome_set_state__", { [key]: state });
  };
}

/**
 * Creates a typed `on*` subscription method for a specific chrome event.
 * The returned method registers a handler and returns an unsubscribe function.
 */
function createListener<E extends ChromeEventName>(
  eventName: E,
): (handler: ChromeEventHandler<E>) => Unsubscribe {
  return (handler: ChromeEventHandler<E>): Unsubscribe => chromeOn(eventName, handler);
}

// ─── Event routing ────────────────────────────────────────────────────────────

function handleIncoming(message: NativeToJsMessage): void {
  const eventName = message.event as ChromeEventName;
  const data = message.data as ChromeEventMap[typeof eventName];

  const listeners = chromeEventListeners.get(eventName);
  if (listeners) {
    for (const listener of listeners) {
      listener(data);
    }
  }
}

_registerReceiveHandler(handleIncoming);

// ─── Internal on/off implementation ──────────────────────────────────────────

function chromeOn<E extends ChromeEventName>(
  event: E,
  handler: ChromeEventHandler<E>,
): Unsubscribe {
  if (!chromeEventListeners.has(event)) {
    chromeEventListeners.set(event, new Set());
  }
  chromeEventListeners.get(event)!.add(handler as ChromeEventHandler<ChromeEventName>);
  return () => chromeOff(event, handler);
}

function chromeOff<E extends ChromeEventName>(event: E, handler: ChromeEventHandler<E>): void {
  chromeEventListeners.get(event)?.delete(handler as ChromeEventHandler<ChromeEventName>);
}

// ─── Element state senders ────────────────────────────────────────────────────

const sendNavBar = createElementState<NavigationBarState>("navigationBar");
const sendTabBar = createElementState<TabBarState>("tabBar");
const sendToolbar = createElementState<ToolbarState>("toolbar");
const sendStatusBar = createElementState<StatusBarState>("statusBar");
const sendHomeIndicator = createElementState<HomeIndicatorState>("homeIndicator");
const sendSearchBar = createElementState<SearchBarState>("searchBar");
const sendSheet = createElementState<SheetState>("sheet");
const sendKeyboard = createElementState<KeyboardState>("keyboard");
const sendSidebar = createElementState<SidebarState>("sidebar");
const sendWindow = createElementState<WindowState>("window");
const sendMenuBar = createElementState<MenuBarState>("menuBar");

// ─── chrome ──────────────────────────────────────────────────────────────────

/**
 * The Nativite chrome API — singleton namespaces for each native UI element.
 *
 * @example
 * // Configure the navigation bar
 * chrome.navigationBar.setTitle("Settings");
 * chrome.navigationBar.setToolbarRight([
 *   { type: "button", id: "save", title: "Save", style: "done" },
 * ]);
 * chrome.navigationBar.show();
 *
 * // Subscribe to button taps (returns an unsubscribe function)
 * const unsub = chrome.navigationBar.onButtonTap(({ id }) => {
 *   console.log("Tapped:", id);
 * });
 * unsub(); // remove listener
 *
 * // Set up the tab bar
 * chrome.tabBar.setTabs([
 *   { id: "home", title: "Home", systemImage: "house.fill" },
 *   { id: "profile", title: "Profile", systemImage: "person.fill" },
 * ]);
 * chrome.tabBar.show();
 * const unsubTab = chrome.tabBar.onSelect(({ id }) => console.log("Tab:", id));
 */
export const chrome = {
  /** Navigation bar (top of screen). */
  navigationBar: {
    /** Show the navigation bar. */
    show: (): void => sendNavBar({ hidden: false }),
    /** Hide the navigation bar. */
    hide: (): void => sendNavBar({ hidden: true }),
    /** Set the title text. */
    setTitle: (title: string): void => sendNavBar({ title }),
    /** Set the items on the leading (left) side. Supports buttons, fixedSpace, and flexibleSpace. */
    setToolbarLeft: (items: ToolbarItem[]): void => sendNavBar({ toolbarLeft: items }),
    /** Set the items on the trailing (right) side. Supports buttons, fixedSpace, and flexibleSpace. */
    setToolbarRight: (items: ToolbarItem[]): void => sendNavBar({ toolbarRight: items }),
    /** Configure appearance properties (tint, background colour, translucency, back button label). */
    configure: (
      opts: Partial<
        Pick<
          NavigationBarState,
          "tintColor" | "barTintColor" | "translucent" | "backButtonTitle" | "largeTitleMode"
        >
      >,
    ): void => sendNavBar(opts),
    /** Subscribe to navigation bar button taps. Returns an unsubscribe function. */
    onButtonTap: createListener("navigationBar.buttonTapped"),
    /** Subscribe to the back button being tapped. Returns an unsubscribe function. */
    onBackTap: createListener("navigationBar.backTapped"),
  },

  /** Tab bar (bottom of screen). */
  tabBar: {
    /** Show the tab bar. */
    show: (): void => sendTabBar({ hidden: false }),
    /** Hide the tab bar. */
    hide: (): void => sendTabBar({ hidden: true }),
    /** Set the tab items. */
    setTabs: (items: TabItem[]): void => sendTabBar({ items }),
    /** Set the currently selected tab by ID. */
    setActiveTab: (id: string): void => sendTabBar({ selectedTabId: id }),
    /** Configure appearance properties (tint colours, translucency). */
    configure: (
      opts: Partial<
        Pick<TabBarState, "tintColor" | "unselectedTintColor" | "barTintColor" | "translucent">
      >,
    ): void => sendTabBar(opts),
    /** Subscribe to tab selection. Returns an unsubscribe function. */
    onSelect: createListener("tabBar.tabSelected"),
  },

  /** Bottom toolbar (UINavigationController toolbar). */
  toolbar: {
    /** Show the toolbar. */
    show: (): void => sendToolbar({ hidden: false }),
    /** Hide the toolbar. */
    hide: (): void => sendToolbar({ hidden: true }),
    /** Set the toolbar items. Supports buttons, fixedSpace, and flexibleSpace. */
    setItems: (items: ToolbarItem[]): void => sendToolbar({ items }),
    /** Configure appearance properties (background colour, translucency). */
    configure: (opts: Partial<Pick<ToolbarState, "barTintColor" | "translucent">>): void =>
      sendToolbar(opts),
    /** Subscribe to toolbar button taps. Returns an unsubscribe function. */
    onButtonTap: createListener("toolbar.buttonTapped"),
  },

  /** Status bar style and visibility. */
  statusBar: {
    /** Show the status bar. */
    show: (): void => sendStatusBar({ hidden: false }),
    /** Hide the status bar. */
    hide: (): void => sendStatusBar({ hidden: true }),
    /** Set the status bar style. */
    setStyle: (style: "light" | "dark"): void => sendStatusBar({ style }),
  },

  /** Home indicator visibility. */
  homeIndicator: {
    /** Show the home indicator. */
    show: (): void => sendHomeIndicator({ hidden: false }),
    /** Hide the home indicator. */
    hide: (): void => sendHomeIndicator({ hidden: true }),
  },

  /** Search bar. */
  searchBar: {
    /** Set the search field text. */
    setText: (text: string): void => sendSearchBar({ text }),
    /** Set the placeholder text shown when the field is empty. */
    setPlaceholder: (placeholder: string): void => sendSearchBar({ placeholder }),
    /** Configure appearance properties (background colour, cancel button visibility). */
    configure: (opts: Partial<Pick<SearchBarState, "barTintColor" | "showsCancelButton">>): void =>
      sendSearchBar(opts),
    /** Subscribe to text changes. Returns an unsubscribe function. */
    onTextChange: createListener("searchBar.textChanged"),
    /** Subscribe to search submission (return key). Returns an unsubscribe function. */
    onSubmit: createListener("searchBar.submitted"),
    /** Subscribe to the cancel button being tapped. Returns an unsubscribe function. */
    onCancel: createListener("searchBar.cancelled"),
  },

  /** Sheet / bottom sheet modal. */
  sheet: {
    /** Present the sheet. */
    present: (): void => sendSheet({ presented: true }),
    /** Dismiss the sheet. */
    dismiss: (): void => sendSheet({ presented: false }),
    /** Set the available detent stops. */
    setDetents: (detents: SheetDetent[]): void => sendSheet({ detents }),
    /** Set the currently selected detent. */
    setSelectedDetent: (detent: SheetDetent): void => sendSheet({ selectedDetent: detent }),
    /** Configure appearance properties (grabber, background colour, corner radius). */
    configure: (
      opts: Partial<Pick<SheetState, "grabberVisible" | "backgroundColor" | "cornerRadius">>,
    ): void => sendSheet(opts),
    /** Subscribe to detent changes (user dragging). Returns an unsubscribe function. */
    onDetentChange: createListener("sheet.detentChanged"),
    /** Subscribe to the sheet being dismissed. Returns an unsubscribe function. */
    onDismiss: createListener("sheet.dismissed"),
  },

  /** Keyboard input accessory bar. */
  keyboard: {
    /** Set the input accessory bar. Pass null to remove it. */
    setAccessory: (accessory: KeyboardState["inputAccessory"]): void =>
      sendKeyboard({ inputAccessory: accessory }),
    /** Configure keyboard dismiss behaviour. */
    configure: (opts: Partial<Pick<KeyboardState, "dismissMode">>): void => sendKeyboard(opts),
    /** Subscribe to accessory bar button taps. Returns an unsubscribe function. */
    onAccessoryItemTap: createListener("keyboard.accessory.itemTapped"),
  },

  /** Sidebar column (iPad / macOS). */
  sidebar: {
    /** Show the sidebar column. */
    show: (): void => sendSidebar({ visible: true }),
    /** Hide the sidebar column. */
    hide: (): void => sendSidebar({ visible: false }),
    /** Set the sidebar items. */
    setItems: (items: SidebarState["items"]): void => sendSidebar({ items }),
    /** Set the active sidebar item by ID. */
    setActiveItem: (id: string): void => sendSidebar({ selectedItemId: id }),
    /** Subscribe to sidebar item selection. Returns an unsubscribe function. */
    onItemSelect: createListener("sidebar.itemSelected"),
  },

  /** macOS window title bar. */
  window: {
    /** Set the window title. */
    setTitle: (title: string): void => sendWindow({ title }),
    /** Set the window subtitle. */
    setSubtitle: (subtitle: string): void => sendWindow({ subtitle }),
    /** Configure title bar appearance (separator style, title visibility, full-size content). */
    configure: (
      opts: Partial<
        Pick<WindowState, "titlebarSeparatorStyle" | "titleHidden" | "fullSizeContent">
      >,
    ): void => sendWindow(opts),
  },

  /** macOS menu bar (extra menus appended after built-in menus). */
  menuBar: {
    /** Set the extra menu bar menus. */
    setMenus: (menus: MenuBarState["menus"]): void => sendMenuBar({ menus }),
    /** Subscribe to menu item selection. Returns an unsubscribe function. */
    onItemSelect: createListener("menuBar.itemSelected"),
  },

  /**
   * Raw batch state update — sets multiple chrome elements at once.
   * State is sent as-is without merging with per-element held state.
   */
  set(state: ChromeState): void {
    _bridgeSend("__chrome__", "__chrome_set_state__", state);
  },

  /**
   * Subscribe to any chrome event by name. Returns an unsubscribe function.
   * Useful for events without a dedicated `on*` method (e.g. `"safeArea.changed"`),
   * or for listening to multiple elements from a single handler.
   *
   * @example
   * const unsub = chrome.on("safeArea.changed", ({ top, bottom }) => { ... })
   * unsub()
   */
  on<E extends ChromeEventName>(event: E, handler: ChromeEventHandler<E>): Unsubscribe {
    return chromeOn(event, handler);
  },

  /** Unsubscribe a handler from a chrome event. */
  off<E extends ChromeEventName>(event: E, handler: ChromeEventHandler<E>): void {
    chromeOff(event, handler);
  },
} as const;

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** @internal */
export const _handleIncoming = handleIncoming;

/** @internal — Reset all held element state. For use in test beforeEach only. */
export function _resetChromeState(): void {
  for (const reset of _stateResetters) {
    reset();
  }
}
