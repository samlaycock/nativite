import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type { ChromeEvent } from "../../chrome/types.ts";

// ─── Mock window + native handler ───────────────────────────────────────────
// Bun's test runner has no DOM. Provide a minimal global `window` and
// simulate window.webkit.messageHandlers.nativite for native transport tests.

if (typeof globalThis.window === "undefined") {
  (globalThis as unknown as Record<string, unknown>).window = globalThis;
}

type NativeMessage = Record<string, unknown>;
let nativeMessages: NativeMessage[] = [];

const postMessage = mock((msg: NativeMessage) => {
  nativeMessages.push(msg);
});

function installNativeHandler(): void {
  (globalThis as unknown as Record<string, unknown>)["webkit"] = {
    messageHandlers: {
      nativite: { postMessage },
    },
  };
}

function removeNativeHandler(): void {
  delete (globalThis as unknown as Record<string, unknown>)["webkit"];
}

// ─── Import SUT ──────────────────────────────────────────────────────────────

import {
  _drainFlush,
  _handleIncoming,
  _resetChromeState,
  appWindow,
  button,
  chrome,
  drawer,
  homeIndicator,
  keyboard,
  menuBar,
  menuItem,
  navigation,
  navItem,
  popover,
  sheet,
  sidebarPanel,
  statusBar,
  titleBar,
  toolbar,
} from "../index.ts";

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  postMessage.mockClear();
  nativeMessages = [];
  installNativeHandler();
  _resetChromeState();
});

afterEach(() => {
  removeNativeHandler();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract the chrome state from the last native message. */
function lastState(): unknown {
  const msg = nativeMessages[nativeMessages.length - 1]!;
  return msg["args"];
}

/** Simulate an incoming native event via the chrome event dispatcher. */
function simulateEvent(event: string, data: Record<string, unknown>): void {
  _handleIncoming({ type: event, ...data } as ChromeEvent);
}

// ─── Factory functions ──────────────────────────────────────────────────────

describe("factory functions", () => {
  it("titleBar() returns a ChromeElement with _area 'titleBar'", () => {
    const el = titleBar({ title: "Settings" });
    expect(el._area).toBe("titleBar");
    expect(el._config).toEqual({ title: "Settings" });
  });

  it("navigation() returns a ChromeElement with _area 'navigation'", () => {
    const el = navigation({ items: [{ id: "home", label: "Home", icon: "house" }] });
    expect(el._area).toBe("navigation");
    expect(el._config).toMatchObject({ items: [{ id: "home" }] });
  });

  it("toolbar() returns a ChromeElement with _area 'toolbar'", () => {
    const el = toolbar({ items: [] });
    expect(el._area).toBe("toolbar");
  });

  it("sidebarPanel() returns a ChromeElement with _area 'sidebarPanel'", () => {
    const el = sidebarPanel({ items: [] });
    expect(el._area).toBe("sidebarPanel");
  });

  it("statusBar() returns a ChromeElement with _area 'statusBar'", () => {
    const el = statusBar({ style: "light" });
    expect(el._area).toBe("statusBar");
    expect(el._config).toEqual({ style: "light" });
  });

  it("homeIndicator() returns a ChromeElement with _area 'homeIndicator'", () => {
    const el = homeIndicator({ hidden: true });
    expect(el._area).toBe("homeIndicator");
  });

  it("keyboard() returns a ChromeElement with _area 'keyboard'", () => {
    const el = keyboard({ dismissMode: "interactive" });
    expect(el._area).toBe("keyboard");
  });

  it("menuBar() returns a ChromeElement with _area 'menuBar'", () => {
    const el = menuBar({ menus: [] });
    expect(el._area).toBe("menuBar");
  });

  it("sheet() returns a ChromeElement with _area 'sheet' and _name", () => {
    const el = sheet("settings", { url: "/settings", presented: true });
    expect(el._area).toBe("sheet");
    expect((el as { _name: string })._name).toBe("settings");
    expect(el._config).toEqual({ url: "/settings", presented: true });
  });

  it("drawer() returns a ChromeElement with _area 'drawer' and _name", () => {
    const el = drawer("sidebar", { url: "/sidebar" });
    expect(el._area).toBe("drawer");
    expect((el as { _name: string })._name).toBe("sidebar");
  });

  it("appWindow() returns a ChromeElement with _area 'appWindow' and _name", () => {
    const el = appWindow("prefs", { url: "/preferences" });
    expect(el._area).toBe("appWindow");
    expect((el as { _name: string })._name).toBe("prefs");
  });

  it("popover() returns a ChromeElement with _area 'popover' and _name", () => {
    const el = popover("menu", { url: "/menu" });
    expect(el._area).toBe("popover");
    expect((el as { _name: string })._name).toBe("menu");
  });
});

// ─── Item constructors ──────────────────────────────────────────────────────

describe("item constructors", () => {
  it("button() returns the ButtonItem config unchanged", () => {
    const config = { id: "save", label: "Save", style: "primary" as const };
    expect(button(config)).toBe(config);
  });

  it("navItem() returns the NavigationItem config unchanged", () => {
    const config = { id: "home", label: "Home", icon: "house" };
    expect(navItem(config)).toBe(config);
  });

  it("menuItem() returns the MenuItem config unchanged", () => {
    const config = { id: "sort", label: "Sort" };
    expect(menuItem(config)).toBe(config);
  });
});

// ─── chrome() callable ──────────────────────────────────────────────────────

describe("chrome()", () => {
  it("sends the declared chrome areas to native", () => {
    chrome(titleBar({ title: "Inbox" }), statusBar({ style: "auto" }));
    _drainFlush();
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(lastState()).toEqual({
      titleBar: { title: "Inbox" },
      statusBar: { style: "auto" },
    });
  });

  it("titleBar largeTitleMode is sent to native", () => {
    chrome(titleBar({ title: "App", largeTitleMode: "large" }));
    _drainFlush();
    const state = lastState() as Record<string, unknown>;
    const tb = state["titleBar"] as { title: string; largeTitleMode: string };
    expect(tb.largeTitleMode).toBe("large");
  });

  it("returns a cleanup function", () => {
    const cleanup = chrome(titleBar({ title: "Settings" }));
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("cleanup sends state without the cleaned-up areas", () => {
    chrome(statusBar({ style: "auto" }));
    _drainFlush();
    postMessage.mockClear();
    nativeMessages = [];

    const cleanup = chrome(titleBar({ title: "Settings" }));
    _drainFlush();
    postMessage.mockClear();
    nativeMessages = [];

    cleanup();
    _drainFlush();
    expect(lastState()).toEqual({ statusBar: { style: "auto" } });
  });

  it("later layer wins for the same area", () => {
    chrome(titleBar({ title: "First" }));
    chrome(titleBar({ title: "Second" }));
    _drainFlush();
    const state = lastState() as Record<string, unknown>;
    expect((state["titleBar"] as { title: string }).title).toBe("Second");
  });

  it("cleanup of inner layer restores outer layer value", () => {
    chrome(titleBar({ title: "Outer" }));
    const cleanup = chrome(titleBar({ title: "Inner" }));
    _drainFlush();
    postMessage.mockClear();
    nativeMessages = [];

    cleanup();
    _drainFlush();
    expect((lastState() as Record<string, unknown>)["titleBar"]).toEqual({
      title: "Outer",
    });
  });

  it("cleanup only restores areas declared in that call", () => {
    chrome(titleBar({ title: "Base" }), navigation({ items: [] }));
    const cleanup = chrome(titleBar({ title: "Override" }));
    _drainFlush();
    postMessage.mockClear();
    nativeMessages = [];

    cleanup();
    _drainFlush();
    const state = lastState() as Record<string, unknown>;
    expect((state["titleBar"] as { title: string }).title).toBe("Base");
    expect(state["navigation"]).toEqual({ items: [] });
  });

  it("multiple calls accumulate non-overlapping areas", () => {
    chrome(titleBar({ title: "App" }));
    chrome(statusBar({ style: "light" }));
    _drainFlush();
    const state = lastState() as Record<string, unknown>;
    expect(state["titleBar"]).toEqual({ title: "App" });
    expect(state["statusBar"]).toEqual({ style: "light" });
  });

  it("sends empty state when all layers are cleaned up", () => {
    const cleanup = chrome(titleBar({ title: "Temp" }));
    _drainFlush();
    postMessage.mockClear();
    nativeMessages = [];

    cleanup();
    _drainFlush();
    expect(lastState()).toEqual({});
  });

  it("cleanup is a no-op when called a second time", () => {
    const cleanup = chrome(titleBar({ title: "Once" }));
    cleanup();
    _drainFlush();
    postMessage.mockClear();
    nativeMessages = [];

    cleanup();
    _drainFlush();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("sends named sheets under 'sheets' key", () => {
    chrome(sheet("settings", { url: "/settings", presented: true }));
    _drainFlush();
    expect(lastState()).toEqual({
      sheets: { settings: { url: "/settings", presented: true } },
    });
  });

  it("two sheets with different names coexist", () => {
    chrome(
      sheet("settings", { url: "/settings", presented: true }),
      sheet("help", { url: "/help", presented: false }),
    );
    _drainFlush();
    expect(lastState()).toEqual({
      sheets: {
        settings: { url: "/settings", presented: true },
        help: { url: "/help", presented: false },
      },
    });
  });

  it("sends named drawers under 'drawers' key", () => {
    chrome(drawer("sidebar", { url: "/sidebar", presented: true }));
    _drainFlush();
    expect(lastState()).toEqual({
      drawers: { sidebar: { url: "/sidebar", presented: true } },
    });
  });

  it("sends named appWindows under 'appWindows' key", () => {
    chrome(appWindow("prefs", { url: "/preferences", presented: false }));
    _drainFlush();
    expect(lastState()).toEqual({
      appWindows: { prefs: { url: "/preferences", presented: false } },
    });
  });

  it("sends named popovers under 'popovers' key", () => {
    chrome(popover("ctx", { url: "/context-menu", presented: true }));
    _drainFlush();
    expect(lastState()).toEqual({
      popovers: { ctx: { url: "/context-menu", presented: true } },
    });
  });

  it("cleanup of a named sheet removes it while other sheets remain", () => {
    chrome(sheet("help", { url: "/help", presented: true }));
    const cleanup = chrome(sheet("settings", { url: "/settings", presented: true }));
    _drainFlush();
    postMessage.mockClear();
    nativeMessages = [];

    cleanup();
    _drainFlush();
    const state = lastState() as Record<string, unknown>;
    const sheets = state["sheets"] as Record<string, unknown>;
    expect(sheets["settings"]).toBeUndefined();
    expect(sheets["help"]).toEqual({ url: "/help", presented: true });
  });

  it("later layer for the same named sheet wins", () => {
    chrome(sheet("settings", { url: "/settings", presented: false }));
    chrome(sheet("settings", { url: "/settings", presented: true }));
    _drainFlush();
    const state = lastState() as Record<string, unknown>;
    const sheets = state["sheets"] as Record<string, { presented: boolean }>;
    expect(sheets["settings"]!.presented).toBe(true);
  });

  // ─── Flush coalescing ────────────────────────────────────────────────────

  it("coalesces synchronous cleanup+re-apply into one message with the final state", () => {
    const cleanup = chrome(titleBar({ title: "Old" }));
    _drainFlush();
    postMessage.mockClear();
    nativeMessages = [];

    cleanup();
    chrome(titleBar({ title: "New" }));

    expect(postMessage).not.toHaveBeenCalled();

    _drainFlush();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(lastState()).toEqual({ titleBar: { title: "New" } });
  });

  it("coalescing works across all chrome areas simultaneously", () => {
    const cleanup = chrome(
      titleBar({ title: "Old" }),
      toolbar({ items: [] }),
      statusBar({ style: "auto" }),
    );
    _drainFlush();
    postMessage.mockClear();
    nativeMessages = [];

    cleanup();
    chrome(titleBar({ title: "New" }), toolbar({ items: [] }), statusBar({ style: "light" }));
    _drainFlush();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(lastState()).toEqual({
      titleBar: { title: "New" },
      toolbar: { items: [] },
      statusBar: { style: "light" },
    });
  });
});

// ─── chrome.on — specific event type ────────────────────────────────────────

describe("chrome.on(type, handler)", () => {
  it("fires handler when the matching event arrives", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("titleBar.trailingItemPressed", handler);
    simulateEvent("titleBar.trailingItemPressed", { id: "save" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: "titleBar.trailingItemPressed", id: "save" });
    unsub();
  });

  it("does not fire for a different event type", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("titleBar.trailingItemPressed", handler);
    simulateEvent("titleBar.leadingItemPressed", { id: "back" });
    expect(handler).not.toHaveBeenCalled();
    unsub();
  });

  it("returns an unsubscribe that stops the handler", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("navigation.itemPressed", handler);
    simulateEvent("navigation.itemPressed", { id: "home" });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    simulateEvent("navigation.itemPressed", { id: "home" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("multiple handlers for the same event all fire", () => {
    const h1 = mock(() => {});
    const h2 = mock(() => {});
    const unsub1 = chrome.on("toolbar.itemPressed", h1);
    const unsub2 = chrome.on("toolbar.itemPressed", h2);
    simulateEvent("toolbar.itemPressed", { id: "share" });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    unsub1();
    unsub2();
  });

  it("fires with the full ChromeEvent including type field", () => {
    const handler = mock((event: unknown) => event);
    const unsub = chrome.on("navigation.itemPressed", handler);
    simulateEvent("navigation.itemPressed", { id: "inbox" });
    expect(handler).toHaveBeenCalledWith({ type: "navigation.itemPressed", id: "inbox" });
    unsub();
  });

  it("titleBar.backTapped fires with no extra fields", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("titleBar.backPressed", handler);
    simulateEvent("titleBar.backPressed", {});
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: "titleBar.backPressed" });
    unsub();
  });

  it("titleBar.searchBar.changed fires with value field", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("titleBar.searchChanged", handler);
    simulateEvent("titleBar.searchChanged", { value: "query" });
    expect(handler).toHaveBeenCalledWith({ type: "titleBar.searchChanged", value: "query" });
    unsub();
  });

  it("keyboard.accessoryItemTapped fires with id field", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("keyboard.itemPressed", handler);
    simulateEvent("keyboard.itemPressed", { id: "done" });
    expect(handler).toHaveBeenCalledWith({ type: "keyboard.itemPressed", id: "done" });
    unsub();
  });

  it("toolbar.menuItemSelected fires with id field", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("toolbar.menuItemPressed", handler);
    simulateEvent("toolbar.menuItemPressed", { id: "sort-name" });
    expect(handler).toHaveBeenCalledWith({ type: "toolbar.menuItemPressed", id: "sort-name" });
    unsub();
  });

  it("sidebarPanel.itemSelected fires with id field", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("sidebarPanel.itemPressed", handler);
    simulateEvent("sidebarPanel.itemPressed", { id: "nav" });
    expect(handler).toHaveBeenCalledWith({ type: "sidebarPanel.itemPressed", id: "nav" });
    unsub();
  });

  it("menuBar.itemSelected fires with id field", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("menuBar.itemPressed", handler);
    simulateEvent("menuBar.itemPressed", { id: "zoom-in" });
    expect(handler).toHaveBeenCalledWith({ type: "menuBar.itemPressed", id: "zoom-in" });
    unsub();
  });
});

// ─── chrome.on — wildcard ───────────────────────────────────────────────────

describe("chrome.on(handler) — wildcard", () => {
  it("fires for every event type", () => {
    const handler = mock(() => {});
    const unsub = chrome.on(handler);
    simulateEvent("titleBar.backPressed", {});
    simulateEvent("navigation.itemPressed", { id: "home" });
    simulateEvent("toolbar.itemPressed", { id: "share" });
    expect(handler).toHaveBeenCalledTimes(3);
    unsub();
  });

  it("returns an unsubscribe that stops the wildcard handler", () => {
    const handler = mock(() => {});
    const unsub = chrome.on(handler);
    simulateEvent("titleBar.backPressed", {});
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    simulateEvent("titleBar.backPressed", {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("receives the full ChromeEvent with type field", () => {
    const handler = mock((event: unknown) => event);
    const unsub = chrome.on(handler);
    simulateEvent("navigation.itemPressed", { id: "inbox" });
    expect(handler).toHaveBeenCalledWith({ type: "navigation.itemPressed", id: "inbox" });
    unsub();
  });

  it("specific and wildcard handlers both fire for the same event", () => {
    const specific = mock(() => {});
    const wildcard = mock(() => {});
    const unsub1 = chrome.on("toolbar.itemPressed", specific);
    const unsub2 = chrome.on(wildcard);
    simulateEvent("toolbar.itemPressed", { id: "share" });
    expect(specific).toHaveBeenCalledTimes(1);
    expect(wildcard).toHaveBeenCalledTimes(1);
    unsub1();
    unsub2();
  });

  it("multiple wildcard handlers all fire", () => {
    const h1 = mock(() => {});
    const h2 = mock(() => {});
    const unsub1 = chrome.on(h1);
    const unsub2 = chrome.on(h2);
    simulateEvent("navigation.itemPressed", { id: "home" });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    unsub1();
    unsub2();
  });
});

// ─── Sheet events ───────────────────────────────────────────────────────────

describe("sheet events", () => {
  it("sheet.presented fires with name", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("sheet.presented", handler);
    simulateEvent("sheet.presented", { name: "settings" });
    expect(handler).toHaveBeenCalledWith({ type: "sheet.presented", name: "settings" });
    unsub();
  });

  it("sheet.dismissed fires with name", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("sheet.dismissed", handler);
    simulateEvent("sheet.dismissed", { name: "settings" });
    expect(handler).toHaveBeenCalledWith({ type: "sheet.dismissed", name: "settings" });
    unsub();
  });

  it("sheet.detentChanged fires with name and detent", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("sheet.detentChanged", handler);
    simulateEvent("sheet.detentChanged", { name: "settings", detent: "large" });
    expect(handler).toHaveBeenCalledWith({
      type: "sheet.detentChanged",
      name: "settings",
      detent: "large",
    });
    unsub();
  });

  it("sheet.loadFailed fires with name, message and code", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("sheet.loadFailed", handler);
    simulateEvent("sheet.loadFailed", { name: "settings", message: "Not found", code: 404 });
    expect(handler).toHaveBeenCalledWith({
      type: "sheet.loadFailed",
      name: "settings",
      message: "Not found",
      code: 404,
    });
    unsub();
  });
});

// ─── Child webview events ───────────────────────────────────────────────────

describe("child webview events", () => {
  it("drawer.presented fires with name", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("drawer.presented", handler);
    simulateEvent("drawer.presented", { name: "sidebar" });
    expect(handler).toHaveBeenCalledWith({ type: "drawer.presented", name: "sidebar" });
    unsub();
  });

  it("appWindow.dismissed fires with name", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("appWindow.dismissed", handler);
    simulateEvent("appWindow.dismissed", { name: "prefs" });
    expect(handler).toHaveBeenCalledWith({ type: "appWindow.dismissed", name: "prefs" });
    unsub();
  });

  it("popover.presented fires with name", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("popover.presented", handler);
    simulateEvent("popover.presented", { name: "ctx" });
    expect(handler).toHaveBeenCalledWith({ type: "popover.presented", name: "ctx" });
    unsub();
  });
});

// ─── safeArea.changed event ─────────────────────────────────────────────────

describe("safeArea.changed event", () => {
  it("fires handler with all four inset values", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("safeArea.changed", handler);
    simulateEvent("safeArea.changed", { top: 44, right: 0, bottom: 34, left: 0 });
    expect(handler).toHaveBeenCalledWith({
      type: "safeArea.changed",
      top: 44,
      right: 0,
      bottom: 34,
      left: 0,
    });
    unsub();
  });
});

// ─── chrome.messaging ───────────────────────────────────────────────────────

describe("chrome.messaging", () => {
  it("postToParent() sends a native bridge call", () => {
    chrome.messaging.postToParent({ type: "saved" });
    expect(postMessage).toHaveBeenCalledWith({
      id: null,
      type: "call",
      namespace: "__chrome__",
      method: "__chrome_messaging_post_to_parent__",
      args: { type: "saved" },
    });
  });

  it("postToChild() sends a native bridge call with target name", () => {
    chrome.messaging.postToChild("settings", { refresh: true });
    expect(postMessage).toHaveBeenCalledWith({
      id: null,
      type: "call",
      namespace: "__chrome__",
      method: "__chrome_messaging_post_to_child__",
      args: { name: "settings", payload: { refresh: true } },
    });
  });

  it("broadcast() sends a native bridge call", () => {
    chrome.messaging.broadcast({ event: "theme-changed" });
    expect(postMessage).toHaveBeenCalledWith({
      id: null,
      type: "call",
      namespace: "__chrome__",
      method: "__chrome_messaging_broadcast__",
      args: { event: "theme-changed" },
    });
  });

  it("onMessage() fires handler when a message event arrives", () => {
    const handler = mock(() => {});
    const unsub = chrome.messaging.onMessage(handler);
    simulateEvent("message", { from: "settings", payload: { type: "saved" } });
    expect(handler).toHaveBeenCalledWith("settings", { type: "saved" });
    unsub();
  });

  it("onMessage() fires with 'main' as from for the main webview", () => {
    const handler = mock(() => {});
    const unsub = chrome.messaging.onMessage(handler);
    simulateEvent("message", { from: "main", payload: { ping: true } });
    expect(handler).toHaveBeenCalledWith("main", { ping: true });
    unsub();
  });

  it("onMessage() returns an unsubscribe that stops the handler", () => {
    const handler = mock(() => {});
    const unsub = chrome.messaging.onMessage(handler);
    simulateEvent("message", { from: "main", payload: {} });
    unsub();
    simulateEvent("message", { from: "main", payload: {} });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("onMessage() and chrome.on('message') both fire for the same event", () => {
    const msgHandler = mock(() => {});
    const onHandler = mock(() => {});
    const unsub1 = chrome.messaging.onMessage(msgHandler);
    const unsub2 = chrome.on("message", onHandler);
    simulateEvent("message", { from: "child", payload: "hello" });
    expect(msgHandler).toHaveBeenCalledTimes(1);
    expect(onHandler).toHaveBeenCalledTimes(1);
    unsub1();
    unsub2();
  });
});

// ─── nativiteReceive integration ────────────────────────────────────────────

describe("nativiteReceive", () => {
  it("is registered on window so native can deliver events", () => {
    // Trigger lazy initialisation that chrome.on() performs.
    const handler = mock(() => {});
    const unsub = chrome.on(handler);

    const receive = (globalThis as unknown as Record<string, unknown>)["nativiteReceive"] as
      | ((msg: unknown) => void)
      | undefined;
    expect(typeof receive).toBe("function");
    unsub();
  });

  it("events delivered via nativiteReceive reach chrome.on() handlers", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("toolbar.itemPressed", handler);

    const receive = (globalThis as unknown as Record<string, unknown>)["nativiteReceive"] as (
      msg: unknown,
    ) => void;

    receive({ event: "toolbar.itemPressed", data: { id: "share" } });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: "toolbar.itemPressed", id: "share" });
    unsub();
  });
});

// ─── Unified ButtonItem across areas ────────────────────────────────────────

describe("unified ButtonItem across chrome areas", () => {
  it("button with menu is sent correctly in titleBar trailingItems", () => {
    const sortButton = button({
      id: "sort",
      icon: "arrow.up.arrow.down",
      menu: {
        title: "Sort by",
        items: [
          menuItem({ id: "sort-name", label: "Name", checked: true }),
          menuItem({ id: "sort-date", label: "Date" }),
        ],
      },
    });

    chrome(titleBar({ trailingItems: [sortButton] }));
    _drainFlush();
    const state = lastState() as Record<string, unknown>;
    const tb = state["titleBar"] as { trailingItems: unknown[] };
    expect(tb.trailingItems[0]).toEqual(sortButton);
  });

  it("same button can be used in both titleBar and toolbar", () => {
    const btn = button({ id: "share", icon: "square.and.arrow.up" });

    chrome(titleBar({ trailingItems: [btn] }));
    _drainFlush();
    const titleBarState = lastState() as Record<string, unknown>;
    postMessage.mockClear();
    nativeMessages = [];

    chrome(toolbar({ items: [btn] }));
    _drainFlush();
    const toolbarState = lastState() as Record<string, unknown>;

    expect((titleBarState["titleBar"] as { trailingItems: unknown[] }).trailingItems[0]).toBe(btn);
    expect((toolbarState["toolbar"] as { items: unknown[] }).items[0]).toBe(btn);
  });

  it("flexible-space and fixed-space work in toolbar items", () => {
    chrome(
      toolbar({
        items: [
          button({ id: "back", label: "Back" }),
          { type: "flexible-space" },
          { type: "fixed-space", width: 8 },
          button({ id: "forward", label: "Forward" }),
        ],
      }),
    );
    _drainFlush();
    const state = lastState() as Record<string, unknown>;
    const items = (state["toolbar"] as { items: unknown[] }).items;
    expect(items[1]).toEqual({ type: "flexible-space" });
    expect(items[2]).toEqual({ type: "fixed-space", width: 8 });
  });
});
