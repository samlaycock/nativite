# iOS Native Bridge

> Maps to: `src/native/ios/runtime/NativiteBridge.swift`
> Generated file: `NativiteBridge.swift`

The bridge provides bidirectional communication between JavaScript and native Swift code using `WKScriptMessageHandlerWithReply`.

## Architecture

```swift
class NativiteBridge: NSObject, WKScriptMessageHandlerWithReply
```

The bridge is a single object shared across the main webview and all child webviews (sheets, drawers, etc.). It maintains a registry of namespace-scoped handlers for O(1) dispatch.

## Transport Mechanism

### JavaScript to Native

JavaScript calls the bridge via the WebKit message handler:

```javascript
webkit.messageHandlers.nativite.postMessage({
  id: "unique-id",
  type: "call",
  namespace: "pluginName",
  method: "methodName",
  args: { ... }
})
```

Chrome layout no longer uses the generic `__chrome__.__chrome_set_state__` bridge call. The Chrome runtime sends NCLP v2 `chrome.snapshot` envelopes directly:

```json
{
  "nativite": 2,
  "type": "chrome.snapshot",
  "docId": "main",
  "revision": 1,
  "root": "root",
  "nodes": {},
  "state": {
    "selected": {},
    "disabled": {},
    "hidden": {},
    "badges": {},
    "values": {}
  }
}
```

### Native to JavaScript

The bridge uses `WKScriptMessageHandlerWithReply` for request/response, meaning native replies are sent directly through the `replyHandler` callback without needing a separate `evaluateJavaScript` roundtrip.

For fire-and-forget events (native to JS), the bridge uses:

```swift
func sendEvent(_ name: String, data: [String: Any])
```

This calls `evaluateJavaScript` to invoke `window.nativiteReceive({ event, data })` on the target webview.

On primary webview load, `ViewController` sends `shell.ready` via `window.nativiteReceive(...)` with the iOS-supported chrome areas. The JavaScript runtime waits for this message before sending the first `chrome.snapshot`.

## Handler Registration

Plugins and built-in functionality register handlers using namespace-scoped keys:

```swift
bridge.register(namespace: "plugin_name", method: "method_name") { args, completion in
    // Handle native capability
    completion(.success(result))
}
```

Handlers are stored as `"namespace.method"` keys in a dictionary for O(1) lookup.

## Built-in Handlers

| Namespace      | Method          | Description                                       |
| -------------- | --------------- | ------------------------------------------------- |
| `__nativite__` | `__ping__`      | Returns `"pong"` (connectivity check)             |
| `__nativite__` | `__ota_check__` | Returns live OTA status (`available`, `version?`) |

## Chrome Handlers

### `chrome.snapshot`

Receives the full NCLP v2 chrome document from JavaScript. The bridge accepts snapshots only from the **primary webview**, validates the NCLP envelope, rejects stale revisions per `docId`, enforces basic graph invariants and document size caps, converts the NCLP document to the current native chrome state model, and applies it to the native UI.

The adapter preserves full NCLP node identity in internal `nclpId` fields while exposing the short legacy `id` values expected by existing SwiftUI/UIKit chrome renderers. Native chrome interactions prefer `nclpId` when creating `chrome.event` envelopes, so event targets remain valid NCLP node IDs even while the renderer still consumes the legacy state shape.

The previous `__chrome__.__chrome_set_state__` path is retained only for compatibility with older JavaScript bundles.

### `__chrome__.__chrome_splash_hide__`

Manually hides the splash overlay by setting `chromeState.splashVisible = false`. Only accepted from the primary webview. See [Splash Screen Control](../shared/splash-screen.md).

## Inter-Webview Messaging

The bridge routes messages between webviews:

| Handler                                          | Direction     | Description                                               |
| ------------------------------------------------ | ------------- | --------------------------------------------------------- |
| `__chrome__.__chrome_messaging_post_to_parent__` | child to main | Routes a message from a child webview to the main webview |
| `__chrome__.__chrome_messaging_post_to_child__`  | main to child | Routes a message from the main webview to a named child   |
| `__chrome__.__chrome_messaging_broadcast__`      | one to all    | Sends a message to every webview except the sender        |

### Routing Rules

- Only the **primary webview** can post to children and set chrome state.
- Any webview can post to parent or broadcast.
- The bridge uses `chrome.instanceName(for:)` to identify which child webview sent a message.
- Child webviews are tracked in `chromeState.childWebViews` dictionary keyed by instance name.

## Event Delivery

Events flow native to JS using `sendEvent()`:

```swift
bridge.sendEvent("message", data: [
    "from": senderName,
    "payload": messagePayload
])
```

This dispatches a `CustomEvent("__nativite_event__")` in the target webview, which the Chrome module picks up for routing to JavaScript event handlers.
