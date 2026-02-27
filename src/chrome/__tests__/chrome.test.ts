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
}));

beforeEach(() => {
  sendSpy.mockClear();
  sendCalls = [];
});

// ─── Import SUT ──────────────────────────────────────────────────────────────

import { _handleIncoming, chrome } from "../index.ts";

// ─── Helper: simulate an incoming native event ──────────────────────────────

function simulateEvent(event: string, data: unknown): void {
  const msg: BridgeEventMessage = {
    id: null,
    type: "event",
    event,
    data,
  };
  _handleIncoming(msg);
}

// ─── Per-element methods ─────────────────────────────────────────────────────

describe("chrome per-element methods", () => {
  describe("chrome.navigationBar", () => {
    it("sends correct state shape without callbacks", () => {
      chrome.navigationBar({ title: "Hello", hidden: false });
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
        navigationBar: { title: "Hello", hidden: false },
      });
    });

    it("strips onButtonTap callback from state", () => {
      const handler = mock(() => {});
      chrome.navigationBar({
        title: "Test",
        rightButtons: [{ id: "save", title: "Save" }],
        onButtonTap: handler,
      });
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const sentState = sendCalls[0]![2] as Record<string, unknown>;
      const navState = sentState["navigationBar"] as Record<string, unknown>;
      expect(navState).not.toHaveProperty("onButtonTap");
      expect(navState).toHaveProperty("title", "Test");
      expect(navState).toHaveProperty("rightButtons");
    });

    it("strips onBackTap callback from state", () => {
      chrome.navigationBar({
        title: "Test",
        onBackTap: () => {},
      });
      const sentState = sendCalls[0]![2] as Record<string, unknown>;
      const navState = sentState["navigationBar"] as Record<string, unknown>;
      expect(navState).not.toHaveProperty("onBackTap");
      expect(navState).toHaveProperty("title", "Test");
    });

    it("fires inline onButtonTap when event arrives", () => {
      const handler = mock(() => {});
      chrome.navigationBar({
        title: "Test",
        onButtonTap: handler,
      });
      simulateEvent("navigationBar.buttonTapped", { id: "save" });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ id: "save" });
    });

    it("fires inline onBackTap when event arrives", () => {
      const handler = mock(() => {});
      chrome.navigationBar({
        title: "Test",
        onBackTap: handler,
      });
      simulateEvent("navigationBar.backTapped", {});
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("chrome.tabBar", () => {
    it("sends correct state shape and strips onSelect", () => {
      const handler = mock(() => {});
      chrome.tabBar({
        items: [{ id: "home", title: "Home" }],
        onSelect: handler,
      });
      const sentState = sendCalls[0]![2] as Record<string, unknown>;
      const tabState = sentState["tabBar"] as Record<string, unknown>;
      expect(tabState).not.toHaveProperty("onSelect");
      expect(tabState).toHaveProperty("items");
    });

    it("fires inline onSelect when event arrives", () => {
      const handler = mock(() => {});
      chrome.tabBar({
        items: [{ id: "home", title: "Home" }],
        onSelect: handler,
      });
      simulateEvent("tabBar.tabSelected", { id: "home" });
      expect(handler).toHaveBeenCalledWith({ id: "home" });
    });
  });

  describe("chrome.toolbar", () => {
    it("strips onButtonTap and sends state", () => {
      const handler = mock(() => {});
      chrome.toolbar({
        items: [{ type: "button", id: "add", title: "Add" }],
        onButtonTap: handler,
      });
      const sentState = sendCalls[0]![2] as Record<string, unknown>;
      const toolbarState = sentState["toolbar"] as Record<string, unknown>;
      expect(toolbarState).not.toHaveProperty("onButtonTap");
      expect(toolbarState).toHaveProperty("items");
    });
  });

  describe("chrome.searchBar", () => {
    it("strips all three callbacks", () => {
      chrome.searchBar({
        placeholder: "Search...",
        onTextChange: () => {},
        onSubmit: () => {},
        onCancel: () => {},
      });
      const sentState = sendCalls[0]![2] as Record<string, unknown>;
      const searchState = sentState["searchBar"] as Record<string, unknown>;
      expect(searchState).not.toHaveProperty("onTextChange");
      expect(searchState).not.toHaveProperty("onSubmit");
      expect(searchState).not.toHaveProperty("onCancel");
      expect(searchState).toHaveProperty("placeholder", "Search...");
    });

    it("fires onTextChange callback", () => {
      const handler = mock(() => {});
      chrome.searchBar({ onTextChange: handler });
      simulateEvent("searchBar.textChanged", { text: "hello" });
      expect(handler).toHaveBeenCalledWith({ text: "hello" });
    });

    it("fires onSubmit callback", () => {
      const handler = mock(() => {});
      chrome.searchBar({ onSubmit: handler });
      simulateEvent("searchBar.submitted", { text: "search query" });
      expect(handler).toHaveBeenCalledWith({ text: "search query" });
    });

    it("fires onCancel callback", () => {
      const handler = mock(() => {});
      chrome.searchBar({ onCancel: handler });
      simulateEvent("searchBar.cancelled", {});
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("chrome.sheet", () => {
    it("strips onDetentChange and onDismiss", () => {
      chrome.sheet({
        presented: true,
        detents: ["medium", "large"],
        onDetentChange: () => {},
        onDismiss: () => {},
      });
      const sentState = sendCalls[0]![2] as Record<string, unknown>;
      const sheetState = sentState["sheet"] as Record<string, unknown>;
      expect(sheetState).not.toHaveProperty("onDetentChange");
      expect(sheetState).not.toHaveProperty("onDismiss");
      expect(sheetState).toHaveProperty("presented", true);
      expect(sheetState).toHaveProperty("detents");
    });

    it("fires onDetentChange callback", () => {
      const handler = mock(() => {});
      chrome.sheet({ presented: true, onDetentChange: handler });
      simulateEvent("sheet.detentChanged", { detent: "large" });
      expect(handler).toHaveBeenCalledWith({ detent: "large" });
    });

    it("fires onDismiss callback", () => {
      const handler = mock(() => {});
      chrome.sheet({ presented: true, onDismiss: handler });
      simulateEvent("sheet.dismissed", {});
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("chrome.keyboard", () => {
    it("strips onAccessoryItemTap", () => {
      chrome.keyboard({
        inputAccessory: {
          items: [{ type: "button", id: "done", title: "Done" }],
        },
        onAccessoryItemTap: () => {},
      });
      const sentState = sendCalls[0]![2] as Record<string, unknown>;
      const kbState = sentState["keyboard"] as Record<string, unknown>;
      expect(kbState).not.toHaveProperty("onAccessoryItemTap");
      expect(kbState).toHaveProperty("inputAccessory");
    });
  });

  describe("chrome.sidebar", () => {
    it("strips onItemSelect", () => {
      const handler = mock(() => {});
      chrome.sidebar({
        items: [{ id: "nav", title: "Nav" }],
        onItemSelect: handler,
      });
      const sentState = sendCalls[0]![2] as Record<string, unknown>;
      const sidebarState = sentState["sidebar"] as Record<string, unknown>;
      expect(sidebarState).not.toHaveProperty("onItemSelect");
      simulateEvent("sidebar.itemSelected", { id: "nav" });
      expect(handler).toHaveBeenCalledWith({ id: "nav" });
    });
  });

  describe("chrome.menuBar", () => {
    it("strips onItemSelect", () => {
      const handler = mock(() => {});
      chrome.menuBar({
        menus: [{ title: "File", items: [{ id: "save", title: "Save" }] }],
        onItemSelect: handler,
      });
      const sentState = sendCalls[0]![2] as Record<string, unknown>;
      const menuState = sentState["menuBar"] as Record<string, unknown>;
      expect(menuState).not.toHaveProperty("onItemSelect");
      simulateEvent("menuBar.itemSelected", { id: "save" });
      expect(handler).toHaveBeenCalledWith({ id: "save" });
    });
  });
});

// ─── Elements without callbacks ──────────────────────────────────────────────

describe("chrome elements without callbacks", () => {
  it("chrome.statusBar sends state directly", () => {
    chrome.statusBar({ style: "light", hidden: false });
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      statusBar: { style: "light", hidden: false },
    });
  });

  it("chrome.homeIndicator sends state directly", () => {
    chrome.homeIndicator({ hidden: true });
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      homeIndicator: { hidden: true },
    });
  });

  it("chrome.window sends state directly", () => {
    chrome.window({ title: "My App", subtitle: "v1.0" });
    expect(sendSpy).toHaveBeenCalledWith("__chrome__", "__chrome_set_state__", {
      window: { title: "My App", subtitle: "v1.0" },
    });
  });
});

// ─── Replace semantics for inline callbacks ──────────────────────────────────

describe("inline callback replace semantics", () => {
  it("calling the same element method replaces the previous inline callback", () => {
    const handler1 = mock(() => {});
    const handler2 = mock(() => {});

    chrome.tabBar({ items: [], onSelect: handler1 });
    chrome.tabBar({ items: [], onSelect: handler2 });

    simulateEvent("tabBar.tabSelected", { id: "test" });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("passing null callback removes the inline registration", () => {
    const handler = mock(() => {});

    chrome.tabBar({ items: [], onSelect: handler });
    chrome.tabBar({ items: [], onSelect: null });

    simulateEvent("tabBar.tabSelected", { id: "test" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("omitting the callback key does not remove an existing registration", () => {
    const handler = mock(() => {});

    chrome.tabBar({ items: [{ id: "a", title: "A" }], onSelect: handler });
    // Second call omits onSelect — should NOT remove the handler
    chrome.tabBar({ items: [{ id: "b", title: "B" }] });

    simulateEvent("tabBar.tabSelected", { id: "b" });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ─── chrome.set (raw batch mode) ─────────────────────────────────────────────

describe("chrome.set", () => {
  it("sends raw ChromeState without any callback stripping", () => {
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

// ─── chrome.on / chrome.off (stacking escape hatch) ─────────────────────────

describe("chrome.on / chrome.off", () => {
  it("chrome.on registers a stacking listener", () => {
    const handler = mock(() => {});
    chrome.on("tabBar.tabSelected", handler);
    simulateEvent("tabBar.tabSelected", { id: "test" });
    expect(handler).toHaveBeenCalledTimes(1);
    // Clean up
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

  it("inline callback and on() listener both fire for the same event", () => {
    const inlineHandler = mock(() => {});
    const stackHandler = mock(() => {});

    chrome.navigationBar({
      title: "Test",
      onButtonTap: inlineHandler,
    });
    const unsub = chrome.on("navigationBar.buttonTapped", stackHandler);

    simulateEvent("navigationBar.buttonTapped", { id: "both" });

    expect(inlineHandler).toHaveBeenCalledTimes(1);
    expect(stackHandler).toHaveBeenCalledTimes(1);

    unsub();
  });
});
