/// <reference lib="dom" />

import type { BridgeCallMessage, NativeToJsMessage } from "../index.ts";

// ─── Transport interface ──────────────────────────────────────────────────────

/**
 * Abstraction over the platform-specific message channel between JS and native.
 * Each platform implements send() (fire-and-forget) and call() (async reply).
 */
interface BridgeTransport {
  /** Fire-and-forget — posts a message with no expectation of a reply. */
  send(msg: BridgeCallMessage): void;
  /** RPC call — returns a Promise that resolves/rejects with the native reply. */
  call(msg: BridgeCallMessage): Promise<unknown>;
  /** True when a native environment is detected and the transport is active. */
  readonly isNative: boolean;
}

// ─── iOS Transport (WKScriptMessageHandlerWithReply) ─────────────────────────
// Uses window.webkit.messageHandlers.nativite.postMessage() for fire-and-forget
// and window.webkit.messageHandlers.nativite.postMessageWithReply() for async
// RPC. Swift calls replyHandler() directly — no legacy fallback path.

type WebKitHandler = {
  postMessage(msg: unknown): void;
  postMessageWithReply?(msg: unknown): Promise<unknown>;
};

type WebKitWindow = Window & {
  webkit?: {
    messageHandlers?: {
      nativite?: WebKitHandler;
    };
  };
};

function getIOSHandler(): WebKitHandler | undefined {
  return (window as WebKitWindow).webkit?.messageHandlers?.nativite;
}

class IOSTransport implements BridgeTransport {
  readonly isNative = true;

  send(msg: BridgeCallMessage): void {
    getIOSHandler()?.postMessage(msg);
  }

  call(msg: BridgeCallMessage): Promise<unknown> {
    const handler = getIOSHandler();
    if (!handler) {
      return Promise.reject(new Error("Nativite iOS handler not available"));
    }

    // postMessageWithReply is available in WKWebView when the Swift side
    // registers via addScriptMessageHandler(_:contentWorld:name:) with
    // WKScriptMessageHandlerWithReply conformance.
    if (typeof handler.postMessageWithReply !== "function") {
      return Promise.reject(
        new Error("Nativite iOS handler does not support postMessageWithReply"),
      );
    }

    return handler.postMessageWithReply(msg).then((reply) => {
      // Swift replyHandler sends { result } on success, { error } on failure
      const r = reply as { result?: unknown; error?: string };
      if (r.error !== undefined) throw new Error(r.error);
      return r.result;
    });
  }
}

// ─── Web Transport (browser no-op) ───────────────────────────────────────────
// In a browser, all calls resolve with undefined so plugin code works without
// platform conditionals.

class WebTransport implements BridgeTransport {
  readonly isNative = false;
  send(_msg: BridgeCallMessage): void {
    // no-op
  }
  call(_msg: BridgeCallMessage): Promise<unknown> {
    return Promise.resolve(undefined);
  }
}

// ─── Transport selection ──────────────────────────────────────────────────────

function createTransport(): BridgeTransport {
  if (typeof window !== "undefined" && getIOSHandler()) return new IOSTransport();
  return new WebTransport();
}

const transport: BridgeTransport = createTransport();

// ─── Call ID generator ────────────────────────────────────────────────────────

let callIdCounter = 0;

function generateId(): string {
  return `nk_${(++callIdCounter).toString()}_${Date.now().toString()}`;
}

// ─── Event listeners ──────────────────────────────────────────────────────────

const eventListeners = new Map<string, Set<(data: unknown) => void>>();

// ─── Additional message handlers ─────────────────────────────────────────────
// Other modules (e.g. nativite/chrome) can register handlers here rather than
// monkey-patching window.nativiteReceive. All handlers receive every message.

const messageHandlers: ((msg: NativeToJsMessage) => void)[] = [];

/**
 * Register a handler to receive every incoming native message.
 * Used internally by nativite/chrome; not part of the public API.
 * @internal
 */
export function _registerReceiveHandler(handler: (msg: NativeToJsMessage) => void): void {
  messageHandlers.push(handler);
}

// ─── Message receiver — called by Swift via evaluateJavaScript ────────────────
// window.nativiteReceive(message) handles native-push events.

function receive(message: NativeToJsMessage): void {
  const listeners = eventListeners.get(message.event);
  if (listeners) {
    for (const listener of listeners) {
      listener(message.data);
    }
  }

  // Fan out to registered module handlers (e.g. chrome event routing)
  for (const handler of messageHandlers) {
    handler(message);
  }
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["nativiteReceive"] = receive;
}

// ─── bridge ───────────────────────────────────────────────────────────────────

/**
 * The primary Nativite bridge object.
 *
 * @example
 * // Call a plugin method
 * const photo = await bridge.call('camera', 'capture', { quality: 0.9 })
 *
 * // Subscribe to a streaming event
 * const unsub = bridge.subscribe('location:update', (coords) => { ... })
 * unsub()
 */
export const bridge = {
  /** True when running inside a native shell with an active bridge transport. */
  get isNative(): boolean {
    return transport.isNative;
  },

  /**
   * Call a native plugin method and await the response.
   *
   * @param namespace - Plugin namespace, e.g. "camera", "__nativite__"
   * @param method    - Method name within that namespace
   * @param params    - Optional arguments passed to the native handler
   */
  call(namespace: string, method: string, params?: unknown): Promise<unknown> {
    const msg: BridgeCallMessage = {
      id: generateId(),
      type: "call",
      namespace,
      method,
      args: params ?? null,
    };
    return transport.call(msg);
  },

  /**
   * Subscribe to a native-push event (e.g. location updates, sensor data).
   * Returns an unsubscribe function.
   */
  subscribe(event: string, handler: (data: unknown) => void): () => void {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    eventListeners.get(event)!.add(handler);
    return () => {
      eventListeners.get(event)?.delete(handler);
    };
  },
} as const;

// ─── Internal fire-and-forget send ───────────────────────────────────────────
// Used by nativite/chrome to push state without awaiting a reply.
// Exported as a plain function rather than a bridge method so it does not
// appear on the public `bridge` object that plugin authors interact with.

/** @internal */
export function _bridgeSend(namespace: string, method: string, args: unknown): void {
  transport.send({
    id: null,
    type: "call",
    namespace,
    method,
    args,
  });
}

// ─── ota ──────────────────────────────────────────────────────────────────────

/**
 * Over-the-air update helpers. Requires `updates.url` in `nativite.config.ts`.
 *
 * @example
 * import { ota } from "nativite/client"
 * const { available, version } = await ota.check()
 * if (available) window.location.reload()
 */
export const ota = {
  /**
   * Check whether a newer bundle is available on the OTA server.
   * Always returns `{ available: false }` in a non-native context.
   */
  async check(): Promise<{ available: boolean; version?: string }> {
    if (!bridge.isNative) return { available: false };
    const result = await bridge.call("__nativite__", "__ota_check__");
    return result as { available: boolean; version?: string };
  },
} as const;
