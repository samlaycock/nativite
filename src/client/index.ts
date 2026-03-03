/// <reference lib="dom" />

type BridgeCallMessage = {
  id: string | null;
  type: "call";
  namespace: string;
  method: string;
  args: unknown;
};

type NativeToJsMessage = {
  id: null;
  type: "event";
  event: string;
  data: unknown;
};

// ─── Native Transport ────────────────────────────────────────────────────────
// Every webview (main and children) has its own native message handler registered
// by the native shell. All messaging routes directly through native — no
// SharedWorker or relay needed.
//
// iOS: webkit.messageHandlers.nativite.postMessageWithReply()
// Android: WebMessagePort transferred via postMessage("__nativite_port__")

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

// ─── Android WebMessagePort transport ───────────────────────────────────────
// Native transfers a MessagePort to JS via postMessage("__nativite_port__").
// We listen for it and use the port for bidirectional RPC.

let androidPort: MessagePort | null = null;
const pendingAndroidCalls = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (reason: Error) => void }
>();

function setupAndroidPortListener(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.data === "__nativite_port__" && event.ports.length > 0) {
      androidPort = event.ports[0]!;
      androidPort.onmessage = (portEvent: MessageEvent) => {
        const data = portEvent.data;
        if (typeof data !== "string") return;

        try {
          const msg = JSON.parse(data) as Record<string, unknown>;

          // Reply to a pending call
          if (typeof msg["id"] === "string" && pendingAndroidCalls.has(msg["id"])) {
            const id = msg["id"];
            const pending = pendingAndroidCalls.get(id)!;
            pendingAndroidCalls.delete(id);
            const error = msg["error"];
            if (error !== undefined) {
              pending.reject(new Error(typeof error === "string" ? error : JSON.stringify(error)));
            } else {
              pending.resolve(msg["result"]);
            }
            return;
          }

          // Incoming event from native
          if (msg["type"] === "event" && typeof msg["event"] === "string") {
            receive(msg as unknown as NativeToJsMessage);
          }
        } catch {
          // Ignore malformed messages
        }
      };
    }
  });
}

setupAndroidPortListener();

function isAndroidEnvironment(): boolean {
  return androidPort !== null;
}

async function androidCall(msg: BridgeCallMessage): Promise<unknown> {
  if (!androidPort) throw new Error("Nativite Android port not available");

  const id = crypto.randomUUID();
  msg = { ...msg, id };

  return new Promise<unknown>((resolve, reject) => {
    pendingAndroidCalls.set(id, { resolve, reject });
    androidPort!.postMessage(JSON.stringify(msg));
  });
}

// ─── Platform detection ─────────────────────────────────────────────────────

function isNativeEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return getIOSHandler() !== undefined || isAndroidEnvironment();
}

async function nativeCall(msg: BridgeCallMessage): Promise<unknown> {
  // Android: use WebMessagePort
  if (isAndroidEnvironment()) {
    return androidCall(msg);
  }

  // iOS: use postMessageWithReply
  const handler = getIOSHandler();
  if (!handler) throw new Error("Nativite native handler not available");
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
// On Android, events may also arrive through the WebMessagePort.

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
   * iOS: Uses postMessageWithReply for synchronous request/response matching.
   * Android: Uses WebMessagePort with id-correlated replies.
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
   * Events arrive via nativiteReceive() called by native evaluateJavaScript,
   * or via the WebMessagePort on Android.
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
