/// <reference lib="dom" />

// ─── Re-export all pure types ────────────────────────────────────────────────

export type * from "./types.ts";

import type {
  AppWindowConfig,
  ButtonItem,
  ChromeElement,
  ChromeEvent,
  ChromeEventType,
  ChromeState,
  DrawerConfig,
  HomeIndicatorConfig,
  KeyboardConfig,
  MenuBarConfig,
  MenuItem,
  NavigationConfig,
  NavigationItem,
  PopoverConfig,
  SheetConfig,
  SidebarPanelConfig,
  StatusBarConfig,
  TabBottomAccessoryConfig,
  TitleBarConfig,
  ToolbarConfig,
  Unsubscribe,
} from "./types.ts";

// ─── Native transport ───────────────────────────────────────────────────────
// Every webview (main and children) has its own native message handler registered
// by the native shell. All state and messaging routes directly through native.
//
// iOS:     webkit.messageHandlers.nativite.postMessage()
// Android: WebMessagePort transferred via postMessage("__nativite_port__")

type WebKitHandler = { postMessage(msg: unknown): void };

function getIOSHandler(): WebKitHandler | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { webkit?: { messageHandlers?: { nativite?: WebKitHandler } } }).webkit
    ?.messageHandlers?.nativite;
}

// ─── Android WebMessagePort transport ────────────────────────────────────────
// Native transfers a MessagePort to JS via postMessage("__nativite_port__").
// We capture the port and use it for sending chrome state to the native side.

let _androidPort: MessagePort | null = null;
let _pendingNativeMessage: object | null = null;

function setupChromeAndroidPortListener(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.data === "__nativite_port__" && event.ports.length > 0) {
      _androidPort = event.ports[0]!;
      // Flush any pending state that was queued before the port was ready
      if (_pendingNativeMessage) {
        _androidPort.postMessage(JSON.stringify(_pendingNativeMessage));
        _pendingNativeMessage = null;
      }
    }
  });
}

setupChromeAndroidPortListener();

/**
 * Send a fire-and-forget message to native, supporting both iOS and Android.
 * On Android, if the port isn't ready yet, queues the message for delivery
 * once the port connects. Only the latest queued message is kept (chrome state
 * is replaced entirely, so we only need the final value).
 */
function postToNative(msg: object): void {
  // iOS: webkit handler is available immediately
  const handler = getIOSHandler();
  if (handler) {
    handler.postMessage(msg);
    return;
  }
  // Android: use the transferred WebMessagePort
  if (_androidPort) {
    _androidPort.postMessage(JSON.stringify(msg));
    return;
  }
  // Android port not ready yet — queue message for delivery when port connects
  _pendingNativeMessage = msg;
}

// ─── Internal State ──────────────────────────────────────────────────────────

type Layer = Map<string, ChromeElement>;

const layerStack: Layer[] = [];

// ─── State Helpers ───────────────────────────────────────────────────────────

const NAMED_AREAS: Readonly<Record<string, string>> = {
  sheet: "sheets",
  drawer: "drawers",
  appWindow: "appWindows",
  popover: "popovers",
};

function elementKey(el: ChromeElement): string {
  if ("_name" in el) return `${el._area}:${el._name}`;
  return el._area;
}

function buildState(effectiveMap: ReadonlyMap<string, ChromeElement>): ChromeState {
  const state: Record<string, unknown> = {};
  for (const el of effectiveMap.values()) {
    const plural = NAMED_AREAS[el._area];
    if (plural) {
      const group = (state[plural] ?? {}) as Record<string, unknown>;
      group[(el as { readonly _name: string })._name] = el._config;
      state[plural] = group;
    } else {
      state[el._area] = el._config;
    }
  }
  return state as ChromeState;
}

function flushState(): void {
  const effectiveMap = new Map<string, ChromeElement>();
  for (const layer of layerStack) {
    for (const [key, el] of layer) {
      effectiveMap.set(key, el);
    }
  }
  const state = buildState(effectiveMap);
  postToNative({
    id: null,
    type: "call",
    namespace: "__chrome__",
    method: "__chrome_set_state__",
    args: state,
  });
}

// ─── Flush scheduling ────────────────────────────────────────────────────────
// Defers the actual send to a microtask so that synchronous cleanup+re-apply
// cycles (e.g. React useEffect dependency change) coalesce into a single
// message carrying the final merged state.

let _pendingFlush = false;
let _flushGeneration = 0;

function scheduleFlush(): void {
  if (_pendingFlush) return;
  _pendingFlush = true;
  const gen = _flushGeneration;
  queueMicrotask(() => {
    if (_flushGeneration !== gen) return;
    _pendingFlush = false;
    flushState();
  });
}

// ─── Event Routing ───────────────────────────────────────────────────────────

type AnyHandler = (event: ChromeEvent) => void;

const specificListeners = new Map<ChromeEventType, Set<AnyHandler>>();
const wildcardListeners = new Set<AnyHandler>();

function handleIncoming(event: ChromeEvent): void {
  const listeners = specificListeners.get(event.type);
  if (listeners) {
    for (const listener of listeners) {
      listener(event);
    }
  }
  for (const listener of wildcardListeners) {
    listener(event);
  }
}

// Listen for events dispatched by nativiteReceive() via a window-level
// CustomEvent. This is the primary path for native → chrome events.
// Lazy + idempotent: deferred until first use so test mocks are ready.

let eventListenerBound = false;
let boundEventHandler: ((e: Event) => void) | undefined;

function onNativiteEvent(e: Event): void {
  const detail = (e as CustomEvent).detail as { event: string; data: unknown };
  const event = { type: detail.event, ...(detail.data as object) } as ChromeEvent;
  handleIncoming(event);
}

function ensureEventListener(): void {
  if (eventListenerBound) return;
  eventListenerBound = true;

  if (typeof window !== "undefined") {
    boundEventHandler = onNativiteEvent;
    window.addEventListener("__nativite_event__", boundEventHandler);

    // Ensure `window.nativiteReceive` exists so native can deliver events even
    // when the client module (`nativite/client`) has not been imported. If the
    // client module loads later it will overwrite this with its own version that
    // also dispatches to bridge.subscribe listeners — that is fine because it
    // emits the same CustomEvent.
    const w = window as unknown as Record<string, unknown>;
    if (typeof w["nativiteReceive"] !== "function") {
      w["nativiteReceive"] = (message: { event: string; data: unknown }): void => {
        window.dispatchEvent(
          new CustomEvent("__nativite_event__", {
            detail: { event: message.event, data: message.data },
          }),
        );
      };
    }
  }
}

// ─── Internal Subscription Helpers ───────────────────────────────────────────

function subscribeSpecific<T extends ChromeEventType>(
  type: T,
  handler: (event: Extract<ChromeEvent, { readonly type: T }>) => void,
): Unsubscribe {
  const h = handler as AnyHandler;
  if (!specificListeners.has(type)) {
    specificListeners.set(type, new Set());
  }
  specificListeners.get(type)!.add(h);
  return () => {
    specificListeners.get(type)?.delete(h);
  };
}

function subscribeAll(handler: (event: ChromeEvent) => void): Unsubscribe {
  wildcardListeners.add(handler);
  return () => {
    wildcardListeners.delete(handler);
  };
}

// ─── chrome() callable ───────────────────────────────────────────────────────

type ChromeOnOverloads = {
  <T extends ChromeEventType>(
    type: T,
    handler: (event: Extract<ChromeEvent, { readonly type: T }>) => void,
  ): Unsubscribe;
  (handler: (event: ChromeEvent) => void): Unsubscribe;
};

interface ChromeMessaging {
  postToParent(payload: unknown): void;
  postToChild(name: string, payload: unknown): void;
  broadcast(payload: unknown): void;
  onMessage(handler: (from: "main" | (string & {}), payload: unknown) => void): Unsubscribe;
}

interface ChromeFunction {
  (...elements: ChromeElement[]): Unsubscribe;
  readonly on: ChromeOnOverloads;
  readonly messaging: ChromeMessaging;
}

function chromeImpl(...elements: ChromeElement[]): Unsubscribe {
  ensureEventListener();
  const layer: Layer = new Map();
  for (const el of elements) {
    layer.set(elementKey(el), el);
  }
  layerStack.push(layer);
  scheduleFlush();

  return (): void => {
    const idx = layerStack.indexOf(layer);
    if (idx === -1) return;
    layerStack.splice(idx, 1);
    scheduleFlush();
  };
}

const chromeOn: ChromeOnOverloads = (<T extends ChromeEventType>(
  typeOrHandler: T | ((event: ChromeEvent) => void),
  handler?: (event: Extract<ChromeEvent, { readonly type: T }>) => void,
): Unsubscribe => {
  ensureEventListener();
  if (typeof typeOrHandler === "function") {
    return subscribeAll(typeOrHandler);
  }
  return subscribeSpecific(typeOrHandler, handler!);
}) as ChromeOnOverloads;

const messaging: ChromeMessaging = {
  postToParent(payload: unknown): void {
    postToNative({
      id: null,
      type: "call",
      namespace: "__chrome__",
      method: "__chrome_messaging_post_to_parent__",
      args: payload,
    });
  },
  postToChild(name: string, payload: unknown): void {
    postToNative({
      id: null,
      type: "call",
      namespace: "__chrome__",
      method: "__chrome_messaging_post_to_child__",
      args: { name, payload },
    });
  },
  broadcast(payload: unknown): void {
    postToNative({
      id: null,
      type: "call",
      namespace: "__chrome__",
      method: "__chrome_messaging_broadcast__",
      args: payload,
    });
  },
  onMessage(handler: (from: "main" | (string & {}), payload: unknown) => void): Unsubscribe {
    ensureEventListener();
    return subscribeSpecific("message", (event) => {
      handler(event.from, event.payload);
    });
  },
};

export const chrome = Object.assign(chromeImpl, {
  on: chromeOn,
  messaging,
}) as ChromeFunction;

// ─── Chrome Area Factory Functions ───────────────────────────────────────────

export function titleBar(config: TitleBarConfig): ChromeElement {
  return { _area: "titleBar", _config: config };
}

export function navigation(config: NavigationConfig): ChromeElement {
  return { _area: "navigation", _config: config };
}

export function toolbar(config: ToolbarConfig): ChromeElement {
  return { _area: "toolbar", _config: config };
}

export function sidebarPanel(config: SidebarPanelConfig): ChromeElement {
  return { _area: "sidebarPanel", _config: config };
}

export function statusBar(config: StatusBarConfig): ChromeElement {
  return { _area: "statusBar", _config: config };
}

export function homeIndicator(config: HomeIndicatorConfig): ChromeElement {
  return { _area: "homeIndicator", _config: config };
}

export function keyboard(config: KeyboardConfig): ChromeElement {
  return { _area: "keyboard", _config: config };
}

export function menuBar(config: MenuBarConfig): ChromeElement {
  return { _area: "menuBar", _config: config };
}

export function tabBottomAccessory(config: TabBottomAccessoryConfig): ChromeElement {
  return { _area: "tabBottomAccessory", _config: config };
}

// ─── Child Webview Factory Functions ─────────────────────────────────────────

export function sheet(name: string, config: SheetConfig): ChromeElement {
  return { _area: "sheet", _name: name, _config: config };
}

export function drawer(name: string, config: DrawerConfig): ChromeElement {
  return { _area: "drawer", _name: name, _config: config };
}

export function appWindow(name: string, config: AppWindowConfig): ChromeElement {
  return { _area: "appWindow", _name: name, _config: config };
}

export function popover(name: string, config: PopoverConfig): ChromeElement {
  return { _area: "popover", _name: name, _config: config };
}

// ─── Item Constructors ───────────────────────────────────────────────────────

export function button(config: ButtonItem): ButtonItem {
  return config;
}

export function navItem(config: NavigationItem): NavigationItem {
  return config;
}

export function menuItem(config: MenuItem): MenuItem {
  return config;
}

// ─── Test Helpers ────────────────────────────────────────────────────────────

/** @internal */
export function _handleIncoming(event: ChromeEvent): void {
  handleIncoming(event);
}

/** @internal — Reset all chrome state and listeners. For use in test beforeEach only. */
export function _resetChromeState(): void {
  layerStack.splice(0);
  specificListeners.clear();
  wildcardListeners.clear();
  _pendingFlush = false;
  _flushGeneration++;
  _pendingNativeMessage = null;
  if (boundEventHandler && typeof window !== "undefined") {
    window.removeEventListener("__nativite_event__", boundEventHandler);
    boundEventHandler = undefined;
  }
  eventListenerBound = false;
}

/**
 * @internal — Immediately flush any pending scheduled state.
 * Use in tests after calling `chrome()` or its cleanup to assert synchronously.
 */
export function _drainFlush(): void {
  if (!_pendingFlush) return;
  _pendingFlush = false;
  _flushGeneration++;
  flushState();
}
