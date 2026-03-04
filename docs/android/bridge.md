# Android Native Bridge

> Maps to: `src/android/templates/nativite-bridge.ts`
> Generated file: `NativiteBridge.kt`

The bridge provides bidirectional communication between JavaScript and Kotlin using `WebMessagePort` (AndroidX WebKit).

## Architecture

Unlike iOS which uses `WKScriptMessageHandlerWithReply`, Android uses a `WebMessageChannel` — a pair of `WebMessagePort` objects for bidirectional messaging.

## Transport Mechanism

### Setup

When a webview is attached to the bridge:

1. Creates a `WebMessageChannel` via `WebViewCompat.createWebMessageChannel()`.
2. Transfers the JavaScript-side port to the webview via `WebViewCompat.postWebMessage("__nativite_port__", [jsPort])`.
3. Registers a message callback on the native-side port.

JavaScript detects the port transfer by listening for a `message` event with data `"__nativite_port__"` and captures the transferred port for outbound communication.

### JavaScript to Native

JavaScript sends messages through the transferred `MessagePort`:

```javascript
port.postMessage(JSON.stringify({
    id: "unique-id",
    type: "call",
    namespace: "pluginName",
    method: "methodName",
    args: { ... }
}))
```

### Native to JavaScript

For RPC replies, the bridge sends a response through the same port:

```json
{ "id": "unique-id", "result": ..., "error": null }
```

For fire-and-forget events, the bridge uses `evaluateJavaScript`:

```javascript
window.nativiteReceive({ id: null, type: "event", event: "eventName", data: { ... } })
```

## WebView Attachment

```kotlin
fun attachWebView(webView: WebView, instanceName: String)
```

- Registers the webview (main or child) in the bridge's webview registry.
- For the primary webview (`"main"`), creates a `NativiteVars` observer to track safe area and keyboard height.
- Sets up the `WebMessageChannel` for bidirectional communication.
- Uses `WebViewFeature` checks for backward compatibility.

```kotlin
fun detachWebView(instanceName: String)
```

Cleans up ports and references when a webview is destroyed.

## Message Handling

### Built-in `__nativite__` Handlers

| Handler                      | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `__nativite__.__ping__`      | Returns `"pong"`                                  |
| `__nativite__.__ota_check__` | Returns `{ available: false }` placeholder status |

### Built-in Chrome Handlers

| Handler                                          | Description                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `__chrome__.__chrome_set_state__`                | Updates `chromeState.value` and pushes chrome geometry CSS vars                                                  |
| `__chrome__.__chrome_splash_hide__`              | Sets `splashKeepOnScreen = false` to dismiss the splash. See [Splash Screen Control](../shared/splash-screen.md) |
| `__chrome__.__chrome_messaging_post_to_parent__` | Routes message from child to main webview                                                                        |
| `__chrome__.__chrome_messaging_post_to_child__`  | Routes message from main to named child                                                                          |
| `__chrome__.__chrome_messaging_broadcast__`      | Sends to all webviews except sender                                                                              |

### Plugin Handlers

Plugins register via `handlers["$namespace.$method"]` with a callback receiving `(args, completion)`.

Built-ins (and plugins calling `register`) use Kotlin named arguments:

```kotlin
register(namespace = "__nativite__", method = "__ping__") { _, completion ->
    completion(Result.success("pong"))
}
```

## Chrome Geometry CSS Variables

When chrome state or measured chrome layout changes, `updateRenderedChromeGeometry()` pushes:

| Variable               | Value              | Description                             |
| ---------------------- | ------------------ | --------------------------------------- |
| `--nv-nav-height`      | `<measured>px`/`0` | Measured rendered title bar height      |
| `--nv-nav-visible`     | `0` / `1`          | Whether title bar is visible            |
| `--nv-tab-height`      | `<measured>px`/`0` | Measured rendered navigation bar height |
| `--nv-tab-visible`     | `0` / `1`          | Whether navigation bar is visible       |
| `--nv-toolbar-height`  | `<measured>px`/`0` | Measured rendered bottom toolbar height |
| `--nv-toolbar-visible` | `0` / `1`          | Whether toolbar is visible              |

Heights are measured from actual Compose layout (`onGloballyPositioned`) instead of fixed constants.

## Inter-Webview Messaging

| Method                  | Direction     | Description                                               |
| ----------------------- | ------------- | --------------------------------------------------------- |
| `postMessageToParent()` | child to main | Delivers `{ from: "childName", payload }`                 |
| `postMessageToChild()`  | main to child | Delivers `{ from: "main", payload }`                      |
| `broadcastMessage()`    | one to all    | Delivers `{ from: sender, payload }` to all except sender |

All use `sendEvent("message", data)` for delivery.

## Default Chrome State

```kotlin
fun getDefaultChromeState(): Map<String, Any>?
```

Parses an embedded JSON string (injected at generation time from config). Returns `null` if no default chrome is configured.

## JSON Type Conversions

The bridge includes helper functions for Kotlin ↔ JSON conversion:

- `toJsonValue()` — Converts Kotlin `Map`, `List`, primitives to JSON-compatible types
- `jsonToMap()` — Converts `JSONObject` to `Map<String, Any?>`
- `jsonArrayToList()` — Converts `JSONArray` to `List<Any?>`
- Handles `JSONObject.NULL` sentinel properly
