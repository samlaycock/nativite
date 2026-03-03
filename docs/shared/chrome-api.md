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

Named areas (sheets, drawers, etc.) are grouped under plural keys in the state (`sheets`, `drawers`, `appWindows`, `popovers`).

### Item Constructors

Identity wrappers that provide type inference:

```javascript
import { button, navItem, menuItem } from "nativite/chrome";

button({ id: "save", label: "Save", icon: "square.and.arrow.down" });
navItem({ id: "home", label: "Home", icon: "house.fill" });
menuItem({ id: "copy", label: "Copy", keyEquivalent: "c" });
```

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

## Test Helpers

For unit testing chrome behaviour:

- `_handleIncoming(event)` — Simulate native event delivery
- `_resetChromeState()` — Clear all state, listeners, and layers
- `_drainFlush()` — Synchronously flush pending state
