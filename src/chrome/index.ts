/// <reference lib="dom" />

// ─── Re-export all pure types ────────────────────────────────────────────────

export type * from "./types.ts";

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
type ChromeAreaName = keyof ChromeState;
type NclpStateBucket = Record<string, unknown>;
type NclpNode = {
  readonly id: string;
  readonly kind: string;
  readonly children?: readonly string[];
  readonly label?: string;
  readonly icon?: string;
  readonly role?: string;
  readonly placement?: string;
  readonly meta?: Record<string, unknown>;
};
type NclpSnapshot = {
  readonly nativite: 2;
  readonly type: "chrome.snapshot";
  readonly docId: "main";
  readonly revision: number;
  readonly root: "root";
  readonly nodes: Record<string, NclpNode>;
  readonly state: {
    readonly selected: NclpStateBucket;
    readonly disabled: NclpStateBucket;
    readonly hidden: NclpStateBucket;
    readonly badges: NclpStateBucket;
    readonly values: NclpStateBucket;
  };
};
type ShellReadyMessage = {
  readonly nativite: 2;
  readonly type: "shell.ready";
  readonly areas: readonly string[];
};
type ChromeEventMessage = {
  readonly nativite: 2;
  readonly type: "chrome.event";
  readonly docId?: string;
  readonly event: string;
  readonly target: string;
  readonly value?: unknown;
};

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
let _supportedAreas: ReadonlySet<string> | null = null;
let _revision = 0;

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

// ─── Splash State ────────────────────────────────────────────────────────────
// Tracks whether the developer has opted out of automatic splash screen hiding.
// Set synchronously via chrome.splash.preventAutoHide() so the flag is visible
// to native when it checks the JS global in didFinish / onPageFinished.

let _splashAutoHidePrevented = false;

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

function compactMeta(meta: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function addNode(nodes: Record<string, NclpNode>, node: NclpNode): void {
  nodes[node.id] = node;
}

function roleFromButtonStyle(style: ButtonItem["style"]): string | undefined {
  if (style === "primary" || style === "destructive") return style;
  return undefined;
}

function roleFromMenuStyle(style: MenuItem["style"]): string | undefined {
  return style === "destructive" ? "destructive" : undefined;
}

function lastPathComponent(id: string): string {
  return id.split(":").at(-1) ?? id;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function compileMenuItems(
  nodes: Record<string, NclpNode>,
  state: NclpSnapshot["state"],
  scope: string,
  items: readonly MenuItem[],
): readonly string[] {
  return items.map((item) => {
    const id = `${scope}:${item.id}`;
    const children = item.children ? [`${id}:menu`] : undefined;
    addNode(nodes, {
      id,
      kind: "action",
      label: item.label,
      icon: item.icon,
      role: roleFromMenuStyle(item.style),
      children,
      meta: compactMeta({
        checked: item.checked,
        keyEquivalent: item.keyEquivalent,
      }),
    });
    if (item.disabled) state.disabled[id] = true;
    if (item.checked !== undefined) state.selected[id] = item.checked;
    if (item.children) {
      const menuId = `${id}:menu`;
      addNode(nodes, {
        id: menuId,
        kind: "menu",
        children: compileMenuItems(nodes, state, menuId, item.children),
      });
    }
    return id;
  });
}

function compileBarItems(
  nodes: Record<string, NclpNode>,
  state: NclpSnapshot["state"],
  scope: string,
  placement: string,
  items: readonly BarItem[],
): readonly string[] {
  return items.map((item, index) => {
    if ("type" in item) {
      const id = `${scope}:space-${index}`;
      addNode(nodes, {
        id,
        kind: "spacer",
        placement,
        meta: item.type === "fixed-space" ? { fixed: true, width: item.width } : undefined,
      });
      return id;
    }
    const id = `${scope}:${item.id}`;
    const menuId = item.menu ? `${id}:menu` : undefined;
    addNode(nodes, {
      id,
      kind: "action",
      label: item.label,
      icon: item.icon,
      role: roleFromButtonStyle(item.style),
      placement,
      children: menuId ? [menuId] : undefined,
      meta: compactMeta({
        tint: item.tint,
        badge: item.badge,
        customization: item.customization,
      }),
    });
    if (item.disabled) state.disabled[id] = true;
    if (item.badge !== undefined && item.badge !== null) state.badges[id] = item.badge;
    if (item.menu) {
      addNode(nodes, {
        id: menuId!,
        kind: "menu",
        label: item.menu.title,
        children: compileMenuItems(nodes, state, menuId!, item.menu.items),
      });
    }
    return id;
  });
}

function compileSidebarItems(
  nodes: Record<string, NclpNode>,
  state: NclpSnapshot["state"],
  scope: string,
  items: readonly import("./types.ts").SidebarItem[],
): readonly string[] {
  return items.map((item) => {
    const id = `${scope}:${item.id}`;
    addNode(nodes, {
      id,
      kind: "item",
      label: item.label,
      icon: item.icon,
      children: item.children ? compileSidebarItems(nodes, state, id, item.children) : undefined,
    });
    if (item.badge !== undefined && item.badge !== null) state.badges[id] = item.badge;
    return id;
  });
}

function windowMeta(config: {
  readonly url: string;
  readonly backgroundColor?: string;
}): Record<string, unknown> {
  return {
    url: config.url,
    ...compactMeta({ backgroundColor: config.backgroundColor }),
  };
}

function compileChromeState(
  stateValue: ChromeState,
  supportedAreas: ReadonlySet<string>,
): NclpSnapshot {
  const nodes: Record<string, NclpNode> = {};
  const state: NclpSnapshot["state"] = {
    selected: {},
    disabled: {},
    hidden: {},
    badges: {},
    values: {},
  };
  const rootChildren: string[] = [];
  addNode(nodes, { id: "root", kind: "window", children: rootChildren });
  const include = (area: ChromeAreaName): boolean => area in stateValue && supportedAreas.has(area);

  if (include("titleBar")) {
    const config = stateValue.titleBar!;
    const children = ["titleBar:title"];
    addNode(nodes, {
      id: "titleBar:title",
      kind: "title",
      label: config.title,
      meta: compactMeta({
        subtitle: config.subtitle,
        largeTitleMode: config.largeTitleMode,
        backLabel: config.backLabel,
        tint: config.tint,
        fullSizeContent: config.fullSizeContent,
        separatorStyle: config.separatorStyle,
      }),
    });
    children.push(
      ...compileBarItems(nodes, state, "titleBar:leading", "leading", config.leadingItems ?? []),
    );
    children.push(
      ...compileBarItems(nodes, state, "titleBar:trailing", "trailing", config.trailingItems ?? []),
    );
    if (config.searchBar) {
      children.push("titleBar:search");
      addNode(nodes, {
        id: "titleBar:search",
        kind: "search",
        meta: compactMeta({
          placeholder: config.searchBar.placeholder,
          cancelButtonVisible: config.searchBar.cancelButtonVisible,
        }),
      });
      if (config.searchBar.value !== undefined)
        state.values["titleBar:search"] = config.searchBar.value;
    }
    addNode(nodes, { id: "titleBar", kind: "titleBar", children });
    if (config.hidden) state.hidden["titleBar"] = true;
    rootChildren.push("titleBar");
  }

  if (include("navigation")) {
    const config = stateValue.navigation!;
    const children = config.items.map((item) => `navigation:${item.id}`);
    addNode(nodes, {
      id: "navigation",
      kind: config.style === "sidebar" ? "sidebar" : "tabs",
      children,
      meta: compactMeta({
        style: config.style ?? "auto",
        minimizeBehavior: config.minimizeBehavior,
      }),
    });
    for (const item of config.items) {
      const id = `navigation:${item.id}`;
      const searchChild =
        item.role === "search" && config.searchBar ? "navigation:search-field" : undefined;
      addNode(nodes, {
        id,
        kind: "tab",
        label: item.label,
        icon: item.icon,
        children: searchChild ? [searchChild] : undefined,
        meta: compactMeta({ subtitle: item.subtitle, role: item.role }),
      });
      if (item.disabled) state.disabled[id] = true;
      if (item.badge !== undefined && item.badge !== null) state.badges[id] = item.badge;
      if (searchChild) {
        addNode(nodes, {
          id: searchChild,
          kind: "search",
          meta: compactMeta({
            placeholder: config.searchBar?.placeholder,
            cancelButtonVisible: config.searchBar?.cancelButtonVisible,
          }),
        });
        if (config.searchBar?.value !== undefined)
          state.values[searchChild] = config.searchBar.value;
      }
    }
    if (config.activeItem) state.selected["navigation"] = `navigation:${config.activeItem}`;
    if (config.hidden) state.hidden["navigation"] = true;
    rootChildren.push("navigation");
  }

  if (include("sidebarPanel")) {
    const config = stateValue.sidebarPanel!;
    addNode(nodes, {
      id: "sidebarPanel",
      kind: "sidebar",
      label: config.title,
      children: compileSidebarItems(nodes, state, "sidebarPanel", config.items),
    });
    if (config.activeItem) state.selected["sidebarPanel"] = `sidebarPanel:${config.activeItem}`;
    if (config.visible !== undefined) state.hidden["sidebarPanel"] = !config.visible;
    rootChildren.push("sidebarPanel");
  }

  if (include("toolbar")) {
    const config = stateValue.toolbar!;
    const children: string[] = [];
    if (config.groups) {
      for (const group of config.groups) {
        const id = `toolbar:group-${group.placement}`;
        children.push(id);
        addNode(nodes, {
          id,
          kind: "group",
          placement: group.placement,
          children: compileBarItems(nodes, state, id, group.placement, group.items),
        });
      }
    } else {
      children.push(...compileBarItems(nodes, state, "toolbar", "automatic", config.items ?? []));
    }
    addNode(nodes, {
      id: "toolbar",
      kind: "toolbar",
      children,
      meta: compactMeta({
        customizable: config.customizable,
        toolbarId: config.id,
        displayMode: config.displayMode,
        toolbarStyle: config.toolbarStyle,
      }),
    });
    if (config.hidden) state.hidden["toolbar"] = true;
    rootChildren.push("toolbar");
  }

  if (include("keyboard")) {
    const config = stateValue.keyboard!;
    addNode(nodes, {
      id: "keyboard",
      kind: "keyboard",
      children: compileBarItems(
        nodes,
        state,
        "keyboard",
        "automatic",
        config.accessory?.items ?? [],
      ),
      meta: compactMeta({ dismissMode: config.dismissMode }),
    });
    rootChildren.push("keyboard");
  }

  if (include("menuBar")) {
    const config = stateValue.menuBar!;
    const children = config.menus.map((menu) => `menuBar:${menu.id}`);
    addNode(nodes, { id: "menuBar", kind: "menuBar", children });
    for (const menu of config.menus) {
      const id = `menuBar:${menu.id}`;
      addNode(nodes, {
        id,
        kind: "menu",
        label: menu.label,
        children: compileMenuItems(nodes, state, id, menu.items),
      });
    }
    rootChildren.push("menuBar");
  }

  if (include("statusBar")) {
    const config = stateValue.statusBar!;
    addNode(nodes, {
      id: "statusBar",
      kind: "statusBar",
      meta: compactMeta({ style: config.style }),
    });
    if (config.hidden) state.hidden["statusBar"] = true;
    rootChildren.push("statusBar");
  }

  if (include("homeIndicator")) {
    const config = stateValue.homeIndicator!;
    addNode(nodes, { id: "homeIndicator", kind: "homeIndicator" });
    if (config.hidden) state.hidden["homeIndicator"] = true;
    rootChildren.push("homeIndicator");
  }

  if (include("tabBottomAccessory")) {
    const config = stateValue.tabBottomAccessory!;
    addNode(nodes, {
      id: "tabBottomAccessory",
      kind: "window",
      meta: windowMeta(config),
    });
    if (config.presented === false) state.hidden["tabBottomAccessory"] = true;
    rootChildren.push("tabBottomAccessory");
  }

  for (const [area, collection] of [
    ["sheets", stateValue.sheets],
    ["drawers", stateValue.drawers],
    ["appWindows", stateValue.appWindows],
    ["popovers", stateValue.popovers],
  ] as const) {
    if (!collection || !supportedAreas.has(area)) continue;
    const children = Object.keys(collection).map((name) => `${area}:${name}`);
    addNode(nodes, { id: area, kind: "group", children });
    for (const [name, config] of Object.entries(collection)) {
      const id = `${area}:${name}`;
      addNode(nodes, { id, kind: "window", meta: { ...config } });
      if (config.presented === false) state.hidden[id] = true;
    }
    rootChildren.push(area);
  }

  return {
    nativite: 2,
    type: "chrome.snapshot",
    docId: "main",
    revision: ++_revision,
    root: "root",
    nodes,
    state,
  };
}

function flushState(): void {
  if (!_supportedAreas) return;
  const effectiveMap = new Map<string, ChromeElement>();
  for (const layer of layerStack) {
    for (const [key, el] of layer) {
      effectiveMap.set(key, el);
    }
  }
  const state = buildState(effectiveMap);
  postToNative(compileChromeState(state, _supportedAreas));
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

function mapNclpEvent(message: ChromeEventMessage): ChromeEvent | undefined {
  const id = lastPathComponent(message.target);
  const value = message.value;
  if (message.event === "activate" && message.target.includes(":menu:")) {
    if (message.target.startsWith("titleBar:")) return { type: "titleBar.menuItemPressed", id };
    if (message.target.startsWith("toolbar:")) return { type: "toolbar.menuItemPressed", id };
  }
  if (message.event === "activate" && message.target.startsWith("titleBar:leading:")) {
    return { type: "titleBar.leadingItemPressed", id };
  }
  if (message.event === "activate" && message.target.startsWith("titleBar:trailing:")) {
    return { type: "titleBar.trailingItemPressed", id };
  }
  if (message.event === "back" && message.target === "titleBar")
    return { type: "titleBar.backPressed" };
  if (message.target === "titleBar:search") {
    if (message.event === "input")
      return { type: "titleBar.searchChanged", value: stringValue(value) };
    if (message.event === "submit")
      return { type: "titleBar.searchSubmitted", value: stringValue(value) };
    if (message.event === "cancel") return { type: "titleBar.searchCancelled" };
  }
  if (message.event === "back" && message.target === "navigation")
    return { type: "navigation.backPressed" };
  if (message.event === "select" && message.target === "navigation") {
    return { type: "navigation.itemPressed", id: lastPathComponent(stringValue(value)) };
  }
  if (message.target.startsWith("navigation:")) {
    if (message.event === "input")
      return { type: "navigation.searchChanged", value: stringValue(value) };
    if (message.event === "submit")
      return { type: "navigation.searchSubmitted", value: stringValue(value) };
    if (message.event === "cancel") return { type: "navigation.searchCancelled" };
  }
  if (message.event === "activate" && message.target.startsWith("sidebarPanel:")) {
    return { type: "sidebarPanel.itemPressed", id };
  }
  if (message.event === "activate" && message.target.startsWith("toolbar:"))
    return { type: "toolbar.itemPressed", id };
  if (message.event === "activate" && message.target.startsWith("keyboard:"))
    return { type: "keyboard.itemPressed", id };
  if (message.event === "activate" && message.target.startsWith("menuBar:"))
    return { type: "menuBar.itemPressed", id };
  if (message.target.startsWith("sheets:")) {
    const name = id;
    if (message.event === "open") return { type: "sheet.presented", name };
    if (message.event === "close") return { type: "sheet.dismissed", name };
    if (message.event === "detent")
      return { type: "sheet.detentChanged", name, detent: stringValue(value) };
    if (message.event === "error") {
      const payload = (value ?? {}) as { readonly message?: unknown; readonly code?: unknown };
      return {
        type: "sheet.loadFailed",
        name,
        message: stringValue(payload.message),
        code: Number(payload.code ?? 0),
      };
    }
  }
  if (message.target.startsWith("drawers:")) {
    if (message.event === "open") return { type: "drawer.presented", name: id };
    if (message.event === "close") return { type: "drawer.dismissed", name: id };
  }
  if (message.target.startsWith("appWindows:")) {
    if (message.event === "open") return { type: "appWindow.presented", name: id };
    if (message.event === "close") return { type: "appWindow.dismissed", name: id };
  }
  if (message.target.startsWith("popovers:")) {
    if (message.event === "open") return { type: "popover.presented", name: id };
    if (message.event === "close") return { type: "popover.dismissed", name: id };
  }
  if (message.target === "tabBottomAccessory") {
    if (message.event === "open") return { type: "tabBottomAccessory.presented" };
    if (message.event === "close") return { type: "tabBottomAccessory.dismissed" };
    if (message.event === "error") {
      const payload = (value ?? {}) as { readonly message?: unknown; readonly code?: unknown };
      return {
        type: "tabBottomAccessory.loadFailed",
        message: stringValue(payload.message),
        code: Number(payload.code ?? 0),
      };
    }
  }
  return undefined;
}

function receiveNativeMessage(detail: unknown): void {
  if (typeof detail !== "object" || detail === null) return;
  const message = detail as { readonly type?: unknown; readonly nativite?: unknown };
  if (message.nativite === 2 && message.type === "shell.ready") {
    _supportedAreas = new Set((message as ShellReadyMessage).areas);
    if (layerStack.length > 0) scheduleFlush();
    return;
  }
  if (message.nativite === 2 && message.type === "chrome.event") {
    const mapped = mapNclpEvent(message as ChromeEventMessage);
    if (mapped) handleIncoming(mapped);
    return;
  }
  const legacy = detail as { readonly event?: unknown; readonly data?: unknown };
  if (typeof legacy.event === "string") {
    const event = { type: legacy.event, ...(legacy.data as object) } as ChromeEvent;
    handleIncoming(event);
  }
}

function onNativiteEvent(e: Event): void {
  receiveNativeMessage((e as CustomEvent).detail);
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
      w["nativiteReceive"] = (message: unknown): void => {
        window.dispatchEvent(
          new CustomEvent("__nativite_event__", {
            detail: message,
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

interface ChromeSplash {
  /**
   * Prevent the splash screen from automatically hiding when the page finishes
   * loading. Call this at the top level of your module — before any async work —
   * so the flag is set before the native page-finished handler runs.
   *
   * After calling this, you **must** call `chrome.splash.hide()` to dismiss
   * the splash screen manually.
   */
  preventAutoHide(): void;
  /** Manually hide the splash screen. */
  hide(): void;
}

interface ChromeFunction {
  (...elements: ChromeElement[]): Unsubscribe;
  readonly on: ChromeOnOverloads;
  readonly messaging: ChromeMessaging;
  readonly splash: ChromeSplash;
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

const splash: ChromeSplash = {
  preventAutoHide(): void {
    _splashAutoHidePrevented = true;
    // Set a synchronous window global so native can check it in didFinish /
    // onPageFinished before the bridge port is ready (Android) or before the
    // async reply channel fires (iOS).
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__nativite_splash_prevent_auto_hide__ = true;
    }
  },
  hide(): void {
    postToNative({
      id: null,
      type: "call",
      namespace: "__chrome__",
      method: "__chrome_splash_hide__",
      args: null,
    });
  },
};

export const chrome = Object.assign(chromeImpl, {
  on: chromeOn,
  messaging,
  splash,
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
  _supportedAreas = null;
  _revision = 0;
  _splashAutoHidePrevented = false;
  if (typeof window !== "undefined") {
    delete (window as unknown as Record<string, unknown>).__nativite_splash_prevent_auto_hide__;
  }
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

/** @internal */
export function _receiveNativeMessage(message: unknown): void {
  receiveNativeMessage(message);
}
