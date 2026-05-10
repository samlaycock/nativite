/// <reference lib="dom" />

export type BridgeErrorCode =
  | "NATIVE_UNAVAILABLE"
  | "NATIVE_ERROR"
  | "TIMEOUT"
  | "ABORTED"
  | "INVALID_OPTIONS";

export interface BridgeCallOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly strict?: boolean;
}

interface BridgeCallMessage {
  readonly id: string | null;
  readonly type: "call";
  readonly namespace: string;
  readonly method: string;
  readonly args: unknown;
}

interface NativeReply {
  readonly result?: unknown;
  readonly error?: unknown;
}

interface PendingAndroidCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
}

export class NativiteBridgeError extends Error {
  readonly code: BridgeErrorCode;

  constructor(code: BridgeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NativiteBridgeError";
    this.code = code;
  }
}

type NativeToJsMessage = {
  readonly id?: null;
  readonly type?: "event";
  readonly event: string;
  readonly data: unknown;
};

type NativeChromeMessage = {
  readonly nativite: 2;
  readonly type: "chrome.event";
  readonly event: string;
  readonly target: string;
  readonly value?: unknown;
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
const pendingAndroidCalls = new Map<string, PendingAndroidCall>();

function createBridgeError(
  code: BridgeErrorCode,
  message: string,
  cause?: unknown,
): NativiteBridgeError {
  return new NativiteBridgeError(code, message, { cause });
}

function normalizeNativeError(error: unknown): NativiteBridgeError {
  if (error instanceof NativiteBridgeError) return error;
  if (typeof error === "string") return createBridgeError("NATIVE_ERROR", error);
  if (error instanceof Error) {
    return createBridgeError("NATIVE_ERROR", error.message, error);
  }
  if (typeof error === "object" && error !== null) {
    const candidate = error as { readonly code?: unknown; readonly message?: unknown };
    if (typeof candidate.message === "string") {
      const code = typeof candidate.code === "string" ? candidate.code : "NATIVE_ERROR";
      return createBridgeError(
        isBridgeErrorCode(code) ? code : "NATIVE_ERROR",
        candidate.message,
        error,
      );
    }
  }
  return createBridgeError("NATIVE_ERROR", "Native bridge call failed", error);
}

function isBridgeErrorCode(code: string): code is BridgeErrorCode {
  return (
    code === "NATIVE_UNAVAILABLE" ||
    code === "NATIVE_ERROR" ||
    code === "TIMEOUT" ||
    code === "ABORTED" ||
    code === "INVALID_OPTIONS"
  );
}

function getAbortReason(signal: AbortSignal): string {
  const { reason } = signal;
  if (reason instanceof Error && reason.message !== "") return reason.message;
  if (typeof reason === "string" && reason !== "") return reason;
  return "Native bridge call was aborted";
}

function validateCallOptions(options?: BridgeCallOptions): void {
  if (options?.timeoutMs === undefined) return;
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0) {
    throw createBridgeError(
      "INVALID_OPTIONS",
      "bridge.call timeoutMs must be a non-negative finite number",
    );
  }
}

function withCallGuards<T>(
  operation: Promise<T>,
  message: BridgeCallMessage,
  options?: BridgeCallOptions,
  onCancel?: () => void,
): Promise<T> {
  validateCallOptions(options);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timeout !== undefined) clearTimeout(timeout);
      options?.signal?.removeEventListener("abort", onAbort);
    };

    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const cancel = (error: NativiteBridgeError): void => {
      onCancel?.();
      settle(() => reject(error));
    };

    const onAbort = (): void => {
      cancel(createBridgeError("ABORTED", getAbortReason(options!.signal!)));
    };

    if (options?.signal?.aborted === true) {
      onAbort();
      return;
    }

    options?.signal?.addEventListener("abort", onAbort, { once: true });

    if (options?.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        cancel(
          createBridgeError(
            "TIMEOUT",
            `Native bridge call ${message.namespace}.${message.method} timed out after ${options.timeoutMs}ms`,
          ),
        );
      }, options.timeoutMs);
    }

    operation.then(
      (value) => {
        settle(() => resolve(value));
      },
      (error: unknown) => {
        settle(() => reject(normalizeNativeError(error)));
      },
    );
  });
}

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
              pending.reject(normalizeNativeError(error));
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

async function androidCall(msg: BridgeCallMessage, options?: BridgeCallOptions): Promise<unknown> {
  if (!androidPort) {
    throw createBridgeError("NATIVE_UNAVAILABLE", "Nativite Android port not available");
  }

  const id = crypto.randomUUID();
  msg = { ...msg, id };

  const operation = new Promise<unknown>((resolve, reject) => {
    pendingAndroidCalls.set(id, { resolve, reject });
    androidPort!.postMessage(JSON.stringify(msg));
  });

  return withCallGuards(operation, msg, options, () => {
    pendingAndroidCalls.delete(id);
  });
}

// ─── Platform detection ─────────────────────────────────────────────────────

function isNativeEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return getIOSHandler() !== undefined || isAndroidEnvironment();
}

async function nativeCall(msg: BridgeCallMessage, options?: BridgeCallOptions): Promise<unknown> {
  // Android: use WebMessagePort
  if (isAndroidEnvironment()) {
    return androidCall(msg, options);
  }

  // iOS: use postMessageWithReply
  const handler = getIOSHandler();
  if (!handler) {
    throw createBridgeError("NATIVE_UNAVAILABLE", "Nativite native handler not available");
  }
  if (typeof handler.postMessageWithReply !== "function") {
    throw createBridgeError(
      "NATIVE_UNAVAILABLE",
      "Nativite iOS handler does not support postMessageWithReply",
    );
  }
  const operation = handler.postMessageWithReply(msg).then((reply) => {
    const nativeReply = reply as NativeReply;
    if (nativeReply.error !== undefined) throw normalizeNativeError(nativeReply.error);
    return nativeReply.result;
  });
  return withCallGuards(operation, msg, options);
}

// ─── Event listeners (bridge.subscribe) ──────────────────────────────────────

const eventListeners = new Map<string, Set<(data: unknown) => void>>();

// ─── Native event receiver ───────────────────────────────────────────────────
// Called by native via evaluateJavaScript("nativiteReceive(...)") on each
// webview. Events are delivered directly by the native shell — it calls
// evaluateJavaScript on every webview that needs the event.
// On Android, events may also arrive through the WebMessagePort.

function isLegacyEventMessage(message: unknown): message is NativeToJsMessage {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<NativeToJsMessage>;
  return typeof candidate.event === "string";
}

function isNativeChromeMessage(message: unknown): message is NativeChromeMessage {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<NativeChromeMessage>;
  return (
    candidate.nativite === 2 &&
    candidate.type === "chrome.event" &&
    typeof candidate.event === "string" &&
    typeof candidate.target === "string"
  );
}

function receive(message: NativeToJsMessage | NativeChromeMessage): void {
  if (isNativeChromeMessage(message)) {
    if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("__nativite_event__", {
          detail: message,
        }),
      );
    }
    return;
  }
  if (!isLegacyEventMessage(message)) return;

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
  call(
    namespace: string,
    method: string,
    params?: unknown,
    options?: BridgeCallOptions,
  ): Promise<unknown> {
    try {
      validateCallOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }
    if (!isNativeEnvironment()) {
      if (options?.strict === true) {
        return Promise.reject(
          createBridgeError(
            "NATIVE_UNAVAILABLE",
            `Native bridge is not available for ${namespace}.${method}`,
          ),
        );
      }
      return Promise.resolve(undefined);
    }
    return nativeCall(
      {
        id: null,
        type: "call",
        namespace,
        method,
        args: params ?? null,
      },
      options,
    );
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
