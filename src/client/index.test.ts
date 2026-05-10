import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// ─── Mock window + native handler ───────────────────────────────────────────
// Bun's test runner has no DOM. Provide a minimal global `window` and
// simulate window.webkit.messageHandlers.nativite for native transport tests.

if (typeof globalThis.window === "undefined") {
  (globalThis as unknown as Record<string, unknown>).window = globalThis;
}

type NativeMessage = Record<string, unknown>;
let nativeMessages: NativeMessage[] = [];
let replyHandler: ((msg: unknown) => Promise<unknown>) | null = null;

const postMessage = mock((msg: NativeMessage) => {
  nativeMessages.push(msg);
});

const postMessageWithReply = mock((msg: NativeMessage) => {
  nativeMessages.push(msg);
  if (replyHandler) return replyHandler(msg);
  return Promise.resolve({ result: undefined });
});

function installNativeHandler(): void {
  (globalThis as unknown as Record<string, unknown>)["webkit"] = {
    messageHandlers: {
      nativite: { postMessage, postMessageWithReply },
    },
  };
}

function removeNativeHandler(): void {
  delete (globalThis as unknown as Record<string, unknown>)["webkit"];
}

// ─── Import SUT ──────────────────────────────────────────────────────────────
// Use a dynamic import so the client module sees the window shim above during
// module evaluation. Static ESM imports are evaluated before this file's
// top-level setup runs, which breaks nativiteReceive registration in CI.

const { bridge, createBridge, NativiteBridgeError } = await import("./index.ts");

type TestBridgeContracts = {
  camera: {
    methods: {
      capture: {
        params: { readonly quality: number };
        result: { readonly path: string };
      };
      reset: {
        result: { readonly ok: boolean };
      };
    };
    events: {
      "camera.ready": { readonly deviceCount: number };
    };
  };
  location: {
    methods: {
      getCurrentPosition: {
        result: { readonly latitude: number; readonly longitude: number };
      };
    };
    events: {
      "location.updated": { readonly latitude: number; readonly longitude: number };
    };
  };
};

function expectType<TValue>(_value: TValue): void {}

function assertTypedBridgeContracts(): void {
  const typedBridge = createBridge<TestBridgeContracts>();

  expectType<Promise<{ readonly path: string }>>(
    typedBridge.call("camera", "capture", { quality: 0.9 }),
  );
  expectType<Promise<{ readonly ok: boolean }>>(typedBridge.call("camera", "reset"));
  expectType<Promise<{ readonly ok: boolean }>>(
    typedBridge.call("camera", "reset", { strict: true }),
  );
  expectType<Promise<{ readonly ok: boolean }>>(
    typedBridge.call("camera", "reset", undefined, { strict: true }),
  );

  typedBridge.subscribe("location.updated", (payload) => {
    expectType<number>(payload.latitude);
    expectType<number>(payload.longitude);
  });

  // @ts-expect-error rejects unknown namespaces
  void typedBridge.call("storage", "get", { key: "prefs" });
  // @ts-expect-error rejects methods outside the selected namespace
  void typedBridge.call("camera", "getCurrentPosition");
  // @ts-expect-error requires the declared params shape
  void typedBridge.call("camera", "capture", { quality: "high" });
  // @ts-expect-error rejects unknown events
  typedBridge.subscribe("storage.changed", () => {});
}

void assertTypedBridgeContracts;

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  postMessage.mockClear();
  postMessageWithReply.mockClear();
  nativeMessages = [];
  replyHandler = null;
  installNativeHandler();
});

afterEach(() => {
  removeNativeHandler();
});

// ─── bridge.isNative ─────────────────────────────────────────────────────────

describe("bridge.isNative", () => {
  it("returns true when native handler is available", () => {
    expect(bridge.isNative).toBe(true);
  });

  it("returns false when native handler is removed", () => {
    removeNativeHandler();
    expect(bridge.isNative).toBe(false);
  });
});

// ─── bridge.call ─────────────────────────────────────────────────────────────

describe("bridge.call", () => {
  it("calls native via postMessageWithReply", async () => {
    replyHandler = () => Promise.resolve({ result: { photo: "data" } });
    const result = await bridge.call("camera", "capture", { quality: 0.9 });

    expect(postMessageWithReply).toHaveBeenCalledTimes(1);
    const msg = nativeMessages[0]!;
    expect(msg["type"]).toBe("call");
    expect(msg["namespace"]).toBe("camera");
    expect(msg["method"]).toBe("capture");
    expect(msg["args"]).toEqual({ quality: 0.9 });
    expect(result).toEqual({ photo: "data" });
  });

  it("resolves with the result from native reply", async () => {
    replyHandler = () => Promise.resolve({ result: { status: "ok" } });
    const result = await bridge.call("storage", "get", { key: "prefs" });
    expect(result).toEqual({ status: "ok" });
  });

  it("rejects when native returns an error", async () => {
    replyHandler = () => Promise.resolve({ error: "Camera not available" });
    try {
      await bridge.call("camera", "capture");
      throw new Error("Expected promise to reject");
    } catch (err) {
      expect((err as Error).message).toBe("Camera not available");
      expect(err).toBeInstanceOf(NativiteBridgeError);
      expect((err as InstanceType<typeof NativiteBridgeError>).code).toBe("NATIVE_ERROR");
    }
  });

  it("preserves structured native error codes", async () => {
    replyHandler = () =>
      Promise.resolve({
        error: { code: "NATIVE_UNAVAILABLE", message: "Plugin is missing" },
      });

    try {
      await bridge.call("camera", "capture");
      throw new Error("Expected promise to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(NativiteBridgeError);
      expect((err as InstanceType<typeof NativiteBridgeError>).code).toBe("NATIVE_UNAVAILABLE");
      expect((err as Error).message).toBe("Plugin is missing");
    }
  });

  it("passes null args when params not provided", async () => {
    replyHandler = () => Promise.resolve({ result: null });
    await bridge.call("storage", "clear");
    const msg = nativeMessages[0]!;
    expect(msg["args"]).toBeNull();
  });

  it("resolves with undefined in non-native environment", async () => {
    removeNativeHandler();
    const result = await bridge.call("camera", "capture");
    expect(result).toBeUndefined();
    expect(postMessageWithReply).not.toHaveBeenCalled();
  });

  it("rejects in non-native environment when strict mode is enabled", async () => {
    removeNativeHandler();

    try {
      await bridge.call("camera", "capture", undefined, { strict: true });
      throw new Error("Expected promise to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(NativiteBridgeError);
      expect((err as InstanceType<typeof NativiteBridgeError>).code).toBe("NATIVE_UNAVAILABLE");
    }
  });

  it("rejects when a native call times out", async () => {
    replyHandler = () => new Promise(() => {});

    try {
      await bridge.call("camera", "capture", undefined, { timeoutMs: 1 });
      throw new Error("Expected promise to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(NativiteBridgeError);
      expect((err as InstanceType<typeof NativiteBridgeError>).code).toBe("TIMEOUT");
      expect((err as Error).message).toContain("camera.capture");
    }
  });

  it("rejects when a call is aborted before native replies", async () => {
    const controller = new AbortController();
    replyHandler = () => new Promise(() => {});

    const promise = bridge.call("camera", "capture", undefined, {
      signal: controller.signal,
    });
    controller.abort("User cancelled");

    try {
      await promise;
      throw new Error("Expected promise to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(NativiteBridgeError);
      expect((err as InstanceType<typeof NativiteBridgeError>).code).toBe("ABORTED");
      expect((err as Error).message).toBe("User cancelled");
    }
  });

  it("rejects invalid timeout options", async () => {
    for (const timeoutMs of [-1, 0]) {
      try {
        await bridge.call("camera", "capture", undefined, { timeoutMs });
        throw new Error("Expected promise to reject");
      } catch (err) {
        expect(err).toBeInstanceOf(NativiteBridgeError);
        expect((err as InstanceType<typeof NativiteBridgeError>).code).toBe("INVALID_OPTIONS");
      }
    }
  });
});

describe("createBridge", () => {
  it("returns the runtime bridge with typed call and subscribe methods", async () => {
    replyHandler = () => Promise.resolve({ result: { path: "photo.jpg" } });
    const typedBridge = createBridge<TestBridgeContracts>();

    const result = await typedBridge.call("camera", "capture", { quality: 0.9 });

    expect(result).toEqual({ path: "photo.jpg" });
    expect(postMessageWithReply).toHaveBeenCalledTimes(1);
  });

  it("treats a bare options object as options for parameterless typed calls", async () => {
    replyHandler = () => Promise.resolve({ result: { ok: true } });
    const typedBridge = createBridge<TestBridgeContracts>();

    const result = await typedBridge.call("camera", "reset", { strict: true });

    expect(result).toEqual({ ok: true });
    const msg = nativeMessages[0]!;
    expect(msg["namespace"]).toBe("camera");
    expect(msg["method"]).toBe("reset");
    expect(msg["args"]).toBeNull();
  });

  it("keeps the explicit params and options tuple for parameterized typed calls", async () => {
    replyHandler = () => Promise.resolve({ result: { path: "photo.jpg" } });
    const typedBridge = createBridge<TestBridgeContracts>();

    await typedBridge.call("camera", "capture", { quality: 0.9 }, { strict: true });

    const msg = nativeMessages[0]!;
    expect(msg["args"]).toEqual({ quality: 0.9 });
  });

  it("keeps an empty object as params rather than treating it as empty options", async () => {
    replyHandler = () => Promise.resolve({ result: { path: "photo.jpg" } });
    const typedBridge = createBridge<TestBridgeContracts>();

    await (typedBridge.call as typeof bridge.call)("camera", "capture", {});

    const msg = nativeMessages[0]!;
    expect(msg["args"]).toEqual({});
  });
});

// ─── bridge.subscribe ────────────────────────────────────────────────────────

describe("bridge.subscribe", () => {
  /** Simulate native calling evaluateJavaScript("nativiteReceive(...)"). */
  function nativiteReceive(message: { event: string; data: unknown }): void {
    const receive = (globalThis as unknown as Record<string, unknown>)["nativiteReceive"] as (
      msg: unknown,
    ) => void;
    receive(message);
  }

  it("fires handler when matching event arrives via nativiteReceive", () => {
    const handler = mock(() => {});
    const unsub = bridge.subscribe("location:update", handler);

    nativiteReceive({ event: "location:update", data: { lat: 37.7, lng: -122.4 } });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ lat: 37.7, lng: -122.4 });
    unsub();
  });

  it("does not fire for a different event", () => {
    const handler = mock(() => {});
    const unsub = bridge.subscribe("location:update", handler);

    nativiteReceive({ event: "battery:changed", data: { level: 0.5 } });

    expect(handler).not.toHaveBeenCalled();
    unsub();
  });

  it("unsubscribe stops the handler", () => {
    const handler = mock(() => {});
    const unsub = bridge.subscribe("location:update", handler);

    nativiteReceive({ event: "location:update", data: {} });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    nativiteReceive({ event: "location:update", data: {} });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("multiple handlers for the same event all fire", () => {
    const h1 = mock(() => {});
    const h2 = mock(() => {});
    const unsub1 = bridge.subscribe("location:update", h1);
    const unsub2 = bridge.subscribe("location:update", h2);

    nativiteReceive({ event: "location:update", data: {} });

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    unsub1();
    unsub2();
  });

  it("dispatches a CustomEvent on window for chrome module", () => {
    const customEventHandler = mock(() => {});
    window.addEventListener("__nativite_event__", customEventHandler);

    nativiteReceive({ event: "test:event", data: { value: 42 } });

    expect(customEventHandler).toHaveBeenCalledTimes(1);
    window.removeEventListener("__nativite_event__", customEventHandler);
  });
});
