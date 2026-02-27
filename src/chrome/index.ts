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
  KeyboardOptions,
  KeyboardState,
  MenuBarOptions,
  MenuBarState,
  MenuItem,
  NavigationBarOptions,
  NavigationBarState,
  SearchBarOptions,
  SearchBarState,
  SheetDetent,
  SheetOptions,
  SheetState,
  SidebarOptions,
  SidebarState,
  StatusBarState,
  TabBarOptions,
  TabBarState,
  TabItem,
  ToolbarItem,
  ToolbarOptions,
  ToolbarState,
  WindowState,
} from "./types.ts";

import type {
  ChromeEventHandler,
  ChromeEventMap,
  ChromeEventName,
  ChromeState,
  HomeIndicatorState,
  KeyboardOptions,
  MenuBarOptions,
  NavigationBarOptions,
  SearchBarOptions,
  SheetOptions,
  SidebarOptions,
  StatusBarState,
  TabBarOptions,
  ToolbarOptions,
  WindowState,
} from "./types.ts";

// ─── Callback → Event mapping ────────────────────────────────────────────────
// Maps "element.onCallback" keys to their corresponding ChromeEventName.
// This is the single source of truth for stripping callbacks from options
// objects and registering them as event listeners.

const CALLBACK_EVENT_MAP: Record<string, ChromeEventName> = {
  "navigationBar.onButtonTap": "navigationBar.buttonTapped",
  "navigationBar.onBackTap": "navigationBar.backTapped",
  "tabBar.onSelect": "tabBar.tabSelected",
  "toolbar.onButtonTap": "toolbar.buttonTapped",
  "searchBar.onTextChange": "searchBar.textChanged",
  "searchBar.onSubmit": "searchBar.submitted",
  "searchBar.onCancel": "searchBar.cancelled",
  "sheet.onDetentChange": "sheet.detentChanged",
  "sheet.onDismiss": "sheet.dismissed",
  "keyboard.onAccessoryItemTap": "keyboard.accessory.itemTapped",
  "sidebar.onItemSelect": "sidebar.itemSelected",
  "menuBar.onItemSelect": "menuBar.itemSelected",
};

// ─── Internal State ──────────────────────────────────────────────────────────

/** Inline callbacks — replace semantics (one per event, set by per-element methods). */
const inlineCallbacks = new Map<ChromeEventName, ChromeEventHandler<ChromeEventName>>();

/** Stacking event listeners — added via chrome.on(), multiple per event. */
const chromeEventListeners = new Map<ChromeEventName, Set<ChromeEventHandler<ChromeEventName>>>();

// ─── Callback stripping ─────────────────────────────────────────────────────

type StrippedResult = {
  state: Record<string, unknown>;
  callbacks: Map<ChromeEventName, ChromeEventHandler<ChromeEventName> | null>;
};

/**
 * Separates callback properties from pure state for an element.
 * Returns the clean state (safe to send over the bridge) and a map of
 * callbacks to register/unregister.
 */
function stripCallbacks(elementKey: string, options: Record<string, unknown>): StrippedResult {
  const state: Record<string, unknown> = {};
  const callbacks = new Map<ChromeEventName, ChromeEventHandler<ChromeEventName> | null>();

  for (const [key, value] of Object.entries(options)) {
    const mapKey = `${elementKey}.${key}`;
    const eventName = CALLBACK_EVENT_MAP[mapKey];

    if (eventName !== undefined) {
      // It's a callback property — register or unregister (null removes)
      callbacks.set(
        eventName,
        typeof value === "function" ? (value as ChromeEventHandler<ChromeEventName>) : null,
      );
    } else {
      // Pure state — pass through to bridge
      state[key] = value;
    }
  }

  return { state, callbacks };
}

/**
 * Apply extracted callbacks — replace semantics.
 * A function value replaces the current inline callback.
 * A null value removes the current inline callback.
 */
function applyCallbacks(
  callbacks: Map<ChromeEventName, ChromeEventHandler<ChromeEventName> | null>,
): void {
  for (const [eventName, handler] of callbacks) {
    if (handler === null) {
      inlineCallbacks.delete(eventName);
    } else {
      inlineCallbacks.set(eventName, handler);
    }
  }
}

// ─── Wire into the existing Nativite receive channel ────────────────────────
// Chrome events arrive as NativeToJsMessage events with names like
// "navigationBar.buttonTapped". We listen for them here and dispatch to both
// inline callbacks and stacking event listeners.

function handleIncoming(message: NativeToJsMessage): void {
  if (message.type !== "event") return;
  const eventName = message.event as ChromeEventName;
  const data = message.data as ChromeEventMap[typeof eventName];

  // Inline callback (replace semantics — at most one per event)
  const inlineCb = inlineCallbacks.get(eventName);
  if (inlineCb) {
    inlineCb(data);
  }

  // Stacking listeners (from chrome.on())
  const listeners = chromeEventListeners.get(eventName);
  if (listeners) {
    for (const listener of listeners) {
      listener(data);
    }
  }
}

// Register with the client's message dispatcher so chrome events are routed
// through the same path as all other native messages, without touching
// window.nativiteReceive directly.
_registerReceiveHandler(handleIncoming);

// ─── Per-element method factory ──────────────────────────────────────────────

function createElementMethod<T extends Record<string, unknown>>(elementKey: keyof ChromeState) {
  return (options: T): void => {
    const { state, callbacks } = stripCallbacks(
      elementKey as string,
      options as Record<string, unknown>,
    );
    applyCallbacks(callbacks);
    _bridgeSend("__chrome__", "__chrome_set_state__", { [elementKey]: state });
  };
}

// ─── chrome ──────────────────────────────────────────────────────────────────

/**
 * The Nativite chrome API — fluent per-element methods with inline callbacks.
 *
 * @example
 * // Set the navigation bar with an inline tap handler
 * chrome.navigationBar({
 *   title: 'Settings',
 *   rightButtons: [{ id: 'save', title: 'Save', style: 'done' }],
 *   onButtonTap: ({ id }) => console.log('Tapped:', id),
 * })
 *
 * // Set the tab bar
 * chrome.tabBar({
 *   items: [
 *     { id: 'home', title: 'Home', systemImage: 'house.fill' },
 *     { id: 'profile', title: 'Profile', systemImage: 'person.fill' },
 *   ],
 *   onSelect: ({ id }) => console.log('Selected:', id),
 * })
 *
 * // Batch update (no callbacks)
 * chrome.set({ statusBar: { style: 'light' }, homeIndicator: { hidden: true } })
 */
export const chrome = {
  /** Update the navigation bar. Supports inline `onButtonTap` and `onBackTap` callbacks. */
  navigationBar: createElementMethod<NavigationBarOptions>("navigationBar"),

  /** Update the tab bar. Supports inline `onSelect` callback. */
  tabBar: createElementMethod<TabBarOptions>("tabBar"),

  /** Update the toolbar. Supports inline `onButtonTap` callback. */
  toolbar: createElementMethod<ToolbarOptions>("toolbar"),

  /** Update the status bar style and visibility. No events. */
  statusBar: createElementMethod<StatusBarState>("statusBar"),

  /** Update the home indicator visibility. No events. */
  homeIndicator: createElementMethod<HomeIndicatorState>("homeIndicator"),

  /** Update the search bar. Supports inline `onTextChange`, `onSubmit`, `onCancel` callbacks. */
  searchBar: createElementMethod<SearchBarOptions>("searchBar"),

  /** Update the sheet. Supports inline `onDetentChange` and `onDismiss` callbacks. */
  sheet: createElementMethod<SheetOptions>("sheet"),

  /** Update the keyboard accessory. Supports inline `onAccessoryItemTap` callback. */
  keyboard: createElementMethod<KeyboardOptions>("keyboard"),

  /** Update the sidebar (iPad/macOS). Supports inline `onItemSelect` callback. */
  sidebar: createElementMethod<SidebarOptions>("sidebar"),

  /** Update the macOS window title bar. No events. */
  window: createElementMethod<WindowState>("window"),

  /** Update the macOS menu bar. Supports inline `onItemSelect` callback. */
  menuBar: createElementMethod<MenuBarOptions>("menuBar"),

  /**
   * Raw batch state update — sets multiple chrome elements at once.
   * Does not support inline callbacks; use per-element methods for that.
   */
  set(state: ChromeState): void {
    _bridgeSend("__chrome__", "__chrome_set_state__", state);
  },

  /**
   * Subscribe to a chrome event. Returns an unsubscribe function.
   * These listeners *stack* — multiple handlers for the same event all fire.
   * Use this when you need to listen from multiple places, or alongside
   * inline callbacks (both fire for the same event).
   *
   * @example
   * const unsub = chrome.on("tabBar.tabSelected", ({ id }) => {
   *   console.log("Selected tab:", id)
   * })
   * unsub() // remove the listener
   */
  on<E extends ChromeEventName>(event: E, handler: ChromeEventHandler<E>): () => void {
    if (!chromeEventListeners.has(event)) {
      chromeEventListeners.set(event, new Set());
    }
    chromeEventListeners.get(event)!.add(handler as ChromeEventHandler<ChromeEventName>);

    return () => {
      chrome.off(event, handler);
    };
  },

  /** Unsubscribe a handler from a chrome event. */
  off<E extends ChromeEventName>(event: E, handler: ChromeEventHandler<E>): void {
    chromeEventListeners.get(event)?.delete(handler as ChromeEventHandler<ChromeEventName>);
  },
} as const;

// ─── Test helper ─────────────────────────────────────────────────────────────
// Exported so tests can simulate incoming native events without needing a
// browser `window` object.

/** @internal */
export const _handleIncoming = handleIncoming;
