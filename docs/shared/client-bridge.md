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

## Public API

### `bridge.isNative`

```typescript
bridge.isNative: boolean
```

Returns `true` when running inside a native webview (iOS or Android). Returns `false` in a regular browser.

### `bridge.call(namespace, method, params?)`

```typescript
bridge.call(namespace: string, method: string, params?: unknown): Promise<unknown>
```

Makes an RPC call to a registered native handler. Returns a promise that resolves with the handler's result or rejects with an error.

```javascript
import { bridge } from "nativite/client";

const result = await bridge.call("camera", "takePhoto", { quality: 0.8 });
```

When not running in a native environment, returns `Promise.resolve(undefined)` silently.

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
2. `window.nativiteReceive()` dispatches to `bridge.subscribe()` handlers.
3. Also dispatches a `CustomEvent("__nativite_event__")` on `window`.
4. The Chrome module listens on `"__nativite_event__"` for chrome-specific events.

This dual-dispatch ensures both the low-level bridge API and the high-level Chrome API receive events.

## Environment Detection

The bridge detects the native environment by checking for:

- iOS: `window.webkit?.messageHandlers?.nativite` exists
- Android: The `"__nativite_port__"` message event has been received

The `bridge.isNative` property returns `true` if either transport is available.
