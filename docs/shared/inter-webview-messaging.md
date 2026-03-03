# Inter-Webview Messaging

Inter-webview messaging allows the main webview and child webviews (sheets, drawers, popovers, app windows) to communicate with each other through the native bridge.

## Architecture

All webviews share the same `WKWebsiteDataStore` (iOS) or `WebView` session (Android) for shared cookies and storage. Messaging is routed through the native bridge, not via shared storage.

```
Main WebView ──── NativiteBridge ──── Child WebView (sheet)
                       │
                       ├──── Child WebView (drawer)
                       └──── Child WebView (popover)
```

## JavaScript API

### Send to Parent (child → main)

```javascript
chrome.messaging.postToParent(payload);
```

### Send to Child (main → named child)

```javascript
chrome.messaging.postToChild("settings-sheet", { action: "refresh" });
```

### Broadcast (any → all others)

```javascript
chrome.messaging.broadcast({ type: "theme-changed" });
```

### Receive Messages

```javascript
chrome.messaging.onMessage((from, payload) => {
  // from: "main" | child instance name
  console.log(`From ${from}:`, payload);
});
```

## Native Routing

### iOS

The bridge uses `WKScriptMessageHandlerWithReply` handlers:

| Handler                               | Direction        | Guard                |
| ------------------------------------- | ---------------- | -------------------- |
| `__chrome_messaging_post_to_parent__` | child → main     | Any webview          |
| `__chrome_messaging_post_to_child__`  | main → child     | Primary webview only |
| `__chrome_messaging_broadcast__`      | one → all others | Any webview          |

Child webviews are identified by `chrome.instanceName(for: webView)` and tracked in `chromeState.childWebViews`.

### Android

The bridge routes messages through `WebMessagePort`:

| Method                  | Direction        | Guard                |
| ----------------------- | ---------------- | -------------------- |
| `postMessageToParent()` | child → main     | Any webview          |
| `postMessageToChild()`  | main → child     | Primary webview only |
| `broadcastMessage()`    | one → all others | Any webview          |

## Event Delivery

Messages are delivered as chrome events:

```json
{
  "type": "message",
  "from": "settings-sheet",
  "payload": { "action": "refresh" }
}
```

The Chrome module's event system routes these to `chrome.messaging.onMessage()` handlers.

## Instance Naming

Each child webview has a unique instance name:

- Set at creation time (e.g., `"settings-sheet"`, `"nav-drawer"`).
- Injected as `window.__nativekit_instance_name__` in the webview.
- Used for routing `postToChild()` messages to the correct webview.

The main webview's instance name is always `"main"`.

## Security Rules

- Only the **primary webview** can set chrome state (`__chrome_set_state__`).
- Only the **primary webview** can post to children.
- Any webview can post to parent or broadcast.
- These guards prevent child webviews from hijacking the native UI.
