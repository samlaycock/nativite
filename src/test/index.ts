/// <reference lib="dom" />

import type { ChromeCapabilityArea } from "../chrome/types.ts";

export interface NativeTestReadyOptions {
  readonly platform?: string;
  readonly version?: string;
  readonly areas?: readonly ChromeCapabilityArea[];
}

export interface NativeTestBridgeCall {
  readonly namespace: string;
  readonly method: string;
  readonly args: unknown;
}

export interface NativeTestChromeEvent {
  readonly nativite: 2;
  readonly type: "chrome.event";
  readonly docId?: string;
  readonly event: string;
  readonly target: string;
  readonly value?: unknown;
}

export interface NativeTestChromeSnapshot {
  readonly nativite: 2;
  readonly type: "chrome.snapshot";
  readonly docId: string;
  readonly revision: number;
  readonly root: string;
  readonly nodes: Record<string, unknown>;
  readonly state: Record<string, unknown>;
}

export interface NativeTestBridge {
  handle(
    namespace: string,
    method: string,
    handler: (args: unknown, call: NativeTestBridgeCall) => unknown,
  ): () => void;
  calls(namespace?: string, method?: string): readonly NativeTestBridgeCall[];
  clearCalls(): void;
}

export interface NativeTestHost {
  readonly bridge: NativeTestBridge;
  reset(): void;
  ready(options?: NativeTestReadyOptions): void;
  emit(event: string, data?: unknown): Promise<void>;
  emitChromeEvent(event: NativeTestChromeEventInput): Promise<void>;
}

export interface ChromeHarness {
  snapshots(): readonly NativeTestChromeSnapshot[];
  latestSnapshot(): NativeTestChromeSnapshot | undefined;
  clearSnapshots(): void;
}

export interface NativeTestChromeEventInput {
  readonly event: string;
  readonly target: string;
  readonly docId?: string;
  readonly value?: unknown;
}

export interface NativeHarnessOptions {
  readonly endpoint?: string;
  readonly sessionId?: string;
  readonly sessionToken?: string;
  readonly fetch?: typeof fetch;
}

export interface NativeTestArtifact {
  readonly path: string;
  readonly mimeType?: string;
  readonly description?: string;
}

export interface NativeTestLogEntry {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
  readonly timestamp?: string;
  readonly subsystem?: string;
  readonly category?: string;
}

const DEFAULT_AREAS: readonly ChromeCapabilityArea[] = [
  "titleBar",
  "navigation",
  "toolbar",
  "sidebarPanel",
  "statusBar",
  "homeIndicator",
  "keyboard",
  "menuBar",
  "tabBottomAccessory",
  "sheets",
  "drawers",
  "appWindows",
  "popovers",
];

type WebKitHandler = {
  postMessage(message: unknown): void;
  postMessageWithReply(message: unknown): Promise<unknown>;
};

type WebKitWindow = Window & {
  webkit?: { messageHandlers?: { nativite?: WebKitHandler } };
  nativiteReceive?: (message: unknown) => void;
};

const handlers = new Map<string, (args: unknown, call: NativeTestBridgeCall) => unknown>();
const callHistory: NativeTestBridgeCall[] = [];
const snapshotHistory: NativeTestChromeSnapshot[] = [];
const previousGlobals = new WeakMap<Window, Pick<WebKitWindow, "webkit" | "nativiteReceive">>();

function currentWindow(): WebKitWindow | undefined {
  return typeof window === "undefined" ? undefined : (window as WebKitWindow);
}

function dispatchNativeMessage(message: unknown): void {
  const w = currentWindow();
  if (!w) return;

  if (typeof w.nativiteReceive === "function") {
    w.nativiteReceive(message);
    if (isShellReadyMessage(message)) {
      w.dispatchEvent(new CustomEvent("__nativite_event__", { detail: message }));
    }
    return;
  }

  w.dispatchEvent(new CustomEvent("__nativite_event__", { detail: message }));
}

function isShellReadyMessage(message: unknown): boolean {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as { readonly nativite?: unknown; readonly type?: unknown };
  return candidate.nativite === 2 && candidate.type === "shell.ready";
}

function installHost(): WebKitHandler {
  const w = currentWindow();
  if (!w) {
    throw new Error("nativite/test requires a DOM-like window for the local stub host");
  }

  if (!previousGlobals.has(w)) {
    previousGlobals.set(w, {
      webkit: w.webkit,
      nativiteReceive: w.nativiteReceive,
    });
  }

  const handler: WebKitHandler = {
    postMessage(message: unknown): void {
      capturePostMessage(message);
    },
    async postMessageWithReply(message: unknown): Promise<unknown> {
      return handleBridgeCall(message);
    },
  };

  w.webkit = {
    ...w.webkit,
    messageHandlers: {
      ...w.webkit?.messageHandlers,
      nativite: handler,
    },
  };

  return handler;
}

function capturePostMessage(message: unknown): void {
  if (isChromeSnapshot(message)) {
    snapshotHistory.push(message);
  }
}

async function handleBridgeCall(
  message: unknown,
): Promise<{ readonly result?: unknown; readonly error?: unknown }> {
  if (!isBridgeCall(message)) {
    return { error: { code: "NATIVE_ERROR", message: "Unsupported native test bridge message" } };
  }

  const call: NativeTestBridgeCall = {
    namespace: message.namespace,
    method: message.method,
    args: message.args,
  };
  callHistory.push(call);

  const handler = handlers.get(handlerKey(call.namespace, call.method));
  if (!handler) {
    return {
      error: {
        code: "NATIVE_UNAVAILABLE",
        message: `No nativeTest bridge handler registered for ${call.namespace}.${call.method}`,
      },
    };
  }

  try {
    return { result: await handler(call.args, call) };
  } catch (error) {
    return { error: normalizeError(error) };
  }
}

function isBridgeCall(message: unknown): message is {
  readonly namespace: string;
  readonly method: string;
  readonly args: unknown;
} {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return (
    candidate["type"] === "call" &&
    typeof candidate["namespace"] === "string" &&
    typeof candidate["method"] === "string"
  );
}

function isChromeSnapshot(message: unknown): message is NativeTestChromeSnapshot {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<NativeTestChromeSnapshot>;
  return candidate.nativite === 2 && candidate.type === "chrome.snapshot";
}

function handlerKey(namespace: string, method: string): string {
  return `${namespace}\u0000${method}`;
}

function normalizeError(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof Error) return { code: "NATIVE_ERROR", message: error.message };
  if (typeof error === "string") return { code: "NATIVE_ERROR", message: error };
  return { code: "NATIVE_ERROR", message: "Native test bridge handler failed" };
}

function restoreHost(): void {
  const w = currentWindow();
  if (!w) return;

  const previous = previousGlobals.get(w);
  if (!previous) return;

  w.webkit = previous.webkit;
  if (previous.nativiteReceive === undefined) {
    delete w.nativiteReceive;
  } else {
    w.nativiteReceive = previous.nativiteReceive;
  }
  previousGlobals.delete(w);
}

export const nativeTest: NativeTestHost = {
  bridge: {
    handle(namespace, method, handler): () => void {
      installHost();
      const key = handlerKey(namespace, method);
      handlers.set(key, handler);
      return () => {
        if (handlers.get(key) === handler) {
          handlers.delete(key);
        }
      };
    },
    calls(namespace?: string, method?: string): readonly NativeTestBridgeCall[] {
      return callHistory.filter((call) => {
        if (namespace !== undefined && call.namespace !== namespace) return false;
        if (method !== undefined && call.method !== method) return false;
        return true;
      });
    },
    clearCalls(): void {
      callHistory.length = 0;
    },
  },
  reset(): void {
    handlers.clear();
    callHistory.length = 0;
    snapshotHistory.length = 0;
    restoreHost();
  },
  ready(options = {}): void {
    installHost();
    const message = {
      nativite: 2,
      type: "shell.ready",
      platform: options.platform ?? "test",
      version: options.version ?? "0.0.0-test",
      areas: options.areas ?? DEFAULT_AREAS,
    };
    dispatchNativeMessage(message);
    queueMicrotask(() => {
      dispatchNativeMessage(message);
    });
  },
  async emit(event: string, data?: unknown): Promise<void> {
    installHost();
    dispatchNativeMessage({ id: null, type: "event", event, data });
    await Promise.resolve();
  },
  async emitChromeEvent(event: NativeTestChromeEventInput): Promise<void> {
    installHost();
    dispatchNativeMessage({
      nativite: 2,
      type: "chrome.event",
      event: event.event,
      target: event.target,
      docId: event.docId,
      value: event.value,
    });
    await Promise.resolve();
  },
};

export const chromeHarness: ChromeHarness = {
  snapshots(): readonly NativeTestChromeSnapshot[] {
    return [...snapshotHistory];
  },
  latestSnapshot(): NativeTestChromeSnapshot | undefined {
    return snapshotHistory.at(-1);
  },
  clearSnapshots(): void {
    snapshotHistory.length = 0;
  },
};

async function postCoordinatorCommand<T>(
  command: string,
  payload: unknown,
  options: NativeHarnessOptions = {},
): Promise<T> {
  const env = globalThis as typeof globalThis & {
    readonly process?: { readonly env?: Record<string, string | undefined> };
  };
  const endpoint = options.endpoint ?? env.process?.env?.["NATIVITE_COORDINATOR_URL"];
  const sessionId = options.sessionId ?? env.process?.env?.["NATIVITE_TEST_SESSION_ID"] ?? "local";
  const sessionToken = options.sessionToken ?? env.process?.env?.["NATIVITE_TEST_SESSION_TOKEN"];
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!endpoint) {
    throw new Error("Configure NATIVITE_COORDINATOR_URL or pass nativeHarness command options");
  }
  if (!sessionToken) {
    throw new Error("Configure NATIVITE_TEST_SESSION_TOKEN or pass nativeHarness command options");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("nativeHarness requires a fetch implementation");
  }

  const response = await fetchImpl(new URL(`/commands/${command}`, endpoint), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      protocol: "nativite.test",
      version: 1,
      sessionId,
      requestId: `nativeHarness:${command}`,
      timestamp: new Date().toISOString(),
      type: command,
      token: sessionToken,
      payload: payload ?? null,
    }),
  });
  if (!response.ok) {
    throw new Error(`nativeHarness command ${command} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export const nativeHarness = {
  emit(event: string, data?: unknown, options?: NativeHarnessOptions): Promise<void> {
    return postCoordinatorCommand("emit", { event, data }, options);
  },
  emitChromeEvent(
    event: NativeTestChromeEventInput,
    options?: NativeHarnessOptions,
  ): Promise<void> {
    return postCoordinatorCommand("chrome-event", event, options);
  },
  latestSnapshot(options?: NativeHarnessOptions): Promise<NativeTestChromeSnapshot | undefined> {
    return postCoordinatorCommand("latest-snapshot", null, options);
  },
  geometry(target: string, options?: NativeHarnessOptions): Promise<unknown> {
    return postCoordinatorCommand("geometry", { target }, options);
  },
  screenshot(name?: string, options?: NativeHarnessOptions): Promise<NativeTestArtifact> {
    return postCoordinatorCommand("screenshot", { name }, options);
  },
  nativeLogs(options?: NativeHarnessOptions): Promise<readonly NativeTestLogEntry[]> {
    return postCoordinatorCommand("native-logs", null, options);
  },
} as const;
