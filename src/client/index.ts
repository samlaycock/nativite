/// <reference lib="dom" />

import type { BridgeCallMessage, NativeToJsMessage } from "../index.ts";

// ─── Native Transport ────────────────────────────────────────────────────────
// Every webview (main and children) has its own webkit message handler registered
// by the native shell. All messaging routes directly through native — no
// SharedWorker or relay needed.

type WebKitHandler = {
  postMessage(msg: unknown): void;
  postMessageWithReply?(msg: unknown): Promise<unknown>;
};

type WebKitWindow = Window & {
  webkit?: { messageHandlers?: { nativite?: WebKitHandler } };
};

function getIOSHandler(): WebKitHandler | undefined {
  return (window as WebKitWindow).webkit?.messageHandlers?.nativite;
}

function isNativeEnvironment(): boolean {
  return typeof window !== "undefined" && getIOSHandler() !== undefined;
}

async function nativeCall(msg: BridgeCallMessage): Promise<unknown> {
  const handler = getIOSHandler();
  if (!handler) throw new Error("Nativite iOS handler not available");
  if (typeof handler.postMessageWithReply !== "function") {
    throw new Error("Nativite iOS handler does not support postMessageWithReply");
  }
  const reply = (await handler.postMessageWithReply(msg)) as {
    result?: unknown;
    error?: string;
  };
  if (reply.error !== undefined) throw new Error(reply.error);
  return reply.result;
}

// ─── Event listeners (bridge.subscribe) ──────────────────────────────────────

const eventListeners = new Map<string, Set<(data: unknown) => void>>();

// ─── Native event receiver ───────────────────────────────────────────────────
// Called by native via evaluateJavaScript("nativiteReceive(...)") on each
// webview. Events are delivered directly by the native shell — it calls
// evaluateJavaScript on every webview that needs the event.

function receive(message: NativeToJsMessage): void {
  // Dispatch locally for bridge.subscribe handlers.
  const listeners = eventListeners.get(message.event);
  if (listeners) {
    for (const listener of listeners) {
      listener(message.data);
    }
  }
  // Dispatch a window-level CustomEvent so same-webview consumers (chrome module)
  // receive events via chrome.on() handlers.
  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("__nativite_event__", {
        detail: { event: message.event, data: message.data },
      }),
    );
  }
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["nativiteReceive"] = receive;
}

// ─── bridge ──────────────────────────────────────────────────────────────────

/**
 * The primary Nativite bridge object.
 *
 * @example
 * const photo = await bridge.call('camera', 'capture', { quality: 0.9 })
 * const unsub = bridge.subscribe('location:update', (coords) => { ... })
 */
export const bridge = {
  /** True when running inside a native shell with an active bridge transport. */
  get isNative(): boolean {
    return isNativeEnvironment();
  },

  /**
   * Call a native plugin method and await the response.
   * Uses postMessageWithReply for synchronous request/response matching
   * at the WKWebView level.
   */
  call(namespace: string, method: string, params?: unknown): Promise<unknown> {
    if (!isNativeEnvironment()) return Promise.resolve(undefined);
    return nativeCall({
      id: null,
      type: "call",
      namespace,
      method,
      args: params ?? null,
    });
  },

  /**
   * Subscribe to a native-push event. Returns an unsubscribe function.
   * Events arrive via nativiteReceive() called by native evaluateJavaScript.
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

// ─── ota ─────────────────────────────────────────────────────────────────────

export const ota = {
  async check(): Promise<{ available: boolean; version?: string }> {
    if (!bridge.isNative) return { available: false };
    const result = await bridge.call("__nativite__", "__ota_check__");
    return result as { available: boolean; version?: string };
  },
} as const;
