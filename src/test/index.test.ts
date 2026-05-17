import { afterEach, describe, expect, it } from "bun:test";

if (typeof globalThis.window === "undefined") {
  (globalThis as unknown as Record<string, unknown>).window = globalThis;
}

const { bridge } = await import("../client/index.ts");
const { chrome, titleBar } = await import("../chrome/public.ts");
const { chromeHarness, nativeHarness, nativeTest } = await import("./index.ts");

function parseRequestBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") throw new Error("Expected JSON string request body");
  return JSON.parse(body);
}

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

  it("fails loudly when no handler is registered for a stubbed bridge call", async () => {
    nativeTest.ready();

    await bridge.call("contacts", "pick").catch((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        "No nativeTest bridge handler registered for contacts.pick",
      );
    });
  });

  it("does not let stale cleanups remove replacement handlers", async () => {
    const cleanupFirst = nativeTest.bridge.handle("contacts", "pick", () => ({ name: "Ada" }));
    nativeTest.bridge.handle("contacts", "pick", () => ({ name: "Grace" }));

    cleanupFirst();

    const result = await bridge.call("contacts", "pick");
    expect(result).toEqual({ name: "Grace" });
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
      sessionId: "session-1",
      sessionToken: "secret-token",
      fetch: fetchImpl,
    });

    expect(requests).toHaveLength(1);
    expect((requests[0]![0] as URL).href).toBe("http://127.0.0.1:17321/commands/latest-snapshot");
    expect(parseRequestBody(requests[0]![1]?.body)).toMatchObject({
      protocol: "nativite.test",
      version: 1,
      sessionId: "session-1",
      type: "latest-snapshot",
      token: "secret-token",
      payload: null,
    });
    expect(nativeTest.bridge.calls()).toEqual([]);
  });

  it("routes geometry, screenshot, and native log commands through the authenticated coordinator path", async () => {
    const commands: unknown[] = [];
    const fetchImpl = Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        commands.push(parseRequestBody(init?.body));
        return Response.json({ path: ".nativite/test-artifacts/safe-area.png" });
      },
      { preconnect(): void {} },
    );
    const options = {
      endpoint: "http://127.0.0.1:17321",
      sessionId: "session-1",
      sessionToken: "secret-token",
      fetch: fetchImpl,
    };

    await nativeHarness.geometry("safeArea", options);
    await nativeHarness.screenshot("safe-area", options);
    await nativeHarness.nativeLogs(options);

    expect(commands).toEqual([
      expect.objectContaining({
        type: "geometry",
        token: "secret-token",
        payload: { target: "safeArea" },
      }),
      expect.objectContaining({
        type: "screenshot",
        token: "secret-token",
        payload: { name: "safe-area" },
      }),
      expect.objectContaining({
        type: "native-logs",
        token: "secret-token",
        payload: null,
      }),
    ]);
  });

  it("generates unique request ids for repeated coordinator commands", async () => {
    const commands: unknown[] = [];
    const fetchImpl = Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        commands.push(parseRequestBody(init?.body));
        return Response.json({ path: ".nativite/test-artifacts/safe-area.png" });
      },
      { preconnect(): void {} },
    );
    const options = {
      endpoint: "http://127.0.0.1:17321",
      sessionId: "session-1",
      sessionToken: "secret-token",
      fetch: fetchImpl,
    };

    await Promise.all([
      nativeHarness.screenshot("first", options),
      nativeHarness.screenshot("second", options),
    ]);

    const requestIds = commands.map((command) => {
      if (typeof command !== "object" || command === null) {
        throw new Error("Expected command envelope");
      }
      return (command as { readonly requestId?: unknown }).requestId;
    });
    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).not.toBe(requestIds[1]);
    expect(requestIds.every((requestId) => typeof requestId === "string")).toBe(true);
  });

  it("requires a session token for coordinator-backed commands", async () => {
    try {
      await nativeHarness.latestSnapshot({
        endpoint: "http://127.0.0.1:17321",
        fetch: Object.assign(async (): Promise<Response> => Response.json({}), {
          preconnect(): void {},
        }),
      });
      throw new Error("Expected nativeHarness.latestSnapshot to fail without a session token");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Configure NATIVITE_TEST_SESSION_TOKEN");
    }
  });
});
