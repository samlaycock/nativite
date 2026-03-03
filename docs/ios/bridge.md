# iOS Native Bridge

> Maps to: `src/ios/templates/nativite-bridge.ts`
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

### Native to JavaScript

The bridge uses `WKScriptMessageHandlerWithReply` for request/response, meaning native replies are sent directly through the `replyHandler` callback without needing a separate `evaluateJavaScript` roundtrip.

For fire-and-forget events (native to JS), the bridge uses:

```swift
func sendEvent(_ name: String, data: [String: Any])
```

This calls `evaluateJavaScript` to invoke `window.nativiteReceive({ event, data })` on the target webview.

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

### `__chrome__.__chrome_set_state__`

Receives the full chrome state snapshot from JavaScript and applies it to the native UI. Fire-and-forget (no reply needed). Only the **primary webview** is allowed to set chrome state.

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
