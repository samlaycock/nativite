/// <reference lib="dom" />

import type { NativeToJsMessage } from "../index.ts";

import { _bridgeSend, _registerReceiveHandler } from "../client/index.ts";

// ─── Re-export all pure types ────────────────────────────────────────────────

export type {
  AppWindowConfig,
  BarItem,
  ButtonItem,
  ChromeElement,
  ChromeEvent,
  ChromeEventType,
  ChromeState,
  DrawerConfig,
  FixedSpace,
  FlexibleSpace,
  HomeIndicatorConfig,
  KeyboardConfig,
  MenuBarConfig,
  MenuConfig,
  MenuItem,
  NavigationConfig,
  NavigationItem,
  PopoverConfig,
  SearchBarConfig,
  SheetConfig,
  SidebarItem,
  SidebarPanelConfig,
  StatusBarConfig,
  TitleBarConfig,
  ToolbarConfig,
  Unsubscribe,
} from "./types.ts";

import type {
  AppWindowConfig,
  BarItem,
  ButtonItem,
  ChromeElement,
  ChromeEvent,
  ChromeEventType,
  ChromeState,
  DrawerConfig,
  HomeIndicatorConfig,
  KeyboardConfig,
  MenuBarConfig,
  MenuConfig,
  MenuItem,
  NavigationConfig,
  NavigationItem,
  PopoverConfig,
  SearchBarConfig,
  SheetConfig,
  SidebarItem,
  SidebarPanelConfig,
  StatusBarConfig,
  TitleBarConfig,
  ToolbarConfig,
  Unsubscribe,
} from "./types.ts";

// ─── Internal State ───────────────────────────────────────────────────────────

type Layer = Map<string, ChromeElement>;

const layerStack: Layer[] = [];

// ─── State Helpers ────────────────────────────────────────────────────────────

function elementKey(el: ChromeElement): string {
  if ("_name" in el) return `${el._area}:${el._name}`;
  return el._area;
}

function buildState(effectiveMap: ReadonlyMap<string, ChromeElement>): ChromeState {
  const state: Record<string, unknown> = {};

  for (const el of effectiveMap.values()) {
    switch (el._area) {
      case "titleBar":
        state["titleBar"] = el._config;
        break;
      case "navigation":
        state["navigation"] = el._config;
        break;
      case "toolbar":
        state["toolbar"] = el._config;
        break;
      case "sidebarPanel":
        state["sidebarPanel"] = el._config;
        break;
      case "statusBar":
        state["statusBar"] = el._config;
        break;
      case "homeIndicator":
        state["homeIndicator"] = el._config;
        break;
      case "keyboard":
        state["keyboard"] = el._config;
        break;
      case "menuBar":
        state["menuBar"] = el._config;
        break;
      case "sheet": {
        const sheets = (state["sheets"] ?? {}) as Record<string, SheetConfig>;
        sheets[el._name] = el._config;
        state["sheets"] = sheets;
        break;
      }
      case "drawer": {
        const drawers = (state["drawers"] ?? {}) as Record<string, DrawerConfig>;
        drawers[el._name] = el._config;
        state["drawers"] = drawers;
        break;
      }
      case "appWindow": {
        const appWindows = (state["appWindows"] ?? {}) as Record<string, AppWindowConfig>;
        appWindows[el._name] = el._config;
        state["appWindows"] = appWindows;
        break;
      }
      case "popover": {
        const popovers = (state["popovers"] ?? {}) as Record<string, PopoverConfig>;
        popovers[el._name] = el._config;
        state["popovers"] = popovers;
        break;
      }
    }
  }

  return state as ChromeState;
}

function flushState(): void {
  // Walk the stack from bottom to top; later layers overwrite earlier ones.
  const effectiveMap = new Map<string, ChromeElement>();
  for (const layer of layerStack) {
    for (const [key, el] of layer) {
      effectiveMap.set(key, el);
    }
  }
  _bridgeSend("__chrome__", "__chrome_set_state__", buildState(effectiveMap));
}

// ─── Flush scheduling ─────────────────────────────────────────────────────────
// Defers the actual bridge send to a microtask so that synchronous
// cleanup+re-apply cycles (e.g. React useEffect dependency change: old effect
// cleanup fires → new effect fires, both in the same JS tick) coalesce into a
// single native message carrying the final merged state. Without this, the
// native side would receive an intermediate empty-ish state that causes it to
// reset and then immediately re-apply chrome areas — producing visible flicker
// and spurious animations in every chrome area (title bar, toolbar, navigation,
// sheets, etc.).

let _pendingFlush = false;
// Incremented by _resetChromeState() to cancel in-flight microtasks across
// test boundaries without needing to track individual microtask handles.
let _flushGeneration = 0;

function scheduleFlush(): void {
  if (_pendingFlush) return;
  _pendingFlush = true;
  const gen = _flushGeneration;
  queueMicrotask(() => {
    if (_flushGeneration !== gen) return; // cancelled by _resetChromeState
    _pendingFlush = false;
    flushState();
  });
}

// ─── Event Routing ────────────────────────────────────────────────────────────

type AnyHandler = (event: ChromeEvent) => void;

const specificListeners = new Map<ChromeEventType, Set<AnyHandler>>();
const wildcardListeners = new Set<AnyHandler>();

function handleIncoming(message: NativeToJsMessage): void {
  const eventType = message.event as ChromeEventType;
  const data = message.data as Record<string, unknown>;
  const event = { type: eventType, ...data } as ChromeEvent;

  const listeners = specificListeners.get(eventType);
  if (listeners) {
    for (const listener of listeners) {
      listener(event);
    }
  }

  for (const listener of wildcardListeners) {
    listener(event);
  }
}

_registerReceiveHandler(handleIncoming);

// ─── Internal Subscription Helpers ────────────────────────────────────────────

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

// ─── Shared Messaging Worker ──────────────────────────────────────────────────
// The instance name is injected by the native shell via a WKUserScript as
// window.__nativekit_instance_name__ before any app code runs.
// The primary webview is always "main"; child webviews use their configured
// name (e.g. "settings" for sheet("settings", ...)).

function instanceName(): string {
  if (typeof window === "undefined") return "main";
  const name = (window as unknown as Record<string, unknown>)["__nativekit_instance_name__"];
  return typeof name === "string" ? name : "main";
}

// Lazily initialised on first messaging call; null when SharedWorker is
// unavailable (Node / Bun test runner) or when injected by _setWorkerPort.
let _workerPort: MessagePort | null = null;

function connectWorker(): MessagePort | null {
  if (_workerPort !== null) return _workerPort;
  if (typeof SharedWorker === "undefined") return null;
  try {
    const worker = new SharedWorker(new URL("../messaging-worker.ts", import.meta.url), {
      type: "module",
    });
    _workerPort = worker.port;
    _workerPort.addEventListener("message", (e: MessageEvent) => {
      const msg = e.data as { type: string; from: string; payload: unknown };
      if (msg.type === "message") {
        handleIncoming({
          id: null,
          type: "event",
          event: "message",
          data: { from: msg.from, payload: msg.payload },
        });
      }
    });
    _workerPort.start();
    _workerPort.postMessage({ type: "register", name: instanceName() });
  } catch {
    _workerPort = null;
  }
  return _workerPort;
}

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
  if (typeof typeOrHandler === "function") {
    return subscribeAll(typeOrHandler);
  }
  return subscribeSpecific(typeOrHandler, handler!);
}) as ChromeOnOverloads;

const messaging: ChromeMessaging = {
  postToParent(payload: unknown): void {
    const port = connectWorker();
    if (port) {
      port.postMessage({ type: "postToParent", from: instanceName(), payload });
    } else {
      _bridgeSend("__chrome__", "__chrome_messaging_post_to_parent__", payload);
    }
  },
  postToChild(name: string, payload: unknown): void {
    const port = connectWorker();
    if (port) {
      port.postMessage({ type: "postToChild", from: instanceName(), to: name, payload });
    } else {
      _bridgeSend("__chrome__", "__chrome_messaging_post_to_child__", { name, payload });
    }
  },
  broadcast(payload: unknown): void {
    const port = connectWorker();
    if (port) {
      port.postMessage({ type: "broadcast", from: instanceName(), payload });
    } else {
      _bridgeSend("__chrome__", "__chrome_messaging_broadcast__", payload);
    }
  },
  onMessage(handler: (from: "main" | (string & {}), payload: unknown) => void): Unsubscribe {
    // Eagerly connect to the SharedWorker so this instance is registered (as
    // "main") before any child webview sends a postToParent message.  Without
    // this call, connectWorker() would only fire when the parent itself sends a
    // message, meaning the SharedWorker's ports.get("main") would be undefined
    // and child→parent messages would be silently dropped.
    connectWorker();
    return subscribeSpecific("message", (event) => {
      handler(event.from, event.payload);
    });
  },
};

export const chrome = Object.assign(chromeImpl, {
  on: chromeOn,
  messaging,
}) as ChromeFunction;

// ─── Chrome Area Factory Functions ────────────────────────────────────────────

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

// ─── Item Constructors ────────────────────────────────────────────────────────

export function button(config: ButtonItem): ButtonItem {
  return config;
}

export function navItem(config: NavigationItem): NavigationItem {
  return config;
}

export function menuItem(config: MenuItem): MenuItem {
  return config;
}

// ─── Test Helpers ─────────────────────────────────────────────────────────────

/** @internal */
export const _handleIncoming = handleIncoming;

/** @internal — Reset all chrome state and listeners. For use in test beforeEach only. */
export function _resetChromeState(): void {
  layerStack.splice(0);
  specificListeners.clear();
  wildcardListeners.clear();
  _workerPort = null;
  _pendingFlush = false;
  _flushGeneration++; // invalidate any in-flight microtask so it becomes a no-op
}

/**
 * @internal — Immediately flush any pending scheduled state to the bridge.
 * Use this in tests after calling `chrome()` or its cleanup function when you
 * need to assert on `_bridgeSend` calls synchronously rather than waiting for
 * the microtask queue to drain.
 */
export function _drainFlush(): void {
  if (!_pendingFlush) return;
  _pendingFlush = false;
  _flushGeneration++; // cancel the queued microtask so it won't double-fire
  flushState();
}

/** @internal — Inject a mock SharedWorker port so messaging tests can verify
 *  worker-path behaviour without a real SharedWorker environment. */
export function _setWorkerPort(port: MessagePort | null): void {
  _workerPort = port;
}
