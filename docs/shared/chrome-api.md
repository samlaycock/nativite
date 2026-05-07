# Chrome API (JavaScript Runtime)

> Maps to: `src/chrome/index.ts`, `src/chrome/types.ts`

The Chrome API is the JavaScript-side interface for controlling native UI chrome from web content. It provides a declarative, stackable approach to native UI management.

## Core Concept: Layer Stack

The Chrome API uses a layer stack model where multiple `chrome()` calls create layers that merge bottom-up into the final state:

```javascript
import { chrome, titleBar, navigation } from 'nativite/chrome'

// Layer 1: Base chrome
const cleanup1 = chrome(
    titleBar({ title: "Home" }),
    navigation({ items: [...], activeItem: "home" })
)

// Layer 2: Override title (navigation inherited from layer 1)
const cleanup2 = chrome(
    titleBar({ title: "Settings" })
)

// cleanup2() removes layer 2, restoring "Home" title
// cleanup1() removes all chrome
```

Each `chrome()` call returns a cleanup function. When called, it removes that layer and re-computes the merged state.

## Factory Functions

### Chrome Area Descriptors

| Function                  | Creates                           | Named? |
| ------------------------- | --------------------------------- | ------ |
| `titleBar(config)`        | Title/navigation bar              | No     |
| `navigation(config)`      | Bottom tab bar                    | No     |
| `toolbar(config)`         | Secondary toolbar                 | No     |
| `sidebarPanel(config)`    | Sidebar navigation (macOS/iPad)   | No     |
| `statusBar(config)`       | Status bar appearance             | No     |
| `homeIndicator(config)`   | Home indicator visibility         | No     |
| `keyboard(config)`        | Keyboard accessory + dismiss mode | No     |
| `menuBar(config)`         | Menu bar (macOS)                  | No     |
| `sheet(name, config)`     | Modal bottom sheet                | Yes    |
| `drawer(name, config)`    | Side drawer                       | Yes    |
| `appWindow(name, config)` | Separate window (macOS)           | Yes    |
| `popover(name, config)`   | Floating popover                  | Yes    |

Named areas (sheets, drawers, etc.) are grouped under plural NCLP containers (`sheets`, `drawers`, `appWindows`, `popovers`).

## NCLP v2 Wire Format

The public authoring API still accepts `chrome()`, `titleBar()`, `navigation()`, and the other factory descriptors. Internally, the runtime compiles the merged `ChromeState` into Native Chrome Layout Protocol v2 messages before crossing the native transport.

The host must first send:

```json
{
  "nativite": 2,
  "type": "shell.ready",
  "platform": "ios",
  "version": "1.0.0",
  "areas": ["titleBar", "navigation", "toolbar"]
}
```

The runtime does not send chrome documents until `shell.ready` has been received. The `areas` list is used as a capability filter, so unsupported areas are omitted from the compiled snapshot.
`shell.ready` must include `platform`, `version`, and a string `areas` array; malformed readiness messages are ignored so the runtime does not negotiate against an invalid host capability set.

Chrome updates are sent as full snapshots:

```json
{
  "nativite": 2,
  "type": "chrome.snapshot",
  "docId": "main",
  "revision": 1,
  "root": "root",
  "nodes": {
    "root": { "id": "root", "kind": "window", "children": ["titleBar"] },
    "titleBar": { "id": "titleBar", "kind": "titleBar", "children": ["titleBar:title"] },
    "titleBar:title": { "id": "titleBar:title", "kind": "title", "label": "Inbox" }
  },
  "state": {
    "selected": {},
    "disabled": {},
    "hidden": {},
    "badges": {},
    "values": {}
  }
}
```

Snapshots use monotonically increasing revisions and stable node IDs following `NCLP.md`. Runtime state such as selection, disabled flags, hidden/presented state, badges, and input values is emitted through NCLP state buckets rather than duplicated into node metadata.

## Event System

### Specific Event Subscription

```javascript
chrome.on("titleBar.leadingItemPressed", (event) => {
  console.log(event.id); // The button id that was pressed
});
```

### Wildcard Subscription

```javascript
chrome.on((event) => {
  console.log(event.type, event); // All chrome events
});
```

Both return an unsubscribe function.

Native hosts send interaction events as NCLP `chrome.event` envelopes. Event `target` and selection `value` fields use full NCLP node IDs; the runtime maps generic events such as `activate`, `select`, `back`, and `input` back to the existing `ChromeEvent` union, so no public JavaScript event names changed.

### Event Types

Chrome events are a discriminated union on `type`:

**Title Bar:**

- `titleBar.leadingItemPressed` / `titleBar.trailingItemPressed` — `{ id }`
- `titleBar.menuItemPressed` — `{ id }`
- `titleBar.backPressed`
- `titleBar.searchChanged` / `titleBar.searchSubmitted` — `{ value }`
- `titleBar.searchCancelled`

**Navigation:**

- `navigation.itemPressed` — `{ id }`
- `navigation.backPressed`

**Toolbar:**

- `toolbar.itemPressed` — `{ id }`
- `toolbar.menuItemPressed` — `{ id }`

**Keyboard:**

- `keyboard.itemPressed` — `{ id }`

**Sidebar:**

- `sidebarPanel.itemPressed` — `{ id }`

**Menu Bar:**

- `menuBar.itemPressed` — `{ id }`

**Child Webviews:**

- `sheet.leadingItemPressed` / `sheet.trailingItemPressed` — `{ id }`
- `sheet.presented` / `sheet.dismissed` — `{ name }`
- `sheet.detentChanged` — `{ name, detent }`
- `sheet.loadFailed` — `{ name, message, code }`
- `drawer.presented` / `drawer.dismissed` — `{ name }`
- `appWindow.presented` / `appWindow.dismissed` — `{ name }`
- `popover.presented` / `popover.dismissed` — `{ name }`

**System:**

- `safeArea.changed` — `{ top, right, bottom, left }`
- `message` — `{ from, payload }` (inter-webview messaging)

## Splash Screen

See [Splash Screen Control](./splash-screen.md) for full details.

### `chrome.splash.preventAutoHide()`

Prevents the splash screen from automatically hiding on page load. Call at the top level of your module.

### `chrome.splash.hide()`

Manually hides the splash screen.

```javascript
import { chrome } from "nativite/chrome";

chrome.splash.preventAutoHide();

// ... fetch data, check auth, etc.
chrome.splash.hide();
```

## Messaging

### `chrome.messaging.postToParent(payload)`

Send a message from a child webview (sheet, drawer, etc.) to the main webview.

### `chrome.messaging.postToChild(name, payload)`

Send a message from the main webview to a named child webview.

### `chrome.messaging.broadcast(payload)`

Send a message from any webview to all other webviews.

### `chrome.messaging.onMessage(handler)`

Subscribe to incoming messages:

```javascript
chrome.messaging.onMessage((from, payload) => {
  console.log(`Message from ${from}:`, payload);
});
```

`from` is `"main"` or the child webview's instance name.

## Native Transport

### iOS

Uses `webkit.messageHandlers.nativite.postMessage()` for outbound messages.

### Android

Uses a `WebMessagePort` transferred via `postMessage("__nativite_port__")`. The port is captured lazily on first use, and pending messages are queued until the port is available.

## State Flush Scheduling

State updates are coalesced via microtask scheduling:

```javascript
chrome(titleBar({ title: "A" }));
chrome(titleBar({ title: "B" }));
// Only one native message sent with title: "B"
```

This ensures synchronous React-like effect cleanup + reapply cycles result in a single native state update.
