import { afterEach, describe, expect, it } from "bun:test";

if (typeof globalThis.window === "undefined") {
  (globalThis as unknown as Record<string, unknown>).window = globalThis;
}

const { bridge } = await import("../client/index.ts");
const { chrome, titleBar } = await import("../chrome/public.ts");
const { chromeHarness, nativeHarness, nativeTest } = await import("./index.ts");

afterEach(() => {
  nativeTest.reset();
});

describe("nativeTest bridge", () => {
  it("mocks bridge calls and records call history", async () => {
    nativeTest.bridge.handle("contacts", "pick", async () => ({ name: "Ada" }));

    const result = await bridge.call("contacts", "pick", { multiple: false });
    expect(result).toEqual({ name: "Ada" });

    expect(nativeTest.bridge.calls()).toEqual([
      { namespace: "contacts", method: "pick", args: { multiple: false } },
    ]);
  });

  it("resets handlers and call history between tests", async () => {
    nativeTest.bridge.handle("contacts", "pick", () => ({ name: "Ada" }));
    await bridge.call("contacts", "pick");

    nativeTest.reset();

    expect(nativeTest.bridge.calls()).toEqual([]);
    await bridge.call("contacts", "pick", undefined, { strict: true }).catch((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Native bridge is not available");
    });
  });

  it("emits legacy native events to bridge subscriptions", async () => {
    const events: unknown[] = [];
    const unsubscribe = bridge.subscribe("contacts.changed", (event) => {
      events.push(event);
    });

    await nativeTest.emit("contacts.changed", { count: 1 });

    unsubscribe();
    expect(events).toEqual([{ count: 1 }]);
  });
});

describe("chromeHarness", () => {
  it("negotiates shell.ready and captures chrome snapshots", async () => {
    nativeTest.ready({ platform: "ios", areas: ["titleBar"] });

    const cleanup = chrome(titleBar({ title: "Inbox" }));
    await Promise.resolve();

    cleanup();
    expect(chrome.supports("titleBar")).toBe(true);
    expect(chrome.supports("navigation")).toBe(false);
    expect(chromeHarness.latestSnapshot()).toMatchObject({
      nativite: 2,
      type: "chrome.snapshot",
      nodes: {
        "titleBar:title": { label: "Inbox" },
      },
    });
  });

  it("emits NCLP chrome events to chrome handlers", async () => {
    const events: unknown[] = [];
    const unsubscribe = chrome.on("titleBar.trailingItemPressed", (event) => {
      events.push(event);
    });

    await nativeTest.emitChromeEvent({
      event: "activate",
      target: "titleBar:trailing:save",
    });

    unsubscribe();
    expect(events).toEqual([{ type: "titleBar.trailingItemPressed", id: "save" }]);
  });

  it("clears captured snapshots without removing bridge handlers", async () => {
    nativeTest.ready({ areas: ["titleBar"] });
    const cleanup = chrome(titleBar({ title: "One" }));
    await Promise.resolve();

    chromeHarness.clearSnapshots();
    nativeTest.bridge.handle("contacts", "pick", () => ({ name: "Grace" }));

    cleanup();
    expect(chromeHarness.snapshots()).toEqual([]);
    const result = await bridge.call("contacts", "pick");
    expect(result).toEqual({ name: "Grace" });
  });
});

describe("nativeHarness", () => {
  it("keeps coordinator-backed commands separate from local stubs", async () => {
    const requests: [RequestInfo | URL, RequestInit | undefined][] = [];
    const fetchImpl = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        requests.push([input, init]);
        return Response.json({ revision: 1, type: "chrome.snapshot", nativite: 2 });
      },
      { preconnect(): void {} },
    );

    await nativeHarness.latestSnapshot({
      endpoint: "http://127.0.0.1:17321",
      fetch: fetchImpl,
    });

    expect(requests).toHaveLength(1);
    expect((requests[0]![0] as URL).href).toBe("http://127.0.0.1:17321/commands/latest-snapshot");
    expect(nativeTest.bridge.calls()).toEqual([]);
  });
});
