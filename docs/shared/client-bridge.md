# Client Bridge (JavaScript)

> Maps to: `src/client/index.ts`

The client bridge is the low-level JavaScript API for RPC calls and event subscriptions with the native layer. It abstracts iOS and Android transport differences behind a unified interface.

## Transport Abstraction

### iOS: WebKit Message Handler

```javascript
webkit.messageHandlers.nativite.postMessageWithReply({
    id: null,
    type: "call",
    namespace: "pluginName",
    method: "methodName",
    args: { ... }
})
```

Uses `postMessageWithReply()` for synchronous request/response within a single async call. The native `WKScriptMessageHandlerWithReply` protocol handles the reply directly.

### Android: WebMessagePort

A `MessagePort` is transferred from native to JavaScript via a `message` event with data `"__nativite_port__"`. The port is used for bidirectional communication.

RPC on Android uses correlation IDs:

1. JavaScript generates a UUID for each call.
2. Sends the message (with ID) through the port.
3. Native processes the call and sends a reply with the same ID.
4. JavaScript matches the reply to the pending promise.

```javascript
const id = crypto.randomUUID();
pendingCalls.set(id, { resolve, reject });
port.postMessage(JSON.stringify({ ...msg, id }));
```

Pending Android calls are removed when the native side replies, when a timeout
fires, or when the call's `AbortSignal` is aborted. This prevents unresolved
native requests from accumulating indefinitely if native fails to respond.

## Public API

### `bridge.isNative`

```typescript
bridge.isNative: boolean
```

Returns `true` when running inside a native webview (iOS or Android). Returns `false` in a regular browser.

### `bridge.call(namespace, method, params?, options?)`

```typescript
bridge.call(
  namespace: string,
  method: string,
  params?: unknown,
  options?: BridgeCallOptions,
): Promise<unknown>

interface BridgeCallOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly strict?: boolean;
}
```

Makes an RPC call to a registered native handler. Returns a promise that resolves with the handler's result or rejects with an error.

```javascript
import { bridge } from "nativite/client";

const result = await bridge.call("camera", "takePhoto", { quality: 0.8 });
```

### `createBridge<Contracts>()`

```typescript
import { createBridge } from "nativite/client";

interface AppBridgeContracts {
  camera: {
    methods: {
      takePhoto: {
        params: { readonly quality: number };
        result: { readonly path: string };
      };
    };
    events: {
      "camera.ready": { readonly deviceCount: number };
    };
  };
}

const typedBridge = createBridge<AppBridgeContracts>();
const photo = await typedBridge.call("camera", "takePhoto", { quality: 0.8 });

typedBridge.subscribe("camera.ready", (payload) => {
  console.log(payload.deviceCount);
});
```

`createBridge()` returns the same runtime bridge object with typed call and
subscribe signatures. The generic contract is compile-time only; it does not
change the native message shape or add runtime validation.

For methods without declared params, pass explicit runtime metadata before using
the options-only call form. This avoids guessing from object shape, so a real
params payload like `{ strict: true }` is never mistaken for bridge options.

```typescript
const typedBridge = createBridge<AppBridgeContracts>({
  parameterlessMethods: {
    camera: ["reset"],
  },
});

await typedBridge.call("camera", "reset", { strict: true });
```

When not running in a native environment, returns `Promise.resolve(undefined)` by
default for backwards compatibility. Pass `{ strict: true }` to reject instead:

```javascript
await bridge.call("camera", "takePhoto", undefined, { strict: true });
```

#### Timeouts and Cancellation

Pass `timeoutMs` to reject if native does not reply in time:

```javascript
await bridge.call("camera", "takePhoto", { quality: 0.8 }, { timeoutMs: 5000 });
```

Pass an `AbortSignal` to cancel a pending call from app code:

```javascript
const controller = new AbortController();
const promise = bridge.call("location", "watchOnce", null, {
  signal: controller.signal,
});

controller.abort("No longer needed");
await promise;
```

Timeout and abort failures reject with `NativiteBridgeError`.

#### Structured Errors

Bridge calls reject with `NativiteBridgeError`, which exposes a stable `code`
property:

```typescript
type BridgeErrorCode =
  | "NATIVE_UNAVAILABLE"
  | "NATIVE_ERROR"
  | "TIMEOUT"
  | "ABORTED"
  | "INVALID_OPTIONS";
```

Native string errors are normalized to `NATIVE_ERROR`. Native structured errors
with `{ code, message }` preserve the code when it matches a supported bridge
error code.

### `bridge.subscribe(event, handler)`

```typescript
bridge.subscribe(event: string, handler: (data: unknown) => void): () => void
```

Subscribes to native events by name. Returns an unsubscribe function.

```javascript
const unsub = bridge.subscribe("location.updated", (data) => {
  console.log(data.latitude, data.longitude);
});

// Later:
unsub();
```

## OTA API

### `ota.check()`

```typescript
ota.check(): Promise<{ available: boolean; version?: string }>
```

Queries the native OTA handler for available updates.

```javascript
import { ota } from "nativite/client";

const status = await ota.check();
if (status.available) {
  console.log("Update available:", status.version);
}
```

When not in a native environment, returns `{ available: false }`.

Platform notes:

- iOS/macOS: Returns live status from the native OTA updater.
- Android: Returns `{ available: false }` placeholder status (no Android OTA runtime yet).

## Event Delivery Chain

When native sends an event:

1. Native calls `evaluateJavaScript("window.nativiteReceive({...})")`.
2. Legacy `{ event, data }` messages dispatch to matching `bridge.subscribe()` handlers.
3. Legacy events and `nativite: 2` chrome events both dispatch a `CustomEvent("__nativite_event__")` on `window`.
4. The Chrome module listens on `"__nativite_event__"` for chrome-specific events.

This preserves low-level bridge subscriptions while forwarding native chrome envelopes unchanged so `chrome.on()` can normalize platform event targets such as menu item taps.

## Environment Detection

The bridge detects the native environment by checking for:

- iOS: `window.webkit?.messageHandlers?.nativite` exists
- Android: The `"__nativite_port__"` message event has been received

The `bridge.isNative` property returns `true` if either transport is available.
