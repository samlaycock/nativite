import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import {
  _drainFlush,
  _receiveNativeMessage,
  _resetChromeState,
  button,
  chrome,
  registerWebComponents,
  titleBar,
} from "./index.ts";

type NativeMessage = Record<string, unknown>;

const nativeMessages: NativeMessage[] = [];
const postMessage = mock((message: NativeMessage) => {
  nativeMessages.push(message);
});

type MutationKind = "attributes" | "childList";

type ObserverOptions = {
  attributes?: boolean;
  childList?: boolean;
  subtree?: boolean;
};

type ObserverEntry = {
  readonly observer: FakeMutationObserver;
  readonly target: FakeHTMLElement;
  readonly options: ObserverOptions;
};

class FakeMutationObserver {
  private static readonly entries = new Set<ObserverEntry>();
  private readonly callback: MutationCallback;

  constructor(callback: MutationCallback) {
    this.callback = callback;
  }

  observe(target: FakeHTMLElement, options: ObserverOptions): void {
    FakeMutationObserver.entries.add({ observer: this, target, options });
  }

  disconnect(): void {
    for (const entry of FakeMutationObserver.entries) {
      if (entry.observer === this) {
        FakeMutationObserver.entries.delete(entry);
      }
    }
  }

  takeRecords(): MutationRecord[] {
    return [];
  }

  static notify(origin: FakeHTMLElement, kind: MutationKind): void {
    for (const entry of FakeMutationObserver.entries) {
      const observesKind =
        (kind === "attributes" && entry.options.attributes) ||
        (kind === "childList" && entry.options.childList);
      if (!observesKind) continue;
      if (!FakeMutationObserver.matchesTarget(origin, entry.target, entry.options.subtree === true))
        continue;
      entry.observer.callback([], entry.observer as unknown as MutationObserver);
    }
  }

  private static matchesTarget(
    origin: FakeHTMLElement,
    target: FakeHTMLElement,
    subtree: boolean,
  ): boolean {
    if (origin === target) return true;
    if (!subtree) return false;
    let current: FakeHTMLElement | null = origin.parentElement;
    while (current) {
      if (current === target) return true;
      current = current.parentElement;
    }
    return false;
  }
}

class FakeHTMLElement {
  static readonly observedAttributes: readonly string[] = [];

  readonly children: FakeHTMLElement[] = [];
  parentElement: FakeHTMLElement | null = null;
  textContent: string | null = "";
  tagName = "DIV";
  isConnected = false;

  private readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    const oldValue = this.getAttribute(name);
    this.attributes.set(name, String(value));
    this.notifyAttributeChange(name, oldValue, this.getAttribute(name));
    FakeMutationObserver.notify(this, "attributes");
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  removeAttribute(name: string): void {
    const oldValue = this.getAttribute(name);
    this.attributes.delete(name);
    this.notifyAttributeChange(name, oldValue, null);
    FakeMutationObserver.notify(this, "attributes");
  }

  appendChild<TChild extends FakeHTMLElement>(child: TChild): TChild {
    child.parentElement = this;
    this.children.push(child);
    child.setConnected(this.isConnected);
    FakeMutationObserver.notify(this, "childList");
    return child;
  }

  removeChild<TChild extends FakeHTMLElement>(child: TChild): TChild {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentElement = null;
    child.setConnected(false);
    FakeMutationObserver.notify(this, "childList");
    return child;
  }

  querySelector(selector: string): FakeHTMLElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeHTMLElement[] {
    const tag = selector.toLowerCase();
    const matches: FakeHTMLElement[] = [];
    const visit = (node: FakeHTMLElement): void => {
      for (const child of node.children) {
        if (child.tagName.toLowerCase() === tag) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  setConnected(connected: boolean): void {
    if (this.isConnected === connected) return;
    this.isConnected = connected;
    for (const child of this.children) {
      child.setConnected(connected);
    }
    if (
      connected &&
      typeof (this as { connectedCallback?: () => void }).connectedCallback === "function"
    ) {
      (this as unknown as { connectedCallback: () => void }).connectedCallback();
    }
    if (
      !connected &&
      typeof (this as { disconnectedCallback?: () => void }).disconnectedCallback === "function"
    ) {
      (this as unknown as { disconnectedCallback: () => void }).disconnectedCallback();
    }
  }

  private notifyAttributeChange(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    const ctor = this.constructor as { observedAttributes?: readonly string[] };
    if (!ctor.observedAttributes?.includes(name)) return;
    const callback = (
      this as {
        attributeChangedCallback?: (
          name: string,
          oldValue: string | null,
          newValue: string | null,
        ) => void;
      }
    ).attributeChangedCallback;
    if (typeof callback !== "function") return;
    callback.call(this, name, oldValue, newValue);
  }
}

class FakeCustomElementRegistry {
  private readonly definitions = new Map<string, CustomElementConstructor>();
  readonly defineCalls: string[] = [];

  define(name: string, constructor: CustomElementConstructor): void {
    if (this.definitions.has(name)) {
      throw new Error(`Custom element ${name} is already defined`);
    }
    this.definitions.set(name, constructor);
    this.defineCalls.push(name);
  }

  get(name: string): CustomElementConstructor | undefined {
    return this.definitions.get(name);
  }

  createElement(name: string): FakeHTMLElement {
    const ctor = this.definitions.get(name) as (new () => FakeHTMLElement) | undefined;
    const element = ctor ? new ctor() : new FakeHTMLElement();
    element.tagName = name.toUpperCase();
    return element;
  }
}

class FakeDocument {
  readonly body: FakeHTMLElement;
  private readonly customElements: FakeCustomElementRegistry;

  constructor(customElements: FakeCustomElementRegistry) {
    this.customElements = customElements;
    this.body = new FakeHTMLElement();
    this.body.tagName = "BODY";
    this.body.setConnected(true);
  }

  createElement(name: string): FakeHTMLElement {
    return this.customElements.createElement(name);
  }
}

class FakeCustomEvent {
  readonly type: string;
  readonly detail: unknown;

  constructor(type: string, init?: { readonly detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
}

class FakeWindow {
  readonly customElements: FakeCustomElementRegistry;
  readonly HTMLElement = FakeHTMLElement as unknown as typeof HTMLElement;
  readonly MutationObserver = FakeMutationObserver as unknown as typeof MutationObserver;
  readonly document: FakeDocument;
  readonly webkit: {
    readonly messageHandlers: { readonly nativite: { postMessage: typeof postMessage } };
  };

  private readonly listeners = new Map<
    string,
    Set<(event: { readonly type: string; readonly detail?: unknown }) => void>
  >();

  constructor(customElements: FakeCustomElementRegistry, document: FakeDocument) {
    this.customElements = customElements;
    this.document = document;
    this.webkit = {
      messageHandlers: {
        nativite: { postMessage },
      },
    };
  }

  addEventListener(
    type: string,
    listener: (event: { readonly type: string; readonly detail?: unknown }) => void,
  ): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(
    type: string,
    listener: (event: { readonly type: string; readonly detail?: unknown }) => void,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: { readonly type: string; readonly detail?: unknown }): void {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
  }
}

type TestEnvironment = {
  readonly customElements: FakeCustomElementRegistry;
  readonly document: FakeDocument;
  readonly window: FakeWindow;
};

function installEnvironment(): TestEnvironment {
  const customElements = new FakeCustomElementRegistry();
  const document = new FakeDocument(customElements);
  const window = new FakeWindow(customElements, document);

  (globalThis as unknown as Record<string, unknown>).window = window;
  (globalThis as unknown as Record<string, unknown>).document = document;
  (globalThis as unknown as Record<string, unknown>).customElements = customElements;
  (globalThis as unknown as Record<string, unknown>).HTMLElement = FakeHTMLElement;
  (globalThis as unknown as Record<string, unknown>).MutationObserver = FakeMutationObserver;
  (globalThis as unknown as Record<string, unknown>).CustomEvent = FakeCustomEvent;

  return { customElements, document, window };
}

function uninstallEnvironment(): void {
  delete (globalThis as unknown as Record<string, unknown>).window;
  delete (globalThis as unknown as Record<string, unknown>).document;
  delete (globalThis as unknown as Record<string, unknown>).customElements;
  delete (globalThis as unknown as Record<string, unknown>).HTMLElement;
  delete (globalThis as unknown as Record<string, unknown>).MutationObserver;
  delete (globalThis as unknown as Record<string, unknown>).CustomEvent;
}

function lastSnapshot(): NativeMessage {
  return nativeMessages[nativeMessages.length - 1]!;
}

async function flushWebComponents(): Promise<void> {
  await Promise.resolve();
  _drainFlush();
}

let env: TestEnvironment;

beforeEach(() => {
  env = installEnvironment();
  postMessage.mockClear();
  nativeMessages.splice(0);
  _resetChromeState();
  _receiveNativeMessage({
    nativite: 2,
    type: "shell.ready",
    platform: "ios",
    version: "test",
    areas: ["titleBar"],
  });
});

afterEach(() => {
  _resetChromeState();
  uninstallEnvironment();
});

describe("registerWebComponents", () => {
  it("registers title bar web components by default and is idempotent", () => {
    registerWebComponents();
    registerWebComponents();

    expect(env.customElements.get("nv-titlebar")).toBeDefined();
    expect(env.customElements.get("nv-title")).toBeDefined();
    expect(env.customElements.get("nv-leadingitems")).toBeDefined();
    expect(env.customElements.get("nv-trailingitems")).toBeDefined();
    expect(env.customElements.get("nv-button")).toBeDefined();
    expect(env.customElements.defineCalls).toEqual([
      "nv-title",
      "nv-leadingitems",
      "nv-trailingitems",
      "nv-button",
      "nv-titlebar",
    ]);
  });

  it("supports filtered registration by area", () => {
    registerWebComponents([]);
    expect(env.customElements.get("nv-titlebar")).toBeUndefined();

    registerWebComponents(["titleBar"]);
    expect(env.customElements.get("nv-titlebar")).toBeDefined();
  });
});

describe("title bar web components", () => {
  it("matches imperative chrome output for equivalent title bar markup", async () => {
    registerWebComponents(["titleBar"]);

    const root = env.document.createElement("nv-titlebar");
    const title = env.document.createElement("nv-title");
    title.setAttribute("title", "Inbox");
    const trailing = env.document.createElement("nv-trailingitems");
    const compose = env.document.createElement("nv-button");
    compose.setAttribute("id", "compose");
    compose.setAttribute("label", "Compose");
    trailing.appendChild(compose);
    root.appendChild(title);
    root.appendChild(trailing);

    env.document.body.appendChild(root);
    await flushWebComponents();

    const declarativeSnapshot = lastSnapshot();

    _resetChromeState();
    postMessage.mockClear();
    nativeMessages.splice(0);
    _receiveNativeMessage({
      nativite: 2,
      type: "shell.ready",
      platform: "ios",
      version: "test",
      areas: ["titleBar"],
    });
    chrome(
      titleBar({
        title: "Inbox",
        trailingItems: [button({ id: "compose", label: "Compose" })],
      }),
    );
    _drainFlush();
    const imperativeSnapshot = lastSnapshot();

    expect(declarativeSnapshot["nodes"]).toEqual(imperativeSnapshot["nodes"]);
    expect(declarativeSnapshot["state"]).toEqual(imperativeSnapshot["state"]);
  });

  it("re-renders when observed attributes change", async () => {
    registerWebComponents(["titleBar"]);

    const root = env.document.createElement("nv-titlebar");
    const title = env.document.createElement("nv-title");
    title.setAttribute("title", "Inbox");
    root.appendChild(title);
    env.document.body.appendChild(root);
    await flushWebComponents();

    title.setAttribute("title", "Sent");
    await flushWebComponents();

    const nodes = lastSnapshot()["nodes"] as Record<string, { readonly label?: string }>;
    expect(nodes["titleBar:title"]?.label).toBe("Sent");
  });

  it("cleans up chrome layer on disconnect", async () => {
    registerWebComponents(["titleBar"]);

    const root = env.document.createElement("nv-titlebar");
    const title = env.document.createElement("nv-title");
    title.setAttribute("title", "Inbox");
    root.appendChild(title);
    env.document.body.appendChild(root);
    await flushWebComponents();

    env.document.body.removeChild(root);
    await flushWebComponents();

    const nodes = lastSnapshot()["nodes"] as Record<string, unknown>;
    expect(nodes["titleBar"]).toBeUndefined();
  });

  it("warns for invalid markup and ignores unsupported child nodes", async () => {
    registerWebComponents(["titleBar"]);
    const originalWarn = console.warn;
    const warn = mock(() => {});
    console.warn = warn;

    try {
      const root = env.document.createElement("nv-titlebar");
      const leading = env.document.createElement("nv-leadingitems");
      const invalidLeading = env.document.createElement("nv-title");
      const missingIdButton = env.document.createElement("nv-button");
      leading.appendChild(invalidLeading);
      leading.appendChild(missingIdButton);
      const invalidRootChild = env.document.createElement("nv-unsupported");
      root.appendChild(leading);
      root.appendChild(invalidRootChild);
      env.document.body.appendChild(root);
      await flushWebComponents();

      expect(warn).toHaveBeenCalled();
      const snapshotNodes = lastSnapshot()["nodes"] as Record<string, unknown>;
      const leadingActionNodes = Object.keys(snapshotNodes).filter((id) =>
        id.startsWith("titleBar:leading:"),
      );
      expect(leadingActionNodes).toHaveLength(0);
    } finally {
      console.warn = originalWarn;
    }
  });
});
