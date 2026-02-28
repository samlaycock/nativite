import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type { BridgeEventMessage } from "../../index.ts";

// ─── Mock _bridgeSend ────────────────────────────────────────────────────────
// We replace the _bridgeSend export from nativite/client using mock.module so
// that chrome/index.ts picks up the spy when it imports the function.
// Bun hoists mock.module calls before static imports execute.

type SendCall = [namespace: string, method: string, args: unknown];
let sendCalls: SendCall[] = [];

const sendSpy = mock((...args: unknown[]) => {
  sendCalls.push(args as unknown as SendCall);
});

void mock.module("../../client/index.ts", () => ({
  bridge: {
    get isNative() {
      return false;
    },
    call: mock(() => Promise.resolve(undefined)),
    subscribe: mock(() => () => {}),
  },
  _bridgeSend: sendSpy,
  _registerReceiveHandler: () => {},
}));

// ─── Import SUT ──────────────────────────────────────────────────────────────

import {
  _drainFlush,
  _handleIncoming,
  _resetChromeState,
  _setWorkerPort,
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
  sendSpy.mockClear();
  sendCalls = [];
  _resetChromeState();
});

// ─── Helper: simulate an incoming native event ────────────────────────────────

function simulateEvent(event: string, data: unknown): void {
  const msg: BridgeEventMessage = { id: null, type: "event", event, data };
  _handleIncoming(msg);
}

// ─── Factory functions ────────────────────────────────────────────────────────

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

// ─── Item constructors ────────────────────────────────────────────────────────

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

// ─── chrome() callable ───────────────────────────────────────────────────────

describe("chrome()", () => {
  it("sends the declared chrome areas over the bridge", () => {
    chrome(titleBar({ title: "Inbox" }), statusBar({ style: "auto" }));
    _drainFlush();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendCalls[0]![2]).toEqual({
      titleBar: { title: "Inbox" },
      statusBar: { style: "auto" },
    });
  });

  it("returns a cleanup function", () => {
    const cleanup = chrome(titleBar({ title: "Settings" }));
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("cleanup sends bridge state without the cleaned-up areas", () => {
    chrome(statusBar({ style: "auto" }));
    _drainFlush();
    sendSpy.mockClear();
    sendCalls = [];

    const cleanup = chrome(titleBar({ title: "Settings" }));
    _drainFlush();
    sendSpy.mockClear();
    sendCalls = [];

    cleanup();
    _drainFlush();
    expect(sendCalls[0]![2]).toEqual({ statusBar: { style: "auto" } });
  });

  it("later layer wins for the same area", () => {
    chrome(titleBar({ title: "First" }));
    chrome(titleBar({ title: "Second" }));
    _drainFlush();
    const lastState = sendCalls[sendCalls.length - 1]![2] as Record<string, unknown>;
    expect((lastState["titleBar"] as { title: string }).title).toBe("Second");
  });

  it("cleanup of inner layer restores outer layer value", () => {
    chrome(titleBar({ title: "Outer" }));
    const cleanup = chrome(titleBar({ title: "Inner" }));
    _drainFlush();
    sendSpy.mockClear();
    sendCalls = [];

    cleanup();
    _drainFlush();
    expect((sendCalls[0]![2] as Record<string, unknown>)["titleBar"]).toEqual({
      title: "Outer",
    });
  });

  it("cleanup only restores areas declared in that call", () => {
    chrome(titleBar({ title: "Base" }), navigation({ items: [] }));
    const cleanup = chrome(titleBar({ title: "Override" }));
    _drainFlush();
    sendSpy.mockClear();
    sendCalls = [];

    cleanup();
    _drainFlush();
    const state = sendCalls[0]![2] as Record<string, unknown>;
    expect((state["titleBar"] as { title: string }).title).toBe("Base");
    expect(state["navigation"]).toEqual({ items: [] });
  });

  it("multiple calls accumulate non-overlapping areas", () => {
    chrome(titleBar({ title: "App" }));
    chrome(statusBar({ style: "light" }));
    _drainFlush();
    const state = sendCalls[sendCalls.length - 1]![2] as Record<string, unknown>;
    expect(state["titleBar"]).toEqual({ title: "App" });
    expect(state["statusBar"]).toEqual({ style: "light" });
  });

  it("sends empty state when all layers are cleaned up", () => {
    const cleanup = chrome(titleBar({ title: "Temp" }));
    _drainFlush();
    sendSpy.mockClear();
    sendCalls = [];

    cleanup();
    _drainFlush();
    expect(sendCalls[0]![2]).toEqual({});
  });

  it("cleanup is a no-op when called a second time", () => {
    const cleanup = chrome(titleBar({ title: "Once" }));
    cleanup();
    _drainFlush();
    sendSpy.mockClear();
    sendCalls = [];

    cleanup();
    _drainFlush();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("sends named sheets under 'sheets' key", () => {
    chrome(sheet("settings", { url: "/settings", presented: true }));
    _drainFlush();
    expect(sendCalls[0]![2]).toEqual({
      sheets: { settings: { url: "/settings", presented: true } },
    });
  });

  it("two sheets with different names coexist", () => {
    chrome(
      sheet("settings", { url: "/settings", presented: true }),
      sheet("help", { url: "/help", presented: false }),
    );
    _drainFlush();
    expect(sendCalls[0]![2]).toEqual({
      sheets: {
        settings: { url: "/settings", presented: true },
        help: { url: "/help", presented: false },
      },
    });
  });

  it("sends named drawers under 'drawers' key", () => {
    chrome(drawer("sidebar", { url: "/sidebar", presented: true }));
    _drainFlush();
    expect(sendCalls[0]![2]).toEqual({
      drawers: { sidebar: { url: "/sidebar", presented: true } },
    });
  });

  it("sends named appWindows under 'appWindows' key", () => {
    chrome(appWindow("prefs", { url: "/preferences", presented: false }));
    _drainFlush();
    expect(sendCalls[0]![2]).toEqual({
      appWindows: { prefs: { url: "/preferences", presented: false } },
    });
  });

  it("sends named popovers under 'popovers' key", () => {
    chrome(popover("ctx", { url: "/context-menu", presented: true }));
    _drainFlush();
    expect(sendCalls[0]![2]).toEqual({
      popovers: { ctx: { url: "/context-menu", presented: true } },
    });
  });

  it("cleanup of a named sheet removes it while other sheets remain", () => {
    chrome(sheet("help", { url: "/help", presented: true }));
    const cleanup = chrome(sheet("settings", { url: "/settings", presented: true }));
    _drainFlush();
    sendSpy.mockClear();
    sendCalls = [];

    cleanup();
    _drainFlush();
    const state = sendCalls[0]![2] as Record<string, unknown>;
    const sheets = state["sheets"] as Record<string, unknown>;
    expect(sheets["settings"]).toBeUndefined();
    expect(sheets["help"]).toEqual({ url: "/help", presented: true });
  });

  it("later layer for the same named sheet wins", () => {
    chrome(sheet("settings", { url: "/settings", presented: false }));
    chrome(sheet("settings", { url: "/settings", presented: true }));
    _drainFlush();
    const state = sendCalls[sendCalls.length - 1]![2] as Record<string, unknown>;
    const sheets = state["sheets"] as Record<string, { presented: boolean }>;
    expect(sheets["settings"]!.presented).toBe(true);
  });

  // ─── Flush coalescing ──────────────────────────────────────────────────────
  // Verifies that synchronous cleanup+re-apply cycles (the React useEffect
  // pattern) produce exactly one native message with the final state, not two
  // messages with an intermediate empty/partial state in between.

  it("coalesces synchronous cleanup+re-apply into one bridge call with the final state", () => {
    const cleanup = chrome(titleBar({ title: "Old" }));
    _drainFlush();
    sendSpy.mockClear();
    sendCalls = [];

    // Simulate React useEffect dependency change: cleanup fires synchronously,
    // immediately followed by the new effect — both in the same JS tick.
    cleanup();
    chrome(titleBar({ title: "New" }));

    // No bridge call should have been made yet (both flushes coalesced).
    expect(sendSpy).not.toHaveBeenCalled();

    _drainFlush();

    // Exactly one call, carrying only the final state — never the intermediate
    // empty state that would trigger a native reset+re-apply cycle.
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendCalls[0]![2]).toEqual({ titleBar: { title: "New" } });
  });

  it("coalescing works across all chrome areas simultaneously", () => {
    const cleanup = chrome(
      titleBar({ title: "Old" }),
      toolbar({ items: [] }),
      statusBar({ style: "auto" }),
    );
    _drainFlush();
    sendSpy.mockClear();
    sendCalls = [];

    cleanup();
    chrome(titleBar({ title: "New" }), toolbar({ items: [] }), statusBar({ style: "light" }));
    _drainFlush();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendCalls[0]![2]).toEqual({
      titleBar: { title: "New" },
      toolbar: { items: [] },
      statusBar: { style: "light" },
    });
  });
});

// ─── chrome.on — specific event type ─────────────────────────────────────────

describe("chrome.on(type, handler)", () => {
  it("fires handler when the matching event arrives", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("titleBar.trailingItemTapped", handler);
    simulateEvent("titleBar.trailingItemTapped", { id: "save" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: "titleBar.trailingItemTapped", id: "save" });
    unsub();
  });

  it("does not fire for a different event type", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("titleBar.trailingItemTapped", handler);
    simulateEvent("titleBar.leadingItemTapped", { id: "back" });
    expect(handler).not.toHaveBeenCalled();
    unsub();
  });

  it("returns an unsubscribe that stops the handler", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("navigation.itemSelected", handler);
    simulateEvent("navigation.itemSelected", { id: "home" });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    simulateEvent("navigation.itemSelected", { id: "home" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("multiple handlers for the same event all fire", () => {
    const h1 = mock(() => {});
    const h2 = mock(() => {});
    const unsub1 = chrome.on("toolbar.itemTapped", h1);
    const unsub2 = chrome.on("toolbar.itemTapped", h2);
    simulateEvent("toolbar.itemTapped", { id: "share" });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    unsub1();
    unsub2();
  });

  it("fires with the full ChromeEvent including type field", () => {
    const handler = mock((event: unknown) => event);
    const unsub = chrome.on("navigation.itemSelected", handler);
    simulateEvent("navigation.itemSelected", { id: "inbox" });
    expect(handler).toHaveBeenCalledWith({ type: "navigation.itemSelected", id: "inbox" });
    unsub();
  });

  it("titleBar.backTapped fires with no extra fields", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("titleBar.backTapped", handler);
    simulateEvent("titleBar.backTapped", {});
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: "titleBar.backTapped" });
    unsub();
  });

  it("titleBar.searchBar.changed fires with value field", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("titleBar.searchBar.changed", handler);
    simulateEvent("titleBar.searchBar.changed", { value: "query" });
    expect(handler).toHaveBeenCalledWith({ type: "titleBar.searchBar.changed", value: "query" });
    unsub();
  });

  it("keyboard.accessoryItemTapped fires with id field", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("keyboard.accessoryItemTapped", handler);
    simulateEvent("keyboard.accessoryItemTapped", { id: "done" });
    expect(handler).toHaveBeenCalledWith({ type: "keyboard.accessoryItemTapped", id: "done" });
    unsub();
  });

  it("toolbar.menuItemSelected fires with id field", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("toolbar.menuItemSelected", handler);
    simulateEvent("toolbar.menuItemSelected", { id: "sort-name" });
    expect(handler).toHaveBeenCalledWith({ type: "toolbar.menuItemSelected", id: "sort-name" });
    unsub();
  });

  it("sidebarPanel.itemSelected fires with id field", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("sidebarPanel.itemSelected", handler);
    simulateEvent("sidebarPanel.itemSelected", { id: "nav" });
    expect(handler).toHaveBeenCalledWith({ type: "sidebarPanel.itemSelected", id: "nav" });
    unsub();
  });

  it("menuBar.itemSelected fires with id field", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("menuBar.itemSelected", handler);
    simulateEvent("menuBar.itemSelected", { id: "zoom-in" });
    expect(handler).toHaveBeenCalledWith({ type: "menuBar.itemSelected", id: "zoom-in" });
    unsub();
  });
});

// ─── chrome.on — wildcard ────────────────────────────────────────────────────

describe("chrome.on(handler) — wildcard", () => {
  it("fires for every event type", () => {
    const handler = mock(() => {});
    const unsub = chrome.on(handler);
    simulateEvent("titleBar.backTapped", {});
    simulateEvent("navigation.itemSelected", { id: "home" });
    simulateEvent("toolbar.itemTapped", { id: "share" });
    expect(handler).toHaveBeenCalledTimes(3);
    unsub();
  });

  it("returns an unsubscribe that stops the wildcard handler", () => {
    const handler = mock(() => {});
    const unsub = chrome.on(handler);
    simulateEvent("titleBar.backTapped", {});
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    simulateEvent("titleBar.backTapped", {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("receives the full ChromeEvent with type field", () => {
    const handler = mock((event: unknown) => event);
    const unsub = chrome.on(handler);
    simulateEvent("navigation.itemSelected", { id: "inbox" });
    expect(handler).toHaveBeenCalledWith({ type: "navigation.itemSelected", id: "inbox" });
    unsub();
  });

  it("specific and wildcard handlers both fire for the same event", () => {
    const specific = mock(() => {});
    const wildcard = mock(() => {});
    const unsub1 = chrome.on("toolbar.itemTapped", specific);
    const unsub2 = chrome.on(wildcard);
    simulateEvent("toolbar.itemTapped", { id: "share" });
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
    simulateEvent("navigation.itemSelected", { id: "home" });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    unsub1();
    unsub2();
  });
});

// ─── Sheet events ─────────────────────────────────────────────────────────────

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

// ─── Child webview events ─────────────────────────────────────────────────────

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

// ─── safeArea.changed event ───────────────────────────────────────────────────

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

// ─── chrome.messaging ────────────────────────────────────────────────────────

describe("chrome.messaging", () => {
  it("postToParent() sends payload to the parent bridge method", () => {
    chrome.messaging.postToParent({ type: "saved" });
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_messaging_post_to_parent__", {
      type: "saved",
    });
  });

  it("postToChild() sends name and payload to the child bridge method", () => {
    chrome.messaging.postToChild("settings", { refresh: true });
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_messaging_post_to_child__", {
      name: "settings",
      payload: { refresh: true },
    });
  });

  it("broadcast() sends payload to the broadcast bridge method", () => {
    chrome.messaging.broadcast({ event: "theme-changed" });
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_messaging_broadcast__", {
      event: "theme-changed",
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

// ─── chrome.messaging (SharedWorker path) ────────────────────────────────────
// These tests inject a mock MessagePort via _setWorkerPort to exercise the
// SharedWorker code path without a real SharedWorker environment.

describe("chrome.messaging (SharedWorker path)", () => {
  let postMessage: ReturnType<typeof mock>;

  beforeEach(() => {
    postMessage = mock(() => {});
    _setWorkerPort({ postMessage } as unknown as MessagePort);
  });

  afterEach(() => {
    _setWorkerPort(null);
  });

  it("postToParent() posts to the SharedWorker port instead of the native bridge", () => {
    chrome.messaging.postToParent({ type: "saved" });
    expect(postMessage).toHaveBeenCalledWith({
      type: "postToParent",
      from: "main",
      payload: { type: "saved" },
    });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("postToChild() posts to the SharedWorker port with the target name", () => {
    chrome.messaging.postToChild("settings", { refresh: true });
    expect(postMessage).toHaveBeenCalledWith({
      type: "postToChild",
      from: "main",
      to: "settings",
      payload: { refresh: true },
    });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("broadcast() posts to the SharedWorker port", () => {
    chrome.messaging.broadcast({ event: "theme-changed" });
    expect(postMessage).toHaveBeenCalledWith({
      type: "broadcast",
      from: "main",
      payload: { event: "theme-changed" },
    });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("onMessage() uses the SharedWorker port and does not re-register when already connected", () => {
    // connectWorker() returns early (port already set by _setWorkerPort in beforeEach),
    // so no register message is sent — this test guards against double-registration.
    const handler = mock(() => {});
    const unsub = chrome.messaging.onMessage(handler);
    expect(postMessage).not.toHaveBeenCalled();
    // Handler still fires via native event simulation (SharedWorker pushes incoming
    // messages by calling handleIncoming directly in the real worker path).
    simulateEvent("message", { from: "settings", payload: { ok: true } });
    expect(handler).toHaveBeenCalledWith("settings", { ok: true });
    unsub();
  });
});

// ─── Unified ButtonItem across areas ─────────────────────────────────────────

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
    const state = sendCalls[0]![2] as Record<string, unknown>;
    const tb = state["titleBar"] as { trailingItems: unknown[] };
    expect(tb.trailingItems[0]).toEqual(sortButton);
  });

  it("same button can be used in both titleBar and toolbar", () => {
    const btn = button({ id: "share", icon: "square.and.arrow.up" });

    chrome(titleBar({ trailingItems: [btn] }));
    _drainFlush();
    const titleBarState = sendCalls[0]![2] as Record<string, unknown>;
    sendSpy.mockClear();
    sendCalls = [];

    chrome(toolbar({ items: [btn] }));
    _drainFlush();
    const toolbarState = sendCalls[0]![2] as Record<string, unknown>;

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
    const state = sendCalls[0]![2] as Record<string, unknown>;
    const items = (state["toolbar"] as { items: unknown[] }).items;
    expect(items[1]).toEqual({ type: "flexible-space" });
    expect(items[2]).toEqual({ type: "fixed-space", width: 8 });
  });
});
