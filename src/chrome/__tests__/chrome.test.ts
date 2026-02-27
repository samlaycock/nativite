import { beforeEach, describe, expect, it, mock } from "bun:test";

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
    callBinary: mock(() => Promise.reject(new Error("not implemented"))),
  },
  _bridgeSend: sendSpy,
  _registerReceiveHandler: () => {},
}));

// ─── Import SUT ──────────────────────────────────────────────────────────────

import { _handleIncoming, _resetChromeState, chrome } from "../index.ts";

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  sendSpy.mockClear();
  sendCalls = [];
  _resetChromeState();
  if (typeof window !== "undefined") {
    delete (window as Window & { nativiteSheet?: unknown }).nativiteSheet;
  }
});

// ─── Helper: simulate an incoming native event ────────────────────────────────

function simulateEvent(event: string, data: unknown): void {
  const msg: BridgeEventMessage = {
    id: null,
    type: "event",
    event,
    data,
  };
  _handleIncoming(msg);
}

// ─── navigationBar ───────────────────────────────────────────────────────────

describe("chrome.navigationBar", () => {
  it("show() sends hidden: false", () => {
    chrome.navigationBar.show();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      navigationBar: { hidden: false },
    });
  });

  it("hide() sends hidden: true", () => {
    chrome.navigationBar.hide();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      navigationBar: { hidden: true },
    });
  });

  it("setTitle() sends title key", () => {
    chrome.navigationBar.setTitle("Settings");
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      navigationBar: { title: "Settings" },
    });
  });

  it("setToolbarLeft() sends toolbarLeft key", () => {
    const items: Parameters<typeof chrome.navigationBar.setToolbarLeft>[0] = [
      { type: "button", id: "back", title: "Back" },
    ];
    chrome.navigationBar.setToolbarLeft(items);
    expect(sendCalls[0]![2]).toMatchObject({ navigationBar: { toolbarLeft: items } });
  });

  it("setToolbarRight() sends toolbarRight key", () => {
    const items: Parameters<typeof chrome.navigationBar.setToolbarRight>[0] = [
      { type: "button", id: "save", title: "Save", style: "done" },
    ];
    chrome.navigationBar.setToolbarRight(items);
    expect(sendCalls[0]![2]).toMatchObject({ navigationBar: { toolbarRight: items } });
  });

  it("configure() sends only the provided appearance keys", () => {
    chrome.navigationBar.configure({ tintColor: "#FF0000", translucent: false });
    expect(sendCalls[0]![2]).toMatchObject({
      navigationBar: { tintColor: "#FF0000", translucent: false },
    });
  });

  it("merges state across multiple calls", () => {
    chrome.navigationBar.setTitle("Hello");
    chrome.navigationBar.setToolbarRight([{ type: "button", id: "save", title: "Save" }]);
    const lastArgs = sendCalls[1]![2] as Record<string, unknown>;
    const navBar = lastArgs["navigationBar"] as Record<string, unknown>;
    expect(navBar).toHaveProperty("title", "Hello");
    expect(navBar).toHaveProperty("toolbarRight");
  });

  it("onButtonTap fires handler when event arrives", () => {
    const handler = mock(() => {});
    chrome.navigationBar.onButtonTap(handler);
    simulateEvent("navigationBar.buttonTapped", { id: "save" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: "save" });
  });

  it("onBackTap fires handler when event arrives", () => {
    const handler = mock(() => {});
    chrome.navigationBar.onBackTap(handler);
    simulateEvent("navigationBar.backTapped", {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("onButtonTap returns an unsubscribe function that stops the handler", () => {
    const handler = mock(() => {});
    const unsub = chrome.navigationBar.onButtonTap(handler);
    simulateEvent("navigationBar.buttonTapped", { id: "save" });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    simulateEvent("navigationBar.buttonTapped", { id: "save" });
    expect(handler).toHaveBeenCalledTimes(1); // not called again
  });

  it("multiple onButtonTap subscribers all fire", () => {
    const handler1 = mock(() => {});
    const handler2 = mock(() => {});
    const unsub1 = chrome.navigationBar.onButtonTap(handler1);
    const unsub2 = chrome.navigationBar.onButtonTap(handler2);

    simulateEvent("navigationBar.buttonTapped", { id: "save" });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });
});

// ─── tabBar ───────────────────────────────────────────────────────────────────

describe("chrome.tabBar", () => {
  it("show() sends hidden: false", () => {
    chrome.tabBar.show();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      tabBar: { hidden: false },
    });
  });

  it("hide() sends hidden: true", () => {
    chrome.tabBar.hide();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      tabBar: { hidden: true },
    });
  });

  it("setTabs() sends items key", () => {
    const tabs = [
      { id: "home", title: "Home" },
      { id: "profile", title: "Profile" },
    ];
    chrome.tabBar.setTabs(tabs);
    expect(sendCalls[0]![2]).toMatchObject({ tabBar: { items: tabs } });
  });

  it("setActiveTab() sends selectedTabId key", () => {
    chrome.tabBar.setActiveTab("profile");
    expect(sendCalls[0]![2]).toMatchObject({ tabBar: { selectedTabId: "profile" } });
  });

  it("configure() sends appearance keys", () => {
    chrome.tabBar.configure({ tintColor: "#0066CC", translucent: true });
    expect(sendCalls[0]![2]).toMatchObject({
      tabBar: { tintColor: "#0066CC", translucent: true },
    });
  });

  it("onSelect fires handler and unsubscribe stops it", () => {
    const handler = mock(() => {});
    const unsub = chrome.tabBar.onSelect(handler);

    simulateEvent("tabBar.tabSelected", { id: "home" });
    expect(handler).toHaveBeenCalledWith({ id: "home" });

    unsub();
    simulateEvent("tabBar.tabSelected", { id: "profile" });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ─── toolbar ─────────────────────────────────────────────────────────────────

describe("chrome.toolbar", () => {
  it("show() sends hidden: false", () => {
    chrome.toolbar.show();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      toolbar: { hidden: false },
    });
  });

  it("setItems() sends items key", () => {
    const items: Parameters<typeof chrome.toolbar.setItems>[0] = [
      { type: "flexibleSpace" },
      { type: "button", id: "share", title: "Share" },
    ];
    chrome.toolbar.setItems(items);
    expect(sendCalls[0]![2]).toMatchObject({ toolbar: { items } });
  });

  it("configure() sends appearance keys", () => {
    chrome.toolbar.configure({ barTintColor: "#F0F0F0" });
    expect(sendCalls[0]![2]).toMatchObject({ toolbar: { barTintColor: "#F0F0F0" } });
  });

  it("onButtonTap fires handler and unsubscribe stops it", () => {
    const handler = mock(() => {});
    const unsub = chrome.toolbar.onButtonTap(handler);

    simulateEvent("toolbar.buttonTapped", { id: "share" });
    expect(handler).toHaveBeenCalledWith({ id: "share" });

    unsub();
    simulateEvent("toolbar.buttonTapped", { id: "share" });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ─── statusBar ────────────────────────────────────────────────────────────────

describe("chrome.statusBar", () => {
  it("show() sends hidden: false", () => {
    chrome.statusBar.show();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      statusBar: { hidden: false },
    });
  });

  it("hide() sends hidden: true", () => {
    chrome.statusBar.hide();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      statusBar: { hidden: true },
    });
  });

  it("setStyle() sends style key", () => {
    chrome.statusBar.setStyle("light");
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      statusBar: { style: "light" },
    });
  });
});

// ─── homeIndicator ────────────────────────────────────────────────────────────

describe("chrome.homeIndicator", () => {
  it("show() sends hidden: false", () => {
    chrome.homeIndicator.show();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      homeIndicator: { hidden: false },
    });
  });

  it("hide() sends hidden: true", () => {
    chrome.homeIndicator.hide();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      homeIndicator: { hidden: true },
    });
  });
});

// ─── searchBar ────────────────────────────────────────────────────────────────

describe("chrome.searchBar", () => {
  it("setText() sends text key", () => {
    chrome.searchBar.setText("query");
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      searchBar: { text: "query" },
    });
  });

  it("setPlaceholder() sends placeholder key", () => {
    chrome.searchBar.setPlaceholder("Search...");
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      searchBar: { placeholder: "Search..." },
    });
  });

  it("configure() sends appearance keys", () => {
    chrome.searchBar.configure({ showsCancelButton: true });
    expect(sendCalls[0]![2]).toMatchObject({ searchBar: { showsCancelButton: true } });
  });

  it("onTextChange fires handler and unsubscribe stops it", () => {
    const handler = mock(() => {});
    const unsub = chrome.searchBar.onTextChange(handler);
    simulateEvent("searchBar.textChanged", { text: "hello" });
    expect(handler).toHaveBeenCalledWith({ text: "hello" });
    unsub();
    simulateEvent("searchBar.textChanged", { text: "world" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("onSubmit fires handler", () => {
    const handler = mock(() => {});
    const unsub = chrome.searchBar.onSubmit(handler);
    simulateEvent("searchBar.submitted", { text: "search query" });
    expect(handler).toHaveBeenCalledWith({ text: "search query" });
    unsub();
  });

  it("onCancel fires handler", () => {
    const handler = mock(() => {});
    const unsub = chrome.searchBar.onCancel(handler);
    simulateEvent("searchBar.cancelled", {});
    expect(handler).toHaveBeenCalledTimes(1);
    unsub();
  });
});

// ─── sheet ────────────────────────────────────────────────────────────────────

describe("chrome.sheet", () => {
  it("present() sends presented: true", () => {
    chrome.sheet.present();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      sheet: { presented: true },
    });
  });

  it("dismiss() sends presented: false", () => {
    chrome.sheet.dismiss();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      sheet: { presented: false },
    });
  });

  it("setDetents() sends detents key", () => {
    chrome.sheet.setDetents(["small", "medium", "large"]);
    expect(sendCalls[0]![2]).toMatchObject({ sheet: { detents: ["small", "medium", "large"] } });
  });

  it("setSelectedDetent() sends selectedDetent key", () => {
    chrome.sheet.setSelectedDetent("large");
    expect(sendCalls[0]![2]).toMatchObject({ sheet: { selectedDetent: "large" } });
  });

  it("configure() sends appearance keys", () => {
    chrome.sheet.configure({ grabberVisible: true, cornerRadius: 16 });
    expect(sendCalls[0]![2]).toMatchObject({
      sheet: { grabberVisible: true, cornerRadius: 16 },
    });
  });

  it("setURL() sends url key", () => {
    chrome.sheet.setURL("./sheet/index.html");
    expect(sendCalls[0]![2]).toMatchObject({ sheet: { url: "./sheet/index.html" } });
  });

  it("postMessage() sends a fire-and-forget sheet message bridge call", () => {
    const message = { type: "ping", value: 1 };
    chrome.sheet.postMessage(message);
    expect(sendSpy).toHaveBeenCalledWith(
      "__chrome__",
      "__chrome_sheet_post_message_to_sheet__",
      message,
    );
  });

  it("postMessage() routes to nativiteSheet when called inside sheet context", () => {
    const sheetPostSpy = mock((_message: unknown) => {});
    const globalObject = globalThis as typeof globalThis & {
      window?: Window & { nativiteSheet?: { postMessage: (message: unknown) => void } };
    };
    const previousWindow = globalObject.window;
    const nextWindow = (previousWindow ?? ({} as Window)) as Window & {
      nativiteSheet?: { postMessage: (message: unknown) => void };
    };
    nextWindow.nativiteSheet = {
      postMessage: sheetPostSpy,
    };
    globalObject.window = nextWindow;

    const message = { type: "from-sheet", value: 2 };
    chrome.sheet.postMessage(message);

    expect(sheetPostSpy).toHaveBeenCalledWith(message);
    expect(sendSpy).not.toHaveBeenCalled();

    if (previousWindow === undefined) {
      delete globalObject.window;
    } else {
      globalObject.window = previousWindow;
    }
  });

  it("onDetentChange fires handler and unsubscribe stops it", () => {
    const handler = mock(() => {});
    const unsub = chrome.sheet.onDetentChange(handler);
    simulateEvent("sheet.detentChanged", { detent: "large" });
    expect(handler).toHaveBeenCalledWith({ detent: "large" });
    unsub();
    simulateEvent("sheet.detentChanged", { detent: "medium" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("onDismiss fires handler", () => {
    const handler = mock(() => {});
    const unsub = chrome.sheet.onDismiss(handler);
    simulateEvent("sheet.dismissed", {});
    expect(handler).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("onMessage fires handler and unsubscribe stops it", () => {
    const handler = mock(() => {});
    const unsub = chrome.sheet.onMessage(handler);
    const message = { type: "pong", value: 2 };
    simulateEvent("sheet.message", { message });
    expect(handler).toHaveBeenCalledWith({ message });
    unsub();
    simulateEvent("sheet.message", { message: { type: "ignored" } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("onLoadFailed fires handler and unsubscribe stops it", () => {
    const handler = mock(() => {});
    const unsub = chrome.sheet.onLoadFailed(handler);
    simulateEvent("sheet.loadFailed", {
      message: "Load failed",
      code: -1002,
      domain: "NSURLErrorDomain",
      url: "http://localhost:5173/sheet",
    });
    expect(handler).toHaveBeenCalledWith({
      message: "Load failed",
      code: -1002,
      domain: "NSURLErrorDomain",
      url: "http://localhost:5173/sheet",
    });
    unsub();
    simulateEvent("sheet.loadFailed", {
      message: "ignored",
      code: -1,
      domain: "NSURLErrorDomain",
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ─── keyboard ────────────────────────────────────────────────────────────────

describe("chrome.keyboard", () => {
  it("setAccessory() sends inputAccessory key", () => {
    const accessory = { items: [{ type: "button" as const, id: "done", title: "Done" }] };
    chrome.keyboard.setAccessory(accessory);
    expect(sendCalls[0]![2]).toMatchObject({ keyboard: { inputAccessory: accessory } });
  });

  it("setAccessory(null) sends inputAccessory: null", () => {
    chrome.keyboard.setAccessory(null);
    expect(sendCalls[0]![2]).toMatchObject({ keyboard: { inputAccessory: null } });
  });

  it("configure() sends dismissMode", () => {
    chrome.keyboard.configure({ dismissMode: "interactive" });
    expect(sendCalls[0]![2]).toMatchObject({ keyboard: { dismissMode: "interactive" } });
  });

  it("onAccessoryItemTap fires handler and unsubscribe stops it", () => {
    const handler = mock(() => {});
    const unsub = chrome.keyboard.onAccessoryItemTap(handler);
    simulateEvent("keyboard.accessory.itemTapped", { id: "done" });
    expect(handler).toHaveBeenCalledWith({ id: "done" });
    unsub();
    simulateEvent("keyboard.accessory.itemTapped", { id: "done" });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ─── sidebar ─────────────────────────────────────────────────────────────────

describe("chrome.sidebar", () => {
  it("show() sends visible: true", () => {
    chrome.sidebar.show();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      sidebar: { visible: true },
    });
  });

  it("hide() sends visible: false", () => {
    chrome.sidebar.hide();
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      sidebar: { visible: false },
    });
  });

  it("setItems() sends items key", () => {
    const items = [{ id: "nav", title: "Nav" }];
    chrome.sidebar.setItems(items);
    expect(sendCalls[0]![2]).toMatchObject({ sidebar: { items } });
  });

  it("setActiveItem() sends selectedItemId key", () => {
    chrome.sidebar.setActiveItem("nav");
    expect(sendCalls[0]![2]).toMatchObject({ sidebar: { selectedItemId: "nav" } });
  });

  it("onItemSelect fires handler and unsubscribe stops it", () => {
    const handler = mock(() => {});
    const unsub = chrome.sidebar.onItemSelect(handler);
    simulateEvent("sidebar.itemSelected", { id: "nav" });
    expect(handler).toHaveBeenCalledWith({ id: "nav" });
    unsub();
    simulateEvent("sidebar.itemSelected", { id: "nav" });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ─── window ──────────────────────────────────────────────────────────────────

describe("chrome.window", () => {
  it("setTitle() sends title key", () => {
    chrome.window.setTitle("My App");
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      window: { title: "My App" },
    });
  });

  it("setSubtitle() sends subtitle key", () => {
    chrome.window.setSubtitle("v1.0");
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      window: { subtitle: "v1.0" },
    });
  });

  it("configure() sends appearance keys", () => {
    chrome.window.configure({ titleHidden: true, fullSizeContent: true });
    expect(sendCalls[0]![2]).toMatchObject({
      window: { titleHidden: true, fullSizeContent: true },
    });
  });
});

// ─── menuBar ─────────────────────────────────────────────────────────────────

describe("chrome.menuBar", () => {
  it("setMenus() sends menus key", () => {
    const menus = [{ title: "File", items: [{ id: "save", title: "Save" }] }];
    chrome.menuBar.setMenus(menus);
    expect(sendCalls[0]![2]).toMatchObject({ menuBar: { menus } });
  });

  it("onItemSelect fires handler and unsubscribe stops it", () => {
    const handler = mock(() => {});
    const unsub = chrome.menuBar.onItemSelect(handler);
    simulateEvent("menuBar.itemSelected", { id: "save" });
    expect(handler).toHaveBeenCalledWith({ id: "save" });
    unsub();
    simulateEvent("menuBar.itemSelected", { id: "save" });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ─── chrome.set (raw batch mode) ─────────────────────────────────────────────

describe("chrome.set", () => {
  it("sends raw ChromeState without merging with held state", () => {
    chrome.set({
      statusBar: { style: "dark" },
      navigationBar: { title: "Batch" },
      homeIndicator: { hidden: true },
    });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      statusBar: { style: "dark" },
      navigationBar: { title: "Batch" },
      homeIndicator: { hidden: true },
    });
  });
});

// ─── chrome.on / chrome.off ───────────────────────────────────────────────────

describe("chrome.on / chrome.off", () => {
  it("chrome.on registers a listener", () => {
    const handler = mock(() => {});
    chrome.on("tabBar.tabSelected", handler);
    simulateEvent("tabBar.tabSelected", { id: "test" });
    expect(handler).toHaveBeenCalledTimes(1);
    chrome.off("tabBar.tabSelected", handler);
  });

  it("chrome.on returns an unsubscribe function", () => {
    const handler = mock(() => {});
    const unsub = chrome.on("tabBar.tabSelected", handler);

    simulateEvent("tabBar.tabSelected", { id: "test" });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    simulateEvent("tabBar.tabSelected", { id: "test2" });
    expect(handler).toHaveBeenCalledTimes(1); // not called again
  });

  it("multiple on() handlers for the same event all fire", () => {
    const handler1 = mock(() => {});
    const handler2 = mock(() => {});
    const unsub1 = chrome.on("navigationBar.buttonTapped", handler1);
    const unsub2 = chrome.on("navigationBar.buttonTapped", handler2);

    simulateEvent("navigationBar.buttonTapped", { id: "test" });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it("chrome.on and on* methods both fire for the same event", () => {
    const namedHandler = mock(() => {});
    const globalHandler = mock(() => {});

    const unsub1 = chrome.navigationBar.onButtonTap(namedHandler);
    const unsub2 = chrome.on("navigationBar.buttonTapped", globalHandler);

    simulateEvent("navigationBar.buttonTapped", { id: "both" });

    expect(namedHandler).toHaveBeenCalledTimes(1);
    expect(globalHandler).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });
});
