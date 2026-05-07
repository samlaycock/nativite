# Native Chrome Layout Protocol (NCLP) v2

## Status

Draft

---

## Purpose

The Native Chrome Layout Protocol (NCLP) is a JSON-based wire protocol for describing native application chrome from an embedded runtime.

Typical use cases include:

- an embedded webview describing menus, tabs, toolbars, sidebars, title bars, and other host-owned chrome,
- a JavaScript runtime sending UI intent to a native host,
- any embedded runtime that can produce JSON-compatible values,
- any host platform capable of rendering native UI primitives.

NCLP is designed to be:

- declarative,
- portable across platforms,
- easy to validate,
- trivial to diff,
- simple to reconcile on the host,
- stable enough for snapshot- and patch-based transport,
- implementable by community hosts without access to Nativite internals.

NCLP is not a general-purpose UI framework. It is a protocol for describing host chrome around embedded content.

---

## Two-layer architecture

NCLP is the **wire protocol**, not the authoring format.

Developers author chrome using the Nativite JavaScript API:

```ts
chrome(
  titleBar({ title: "Inbox", trailingItems: [button({ id: "compose", label: "Compose" })] }),
  navigation({ items: [{ id: "inbox", label: "Inbox", icon: "tray.fill" }], activeItem: "inbox" }),
);
```

The `chrome()` callable internally compiles this to an NCLP snapshot before sending it over the transport. The host platform receives NCLP and renders it using whatever native primitives are appropriate for that platform.

This means:

- **Developers** interact only with the Nativite TypeScript API. NCLP is transparent to them.
- **Host implementors** (tvOS, visionOS, Firestick, Electron, etc.) interact only with NCLP. They do not need to understand Nativite internals.
- The compilation mapping is normative and versioned, so hosts can rely on it.

```
┌──────────────────────────────┐
│  Nativite JS API             │  Developer-facing
│  chrome(), titleBar(), etc.  │
└──────────────┬───────────────┘
               │  compile
               ▼
┌──────────────────────────────┐
│  NCLP wire messages          │  Protocol layer
│  chrome.snapshot / .patch    │
└──────────────┬───────────────┘
               │  transport
               ▼
┌──────────────────────────────┐
│  Host platform               │  Implementor-facing
│  iOS / tvOS / Firestick etc. │
└──────────────────────────────┘
```

---

## Design goals

### 1. Declarative structure

The embedded runtime describes the desired chrome state, not step-by-step UI commands.

### 2. Stable identity

Every meaningful UI node has a stable ID so the host can cheaply detect insertions, removals, moves, and updates.

### 3. Cheap diffing

The protocol is intentionally normalized so that a host can reconcile documents using shallow comparisons and ordered child lists, without a complex virtual DOM implementation.

### 4. Cross-platform intent

The protocol describes intent, not exact rendering. Hosts map protocol nodes onto native platform conventions. A `tabs` node may render as a bottom tab bar on mobile, a sidebar on iPad, or a focus-ring-navigable row of items on tvOS.

### 5. Strict core, flexible edges

The core schema is small and closed. Extensions are namespaced and isolated from core semantics.

### 6. Snapshot-first correctness

Full snapshots are the canonical representation. Patches are an optimization. Hosts that only implement snapshot ingestion are fully compliant.

### 7. Community implementable

A host on any platform — tvOS, visionOS, Firestick, Electron, Flutter — can implement the protocol using only this document and the JSON Schema. No Nativite source access required.

---

## Non-goals

NCLP v2 does not attempt to provide:

- arbitrary custom widgets,
- complex layout engines,
- pixel-perfect rendering,
- animation choreography,
- rich styling systems,
- embedded scripting,
- host-specific APIs in the core schema,
- a replacement for native app toolkits,
- a general-purpose RPC mechanism (bridge calls are separate).

---

## Terminology

**Embedded runtime** — The environment producing NCLP documents, such as a webview, JavaScript engine, or scripting runtime.

**Host** — The native application code receiving NCLP documents and rendering native chrome.

**Shell** — A complete host implementation for a specific platform (e.g. the Nativite iOS shell, a community tvOS shell).

**Document** — A complete description of the chrome state for a logical UI surface.

**Snapshot** — A full document representation. Always valid in isolation.

**Patch** — An incremental update against a previously accepted snapshot or patch revision.

**Node** — A single UI entity in the document graph.

**State bucket** — A map of dynamic values keyed by node ID, separated from structural node definitions.

**docId** — A string identifying a logical document stream. Typically `"main"` for the primary webview.

**Revision** — A monotonically increasing integer tracking document versions within a docId.

**ChromeState** — The Nativite TypeScript interface (`src/chrome/types.ts`) that the JS API compiles from.

---

## Transport model

NCLP defines document shapes and message semantics. It does not mandate a transport.

Supported transports include:

- `webkit.messageHandlers` + `evaluateJavaScript` (iOS / macOS / tvOS / visionOS)
- `WebMessagePort` transferred via `postMessage` (Android / web)
- WebSocket (dev tooling, remote inspection)
- stdin / stdout (test harnesses, CLI tools)
- In-memory function calls (embedding in the same process)

A conformant transport must preserve:

- JSON value fidelity,
- message ordering within a docId stream,
- monotonic revision semantics.

---

## Session lifecycle

A session begins when the host and runtime establish a transport connection. The handshake sequence is:

```
Host                          Runtime
  │                              │
  │── shell.ready ──────────────►│   Host advertises capabilities
  │                              │
  │◄── chrome.snapshot ─────────│   Runtime sends first full snapshot
  │                              │
  │       ... interaction ...    │
  │                              │
  │◄── chrome.patch ────────────│   Runtime sends incremental updates
  │                              │
  │── chrome.event ────────────►│   Host fires user interaction events
  │                              │
```

The runtime must not send `chrome.snapshot` or `chrome.patch` until it has received `shell.ready`.

The host must respond to each `shell.ready` with readiness for incoming snapshots. It does not send an acknowledgement message — the runtime infers readiness after sending `shell.ready`.

---

## Message types

All NCLP messages are JSON objects. Every message carries a `nativite` field set to the integer protocol version.

| Direction      | Type              | Description                                |
| -------------- | ----------------- | ------------------------------------------ |
| Host → Runtime | `shell.ready`     | Capabilities advertisement                 |
| Runtime → Host | `chrome.snapshot` | Full chrome state replacement              |
| Runtime → Host | `chrome.patch`    | Incremental chrome state update            |
| Host → Runtime | `chrome.event`    | User interaction from host-rendered chrome |

Bridge calls (capability plugins: camera, location, etc.) are a separate protocol and must not be mixed with NCLP messages.

---

## shell.ready

Sent by the host when the transport is established and the host is ready to receive chrome documents. Must be sent exactly once per session, before any `chrome.snapshot` or `chrome.patch` is received.

```json
{
  "nativite": 2,
  "type": "shell.ready",
  "platform": "tvos",
  "version": "1.0.0",
  "areas": ["titleBar", "navigation", "toolbar", "menuBar"],
  "ext": {}
}
```

### Fields

#### `nativite`

Integer. Required. Must equal `2` for this protocol version.

#### `type`

String. Required. Must equal `"shell.ready"`.

#### `platform`

String. Required. A short identifier for the host platform.

Suggested values: `"ios"`, `"ipad"`, `"macos"`, `"tvos"`, `"visionos"`, `"android"`, `"firestick"`, `"electron"`. Community shells may use any non-empty string.

#### `version`

String. Required. The shell implementation version, in any format the implementor chooses.

#### `areas`

Array of strings. Required. The set of `ChromeState` area names the host supports rendering.

Valid area names: `"titleBar"`, `"navigation"`, `"toolbar"`, `"sidebarPanel"`, `"statusBar"`, `"homeIndicator"`, `"keyboard"`, `"menuBar"`, `"tabBottomAccessory"`, `"sheets"`, `"drawers"`, `"appWindows"`, `"popovers"`.

The runtime should omit unsupported areas from compiled snapshots.

#### `ext`

Object. Optional. Namespaced extension data. See the extension model section.

---

## chrome.snapshot

Sent by the runtime to fully replace the current chrome state for a docId.

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

### Fields

#### `nativite`

Integer. Required. Must equal `2`.

#### `type`

String. Required. Must equal `"chrome.snapshot"`.

#### `docId`

String. Required. Identifies the logical document stream.

#### `revision`

Integer. Required. Must be greater than zero and greater than any previously accepted revision for the same docId.

#### `root`

String. Required. The ID of the root node.

#### `nodes`

Object. Required. Maps node IDs to node objects. See the node model section.

#### `state`

Object. Required. Dynamic state buckets. See the state model section.

---

## chrome.patch

Sent by the runtime to incrementally update the current chrome state for a docId.

```json
{
  "nativite": 2,
  "type": "chrome.patch",
  "docId": "main",
  "baseRevision": 3,
  "revision": 4,
  "ops": []
}
```

### Fields

#### `type`

String. Required. Must equal `"chrome.patch"`.

#### `docId`

String. Required.

#### `baseRevision`

Integer. Required. The patch applies only if the host currently holds this revision for the same docId.

#### `revision`

Integer. Required. The resulting revision after successful application. Must be greater than `baseRevision`.

#### `ops`

Array. Required. Ordered patch operations. See the patch model section.

---

## chrome.event

Sent by the host when the user interacts with host-rendered chrome.

```json
{
  "nativite": 2,
  "type": "chrome.event",
  "docId": "main",
  "event": "activate",
  "target": "compose",
  "value": null
}
```

### Fields

#### `type`

String. Required. Must equal `"chrome.event"`.

#### `docId`

String. Required.

#### `event`

String. Required. The interaction type. See the event model section.

#### `target`

String. Required. The node ID of the chrome element the user interacted with.

#### `value`

Any JSON value. Optional. Contextual payload for the event. See per-event semantics.

---

## Node model

Each node represents one semantic unit of host-rendered chrome.

### Base node shape

```json
{
  "id": "string",
  "kind": "string"
}
```

Every node must have an `id` and a `kind`. All other fields are optional unless stated.

### Common fields

```json
{
  "id": "compose",
  "kind": "action",
  "label": "Compose",
  "icon": "square.and.pencil",
  "role": "primary",
  "placement": "trailing",
  "presentation": "default",
  "accessibilityLabel": "Compose new message",
  "tooltip": "Compose",
  "meta": {},
  "ext": {}
}
```

#### `id`

String. Required. A stable identifier unique within the document. The embedded runtime owns node IDs. Hosts treat IDs as opaque strings.

#### `kind`

String. Required. Identifies the node type. See core kinds below.

#### `children`

Array of strings. Required for container kinds. Must not appear on leaf kinds. Contains ordered child node IDs.

#### `label`

String. Optional. Human-readable label for the element.

#### `icon`

String. Optional. An implementation-defined icon token. NCLP does not define a cross-platform icon vocabulary. The compilation mapping section documents how Nativite icon strings are passed through.

#### `role`

String. Optional. Semantic intent hint.

Defined values: `"primary"`, `"secondary"`, `"destructive"`, `"navigation"`, `"confirm"`, `"cancel"`.

Hosts may ignore unsupported roles.

#### `placement`

String. Optional. Intended placement within parent.

Defined values: `"leading"`, `"trailing"`, `"primary"`, `"secondary"`, `"top"`, `"bottom"`, `"sidebar"`, `"overflow"`.

#### `presentation`

String. Optional. Presentation hint.

Defined values: `"default"`, `"compact"`, `"prominent"`, `"subtle"`.

#### `accessibilityLabel`

String. Optional. Explicit label for assistive technologies.

#### `tooltip`

String. Optional. Short help text where supported by the platform.

#### `meta`

Object. Optional. Opaque key-value metadata for runtime–host agreement. Hosts must not assign core semantics to `meta`. The compilation mapping section documents which Nativite-specific values are placed here.

#### `ext`

Object. Optional. Namespaced extension map. See the extension model section.

---

### Core container kinds

#### `window`

Top-level chrome container. Usually the root node.

#### `titleBar`

Title bar or navigation bar region. Contains title, leading items, and trailing items as children.

#### `toolbar`

Ordered set of actions and related items. On mobile, typically rendered as a bottom bar.

#### `tabs`

A set of tabs with a single selected child. On mobile, renders as a tab bar. On desktop or TV, may render as a segmented control or sidebar.

#### `sidebar`

A sidebar navigation or utility panel.

#### `menuBar`

Ordered collection of top-level menus. Intended for OS-level or app-level menu bars on desktop platforms. Ignored on platforms without a menu bar.

#### `menu`

An expandable menu container. Children are `action`, `item`, `separator`, `section`, or `group`.

#### `section`

Logical grouping of related children within a container.

#### `group`

Generic grouping container. Used for toolbar item groups with a shared placement.

#### `keyboard`

Keyboard accessory bar. Rendered above the software keyboard when visible. Ignored on platforms without a software keyboard.

#### `stack`

A logical stack of navigation layers.

#### `split`

A split-view container. Implementors may restrict valid child counts.

---

### Core leaf kinds

#### `tab`

A selectable tab item. Must not declare children.

#### `action`

An actionable control: a button, toolbar item, or menu command. Must not declare children.

#### `item`

A generic selectable item. Must not declare children.

#### `title`

A text title element. Must not declare children.

#### `search`

A search field affordance. Must not declare children.

#### `separator`

A visual separator. Must not declare children.

#### `spacer`

A flexible or fixed spacer. Must not declare children. A `meta.fixed` boolean and `meta.width` number may be set to indicate a fixed-width spacer.

#### `statusBar`

System status bar configuration. Leaf. Hosts that do not own the status bar should ignore this node.

#### `homeIndicator`

Home indicator / system gesture bar configuration. Leaf. Ignored on platforms without a home indicator.

---

### Kind constraints

Hosts should enforce minimal kind constraints:

- `tabs.children` should contain `tab` nodes.
- `menuBar.children` should contain `menu` nodes.
- `menu.children` should contain `action`, `item`, `separator`, `section`, or `group`.
- `toolbar.children` should contain `action`, `search`, `spacer`, `separator`, or `group`.
- `titleBar.children` should contain `title`, `action`, `search`, `spacer`, or `separator`.
- `keyboard.children` should contain `action`, `spacer`, or `separator`.
- Leaf kinds must not declare `children`.

Hosts may warn on semantically unusual structures but should still accept them where safe.

---

## State model

NCLP separates stable structure (nodes) from dynamic state (state buckets). Dynamic values that change frequently — selection, badges, disabled flags — belong in state buckets, not in node fields. This enables `chrome.patch` to update only state without re-sending structural nodes.

### Core state buckets

#### `selected`

Map from container node ID to the selected child node ID.

```json
{ "selected": { "tabs": "search" } }
```

#### `disabled`

Map from node ID to boolean.

```json
{ "disabled": { "compose": true } }
```

#### `hidden`

Map from node ID to boolean.

```json
{ "hidden": { "advanced": true } }
```

#### `badges`

Map from node ID to string or number. Serialize as string for maximum portability.

```json
{ "badges": { "inbox-tab": "12" } }
```

#### `values`

Map from node ID to any JSON-compatible value. For dynamic values that do not fit a more specific bucket.

```json
{ "values": { "search-field": "cats" } }
```

### State invariants

1. `selected[id]` should reference one of the container's current children.
2. `disabled[id]` values must be booleans.
3. `hidden[id]` values must be booleans.
4. Badge values should be short display strings or numbers.

Hosts may accept inconsistent state but should either normalize or ignore invalid entries.

---

## Document invariants

A valid NCLP snapshot must satisfy:

1. `type` equals `"chrome.snapshot"`.
2. `nativite` equals a supported protocol version.
3. `docId` is non-empty.
4. `revision` is a positive integer.
5. `root` references an existing node in `nodes`.
6. Every key in `nodes` equals that node's `id`.
7. Node IDs are unique within the document.
8. Every ID in a node's `children` references an existing node.
9. The node graph is acyclic.
10. Leaf kinds do not declare `children`.
11. Container kinds declare `children`, even if empty.

Hosts should reject malformed snapshots rather than partially applying them.

---

## ChromeState → NCLP compilation mapping

This section is normative. It defines how the Nativite JavaScript `ChromeState` compiles to an NCLP document. Host implementors should use this mapping to understand the document structure they will receive.

The compiled document always has a root node of kind `window` with ID `"root"`. Area nodes are direct children of root, in the order: `titleBar`, `navigation` (tabs/sidebar), `sidebarPanel`, `toolbar`, `keyboard`, `menuBar`, `statusBar`, `homeIndicator`, `tabBottomAccessory`, then any child webview areas.

Only areas present in the `ChromeState` and supported by the host (per `shell.ready areas`) are included.

---

### titleBar

Source: `TitleBarConfig`

Compiles to a `titleBar` container node. Its children are:

1. A `title` node (always present, even if `TitleBarConfig.title` is undefined).
2. Leading `BarItem` nodes (from `leadingItems`), with `placement: "leading"`.
3. Trailing `BarItem` nodes (from `trailingItems`), with `placement: "trailing"`.
4. A `search` node if `searchBar` is set.

#### title node

```json
{
  "id": "titleBar:title",
  "kind": "title",
  "label": "<TitleBarConfig.title>",
  "meta": {
    "subtitle": "<TitleBarConfig.subtitle | null>",
    "largeTitleMode": "<TitleBarConfig.largeTitleMode | null>",
    "backLabel": "<TitleBarConfig.backLabel | null>",
    "tint": "<TitleBarConfig.tint | null>",
    "fullSizeContent": "<TitleBarConfig.fullSizeContent | null>",
    "separatorStyle": "<TitleBarConfig.separatorStyle | null>"
  }
}
```

`hidden` state bucket: `{ "titleBar": true }` when `TitleBarConfig.hidden` is true.

#### BarItem nodes under titleBar

Each `BarItem` compiles to a node. Node IDs are scoped: `"titleBar:leading:<item.id>"` or `"titleBar:trailing:<item.id>"`.

**ButtonItem:**

```json
{
  "id": "titleBar:trailing:compose",
  "kind": "action",
  "label": "<item.label>",
  "icon": "<item.icon>",
  "role": "<mapped from item.style>",
  "placement": "trailing",
  "meta": {
    "tint": "<item.tint | null>",
    "badge": "<item.badge | null>",
    "customization": "<item.customization | null>"
  }
}
```

`style` → `role` mapping:

- `"primary"` → `"primary"`
- `"destructive"` → `"destructive"`
- `"plain"` or absent → omit role

`disabled` state bucket: `{ "titleBar:trailing:compose": true }` when `item.disabled` is true.

**ButtonItem with menu:**

When `ButtonItem.menu` is set, the action node has `children` listing the menu item IDs, and the `menu` node is included in the document:

```json
{
  "id": "titleBar:trailing:more",
  "kind": "action",
  "label": "More",
  "placement": "trailing",
  "children": ["titleBar:trailing:more:menu"]
},
{
  "id": "titleBar:trailing:more:menu",
  "kind": "menu",
  "label": "<menu.title | null>",
  "children": ["titleBar:trailing:more:menu:share", "titleBar:trailing:more:menu:delete"]
},
{
  "id": "titleBar:trailing:more:menu:share",
  "kind": "action",
  "label": "Share"
},
{
  "id": "titleBar:trailing:more:menu:delete",
  "kind": "action",
  "label": "Delete",
  "role": "destructive"
}
```

**FlexibleSpace:**

```json
{ "id": "titleBar:trailing:space-<index>", "kind": "spacer", "placement": "trailing" }
```

**FixedSpace:**

```json
{
  "id": "titleBar:trailing:space-<index>",
  "kind": "spacer",
  "placement": "trailing",
  "meta": { "fixed": true, "width": <item.width> }
}
```

#### search node under titleBar

When `TitleBarConfig.searchBar` is set:

```json
{
  "id": "titleBar:search",
  "kind": "search",
  "meta": {
    "placeholder": "<searchBar.placeholder | null>",
    "cancelButtonVisible": "<searchBar.cancelButtonVisible | null>"
  }
}
```

`values` state bucket: `{ "titleBar:search": "<searchBar.value>" }` when `searchBar.value` is set.

---

### navigation

Source: `NavigationConfig`

Compiles to either a `tabs` or `sidebar` container node with ID `"navigation"`, depending on `NavigationConfig.style`:

- `"tabs"` → `kind: "tabs"`
- `"sidebar"` → `kind: "sidebar"`
- `"auto"` or absent → `kind: "tabs"` (the host decides the visual treatment)

`meta.style` is always set to the original string value so hosts can apply platform-specific logic.

```json
{
  "id": "navigation",
  "kind": "tabs",
  "children": ["navigation:inbox", "navigation:search"],
  "meta": {
    "style": "auto",
    "minimizeBehavior": "<NavigationConfig.minimizeBehavior | null>"
  }
}
```

`hidden` state bucket: `{ "navigation": true }` when `NavigationConfig.hidden` is true.

#### NavigationItem nodes

Each `NavigationItem` compiles to a `tab` node:

```json
{
  "id": "navigation:inbox",
  "kind": "tab",
  "label": "Inbox",
  "icon": "tray.fill",
  "meta": {
    "subtitle": "<item.subtitle | null>",
    "role": "<item.role | null>"
  }
}
```

`selected` state bucket: `{ "navigation": "navigation:<activeItem>" }` when `activeItem` is set.

`disabled` state bucket: `{ "navigation:inbox": true }` when `item.disabled` is true.

`badges` state bucket: `{ "navigation:inbox": "<item.badge>" }` when `item.badge` is set.

#### search node under navigation

When `NavigationConfig.searchBar` is set and one of the items has `role: "search"`:

```json
{
  "id": "navigation:search-field",
  "kind": "search",
  "meta": {
    "placeholder": "<searchBar.placeholder | null>",
    "cancelButtonVisible": "<searchBar.cancelButtonVisible | null>"
  }
}
```

This node is a child of the corresponding `tab` node with `role: "search"`.

---

### toolbar

Source: `ToolbarConfig`

Compiles to a `toolbar` container node with ID `"toolbar"`.

When `ToolbarConfig.items` is set (flat list):

```json
{
  "id": "toolbar",
  "kind": "toolbar",
  "children": ["toolbar:filter", "toolbar:sort"]
}
```

When `ToolbarConfig.groups` is set:

```json
{
  "id": "toolbar",
  "kind": "toolbar",
  "children": ["toolbar:group-navigation", "toolbar:group-primary"]
}
```

Each group compiles to a `group` node:

```json
{
  "id": "toolbar:group-primary",
  "kind": "group",
  "placement": "<group.placement>",
  "children": ["toolbar:filter"]
}
```

`BarItem` nodes under toolbar follow the same rules as under `titleBar`, with IDs scoped to `"toolbar:<item.id>"` for flat items and `"toolbar:group-<placement>:<item.id>"` for grouped items.

`hidden` state bucket: `{ "toolbar": true }` when `ToolbarConfig.hidden` is true.

`meta` on the toolbar node:

```json
{
  "meta": {
    "customizable": "<ToolbarConfig.customizable | null>",
    "toolbarId": "<ToolbarConfig.id | null>",
    "displayMode": "<ToolbarConfig.displayMode | null>",
    "toolbarStyle": "<ToolbarConfig.toolbarStyle | null>"
  }
}
```

---

### sidebarPanel

Source: `SidebarPanelConfig`

Compiles to a `sidebar` container node with ID `"sidebarPanel"`.

```json
{
  "id": "sidebarPanel",
  "kind": "sidebar",
  "label": "<SidebarPanelConfig.title | null>",
  "children": ["sidebarPanel:home", "sidebarPanel:search"]
}
```

`hidden` state bucket: `{ "sidebarPanel": false }` mapped from `SidebarPanelConfig.visible`.

Each `SidebarItem` compiles to an `item` node:

```json
{
  "id": "sidebarPanel:home",
  "kind": "item",
  "label": "Home",
  "icon": "<item.icon | null>"
}
```

Child `SidebarItem` nodes compile to a `section` under the parent item:

```json
{
  "id": "sidebarPanel:home",
  "kind": "item",
  "label": "Home",
  "children": ["sidebarPanel:home:sub-item"]
},
{
  "id": "sidebarPanel:home:sub-item",
  "kind": "item",
  "label": "Sub-item"
}
```

`selected` state bucket: `{ "sidebarPanel": "sidebarPanel:<activeItem>" }` when `activeItem` is set.

`badges` state bucket: `{ "sidebarPanel:home": "<item.badge>" }` when `item.badge` is set.

---

### statusBar

Source: `StatusBarConfig`

Compiles to a `statusBar` leaf node with ID `"statusBar"`.

```json
{
  "id": "statusBar",
  "kind": "statusBar",
  "meta": {
    "style": "<StatusBarConfig.style | null>"
  }
}
```

`hidden` state bucket: `{ "statusBar": true }` when `StatusBarConfig.hidden` is true.

---

### homeIndicator

Source: `HomeIndicatorConfig`

Compiles to a `homeIndicator` leaf node with ID `"homeIndicator"`.

```json
{
  "id": "homeIndicator",
  "kind": "homeIndicator"
}
```

`hidden` state bucket: `{ "homeIndicator": true }` when `HomeIndicatorConfig.hidden` is true.

---

### keyboard

Source: `KeyboardConfig`

Compiles to a `keyboard` container node with ID `"keyboard"`.

```json
{
  "id": "keyboard",
  "kind": "keyboard",
  "children": ["keyboard:done", "keyboard:space"],
  "meta": {
    "dismissMode": "<KeyboardConfig.dismissMode | null>"
  }
}
```

`KeyboardConfig.accessory.items` compile as `BarItem` nodes scoped to `"keyboard:<item.id>"`, following the same rules as toolbar items.

When `KeyboardConfig.accessory` is `null`, the keyboard node has no children and the host should remove any existing accessory.

---

### menuBar

Source: `MenuBarConfig`

Compiles to a `menuBar` container node with ID `"menuBar"`.

```json
{
  "id": "menuBar",
  "kind": "menuBar",
  "children": ["menuBar:file", "menuBar:edit"]
}
```

Each menu compiles to a `menu` node:

```json
{
  "id": "menuBar:file",
  "kind": "menu",
  "label": "File",
  "children": ["menuBar:file:new", "menuBar:file:open"]
}
```

Each `MenuItem` compiles to an `action` node:

```json
{
  "id": "menuBar:file:new",
  "kind": "action",
  "label": "New",
  "icon": "<item.icon | null>",
  "role": "<mapped from item.style>",
  "meta": {
    "checked": "<item.checked | null>",
    "keyEquivalent": "<item.keyEquivalent | null>"
  }
}
```

Nested `MenuItem.children` compile to a child `menu` node under the parent `action` (which then becomes a container kind for this case only).

`disabled` state bucket: `{ "menuBar:file:new": true }` when `item.disabled` is true.

---

### tabBottomAccessory

Source: `TabBottomAccessoryConfig`

Compiles to a node with ID `"tabBottomAccessory"` and kind `"window"`.

```json
{
  "id": "tabBottomAccessory",
  "kind": "window",
  "meta": {
    "url": "<TabBottomAccessoryConfig.url>",
    "backgroundColor": "<TabBottomAccessoryConfig.backgroundColor | null>"
  }
}
```

`hidden` state bucket: `{ "tabBottomAccessory": true }` when `TabBottomAccessoryConfig.presented` is false.

---

### sheets, drawers, appWindows, popovers

Source: `ChromeState.sheets`, `.drawers`, `.appWindows`, `.popovers`

Child webview areas compile to nodes under a container node for each collection type. IDs are scoped by name.

**sheets:**

```json
{
  "id": "sheets",
  "kind": "group",
  "children": ["sheets:settings"]
},
{
  "id": "sheets:settings",
  "kind": "window",
  "meta": {
    "url": "<SheetConfig.url>",
    "backgroundColor": "<SheetConfig.backgroundColor | null>",
    "detents": "<SheetConfig.detents | null>",
    "activeDetent": "<SheetConfig.activeDetent | null>",
    "grabberVisible": "<SheetConfig.grabberVisible | null>",
    "dismissible": "<SheetConfig.dismissible | null>",
    "cornerRadius": "<SheetConfig.cornerRadius | null>"
  }
}
```

`hidden` state bucket: `{ "sheets:settings": true }` when `SheetConfig.presented` is false.

**drawers**, **appWindows**, and **popovers** follow the same pattern, with IDs `"drawers:<name>"`, `"appWindows:<name>"`, `"popovers:<name>"` and their respective config fields in `meta`.

---

### ID stability rules

The compilation must produce stable IDs across invocations. The same `ChromeState` area and item produces the same node ID. IDs must not be derived from array position alone.

Rule: node IDs are `"<area>:<scope>:<item.id>"` where scope is omitted at the top level, and `item.id` comes from the user-provided identifier.

For anonymous nodes (title, search, spacers): use deterministic suffixes based on area and type, e.g. `"titleBar:title"`, `"titleBar:leading:space-0"`.

---

## Snapshot semantics

### Host behavior on receiving a snapshot

1. If no prior document exists for `docId`, adopt it.
2. If `revision` is less than or equal to the current revision, ignore the snapshot.
3. If `revision` is greater than the current revision, reconcile.

A host may choose:

- **Atomic replacement**: discard all current state and re-render from scratch.
- **Incremental reconciliation**: diff the new snapshot against current state and update only what changed. Recommended.

### Reconciliation algorithm

For hosts that implement incremental reconciliation:

1. Diff node ID sets: find removed, added, and common node IDs.
2. Remove deleted nodes from render state.
3. Create new nodes.
4. For each common node: shallow-compare props; update only changed fields.
5. For each container: compare `children` arrays by ID; detect inserts, removals, and moves.
6. Diff each state bucket: apply selection, disabled, hidden, badge, and value changes.

The protocol is designed so that:

- Map diff handles node existence.
- Shallow diff handles node field updates.
- Ordered list diff handles child movement.
- State bucket diff handles dynamic state.

No deep tree traversal is needed.

---

## Patch model

Patches are an optimization. Hosts that only implement snapshot ingestion are fully compliant.

A patch applies an ordered list of operations against a known base revision.

### Patch application rules

A host must apply a patch only if:

- it holds the `docId`,
- it currently holds `baseRevision` for that docId,
- all operations are valid,
- applying the operations does not violate core document invariants.

If any condition fails, the host must reject the patch and await a fresh snapshot. Hosts must not attempt heuristic merges.

### Operations

#### `put-node`

Adds or fully replaces a node.

```json
{ "op": "put-node", "node": { "id": "settings-tab", "kind": "tab", "label": "Settings" } }
```

Use `set-props` for partial updates. Reserve `put-node` for creation or complete replacement.

#### `remove-node`

Removes a node by ID. The host must also remove any `children` references to this node.

```json
{ "op": "remove-node", "id": "legacy-tab" }
```

#### `set-children`

Replaces the ordered child list of a container node. All child IDs must exist after patch application.

```json
{ "op": "set-children", "id": "tabs", "children": ["home", "search", "settings-tab"] }
```

#### `set-props`

Shallow-merges mutable fields onto a node. `id` and `kind` are immutable and must not appear in `props`.

```json
{ "op": "set-props", "id": "compose", "props": { "label": "New Message" } }
```

#### `set-state`

Sets or replaces a single value in a state bucket.

```json
{ "op": "set-state", "bucket": "selected", "key": "navigation", "value": "navigation:search" }
```

#### `remove-state`

Removes a single value from a state bucket. No error if absent.

```json
{ "op": "remove-state", "bucket": "badges", "key": "navigation:inbox" }
```

### Patch ordering

Operations are applied in array order. This allows:

1. Create a new node (`put-node`).
2. Attach it to a parent (`set-children`).
3. Update selection state (`set-state`).

---

## Event model

Hosts fire `chrome.event` messages when users interact with host-rendered chrome.

### Core event names

#### `activate`

Fired when an action-like node is activated (button tap, menu item selection, keyboard item tap).

```json
{ "event": "activate", "target": "compose", "value": null }
```

#### `select`

Fired when a selectable container changes selection.

```json
{ "event": "select", "target": "navigation", "value": "navigation:search" }
```

`value` is the newly selected child node ID.

#### `back`

Fired when a back/up navigation gesture occurs.

```json
{ "event": "back", "target": "titleBar" }
```

`target` is `"titleBar"` for title bar back, `"navigation"` for navigation-level back.

#### `input`

Fired when a value-bearing control (search field) changes.

```json
{ "event": "input", "target": "titleBar:search", "value": "hello" }
```

#### `submit`

Fired when a search or similar input is submitted.

```json
{ "event": "submit", "target": "titleBar:search", "value": "hello" }
```

#### `cancel`

Fired when a search or similar input is cancelled.

```json
{ "event": "cancel", "target": "titleBar:search", "value": null }
```

#### `open`

Fired when a sheet, drawer, app window, or popover is presented.

```json
{ "event": "open", "target": "sheets:settings", "value": null }
```

#### `close`

Fired when a sheet, drawer, app window, or popover is dismissed.

```json
{ "event": "close", "target": "sheets:settings", "value": null }
```

#### `detent`

Fired when a sheet's active detent changes.

```json
{ "event": "detent", "target": "sheets:settings", "value": "medium" }
```

#### `error`

Fired when a child webview fails to load.

```json
{ "event": "error", "target": "sheets:settings", "value": { "message": "Not found", "code": 404 } }
```

---

## Event → ChromeEvent mapping

The Nativite runtime maps incoming `chrome.event` messages to typed `ChromeEvent` values for `chrome.on()` handlers. This mapping is normative.

Hosts do not need to produce `ChromeEvent`-style strings — they only fire the generic events above. The mapping is performed in the runtime.

| NCLP event | target prefix        | ChromeEvent type                |
| ---------- | -------------------- | ------------------------------- |
| `activate` | `titleBar:leading:`  | `titleBar.leadingItemPressed`   |
| `activate` | `titleBar:trailing:` | `titleBar.trailingItemPressed`  |
| `activate` | `titleBar:*:menu:`   | `titleBar.menuItemPressed`      |
| `back`     | `titleBar`           | `titleBar.backPressed`          |
| `input`    | `titleBar:search`    | `titleBar.searchChanged`        |
| `submit`   | `titleBar:search`    | `titleBar.searchSubmitted`      |
| `cancel`   | `titleBar:search`    | `titleBar.searchCancelled`      |
| `back`     | `navigation`         | `navigation.backPressed`        |
| `select`   | `navigation`         | `navigation.itemPressed`        |
| `input`    | `navigation:*`       | `navigation.searchChanged`      |
| `submit`   | `navigation:*`       | `navigation.searchSubmitted`    |
| `cancel`   | `navigation:*`       | `navigation.searchCancelled`    |
| `activate` | `sidebarPanel:`      | `sidebarPanel.itemPressed`      |
| `activate` | `toolbar:`           | `toolbar.itemPressed`           |
| `activate` | `toolbar:*:menu:`    | `toolbar.menuItemPressed`       |
| `activate` | `keyboard:`          | `keyboard.itemPressed`          |
| `activate` | `menuBar:`           | `menuBar.itemPressed`           |
| `open`     | `sheets:`            | `sheet.presented`               |
| `close`    | `sheets:`            | `sheet.dismissed`               |
| `detent`   | `sheets:`            | `sheet.detentChanged`           |
| `error`    | `sheets:`            | `sheet.loadFailed`              |
| `open`     | `drawers:`           | `drawer.presented`              |
| `close`    | `drawers:`           | `drawer.dismissed`              |
| `open`     | `appWindows:`        | `appWindow.presented`           |
| `close`    | `appWindows:`        | `appWindow.dismissed`           |
| `open`     | `popovers:`          | `popover.presented`             |
| `close`    | `popovers:`          | `popover.dismissed`             |
| `open`     | `tabBottomAccessory` | `tabBottomAccessory.presented`  |
| `close`    | `tabBottomAccessory` | `tabBottomAccessory.dismissed`  |
| `error`    | `tabBottomAccessory` | `tabBottomAccessory.loadFailed` |

The `id` field in the resulting `ChromeEvent` is the last path component of the NCLP target, e.g. `"titleBar:trailing:compose"` → `id: "compose"`.

The `name` field for sheet/drawer/window/popover events is the last path component of the target, e.g. `"sheets:settings"` → `name: "settings"`.

---

## Extension model

NCLP allows host-specific extensions via a namespaced `ext` field on nodes and envelopes.

```json
{
  "id": "navigation",
  "kind": "tabs",
  "children": ["home", "search"],
  "ext": {
    "com.apple.tvos": {
      "focusGroupIdentifier": "main-tabs"
    },
    "com.amazon.firestick": {
      "dpadWrapAround": true
    }
  }
}
```

### Rules

1. Extension keys must be globally namespaced strings (reverse-DNS recommended).
2. Hosts that do not recognize an extension must ignore it.
3. Extensions must not redefine core field semantics.
4. Core interoperability must not depend on extensions.
5. The Nativite compilation layer may include `"com.nativite.*"` extensions for first-party hints.

---

## Error handling

### Validation modes

**Strict mode** — Reject malformed snapshots or patches entirely. Recommended for development.

**Lenient mode** — Ignore unknown non-core fields and unsupported hints, but reject violations of core invariants. Recommended for production.

### Must-reject conditions

Hosts must reject when:

- required envelope fields are missing,
- `nativite` version is unsupported,
- node IDs are duplicated,
- the graph is cyclic,
- `root` is missing from `nodes`,
- a `children` entry references a nonexistent node,
- a patch `baseRevision` does not match the host's current revision,
- node kinds violate structural rules in an unrecoverable way.

### Patch mismatch behavior

If a patch cannot be applied (revision mismatch, invalid ops), the host must:

1. Reject the patch.
2. Signal to the runtime that a full snapshot is needed.
3. Not attempt partial application.

The runtime must respond with a `chrome.snapshot` at the next revision.

---

## Security considerations

Hosts must treat all NCLP documents as untrusted input.

### Hosts should

- validate all inputs against this specification,
- cap document size (recommended: 1 MB per snapshot),
- cap node count (recommended: 500 nodes per document),
- cap children array length per node (recommended: 200),
- reject pathological graphs (deep nesting, very large patches),
- guard against extension abuse,
- never execute arbitrary code derived from document contents,
- treat `meta` and `ext` as data, not instructions.

### Embedded runtimes should not assume

- all hints will be honored,
- all node kinds will render identically across platforms,
- host extensions will exist,
- events will be fired for every interaction (accessibility shortcuts may bypass normal event paths).

---

## Performance considerations

- Use full snapshots as the canonical representation. Prefer correctness over efficiency.
- Use patches only when you can guarantee correct base revision tracking.
- Keep node objects shallow. Avoid embedding large blobs in `meta`.
- Keep IDs stable across renders. Avoid generating new IDs for reordered items.
- Place frequently changing values (selection, badges) in state buckets so patches target only the state op rather than re-sending structural nodes.
- Batch related updates into a single patch where practical.

---

## Interoperability requirements

A **fully conformant** implementation supports:

- `shell.ready` advertisement,
- `chrome.snapshot` ingestion,
- all core node kinds,
- all core state buckets,
- `activate` and `select` events,
- stable revision handling.

A **minimal conformant** implementation may:

- ignore unsupported presentation hints,
- ignore unknown extensions,
- omit optional event names (`back`, `input`, `submit`, `cancel`, `detent`, `error`),
- ignore unsupported area nodes (status bar, home indicator, menus),
- omit patch support entirely (snapshot-only).

A minimal implementation must not:

- send events with incorrect target IDs,
- send events for areas not in its `shell.ready areas` list,
- accept snapshots with revision less than or equal to the current revision.

---

## Example: session open and first snapshot

**Host sends:**

```json
{
  "nativite": 2,
  "type": "shell.ready",
  "platform": "tvos",
  "version": "0.1.0",
  "areas": ["titleBar", "navigation", "toolbar"],
  "ext": {
    "com.apple.tvos": { "focusEngine": "uikit" }
  }
}
```

**Runtime sends:**

```json
{
  "nativite": 2,
  "type": "chrome.snapshot",
  "docId": "main",
  "revision": 1,
  "root": "root",
  "nodes": {
    "root": {
      "id": "root",
      "kind": "window",
      "children": ["titleBar", "navigation", "toolbar"]
    },
    "titleBar": {
      "id": "titleBar",
      "kind": "titleBar",
      "children": ["titleBar:title", "titleBar:trailing:compose"]
    },
    "titleBar:title": {
      "id": "titleBar:title",
      "kind": "title",
      "label": "Inbox",
      "meta": { "subtitle": null, "largeTitleMode": null, "backLabel": null, "tint": null }
    },
    "titleBar:trailing:compose": {
      "id": "titleBar:trailing:compose",
      "kind": "action",
      "label": "Compose",
      "icon": "square.and.pencil",
      "role": "primary",
      "placement": "trailing",
      "meta": { "tint": null, "badge": null }
    },
    "navigation": {
      "id": "navigation",
      "kind": "tabs",
      "children": ["navigation:inbox", "navigation:search"],
      "meta": { "style": "auto", "minimizeBehavior": null }
    },
    "navigation:inbox": {
      "id": "navigation:inbox",
      "kind": "tab",
      "label": "Inbox",
      "icon": "tray.fill",
      "meta": { "subtitle": null, "role": null }
    },
    "navigation:search": {
      "id": "navigation:search",
      "kind": "tab",
      "label": "Search",
      "icon": "magnifyingglass",
      "meta": { "subtitle": null, "role": "search" }
    },
    "toolbar": {
      "id": "toolbar",
      "kind": "toolbar",
      "children": ["toolbar:filter"],
      "meta": { "customizable": null, "toolbarId": null, "displayMode": null, "toolbarStyle": null }
    },
    "toolbar:filter": {
      "id": "toolbar:filter",
      "kind": "action",
      "label": "Filter",
      "meta": { "tint": null, "badge": null }
    }
  },
  "state": {
    "selected": { "navigation": "navigation:inbox" },
    "disabled": {},
    "hidden": {},
    "badges": { "navigation:inbox": "12" },
    "values": {}
  }
}
```

---

## Example: state-only patch (tab selection change)

```json
{
  "nativite": 2,
  "type": "chrome.patch",
  "docId": "main",
  "baseRevision": 1,
  "revision": 2,
  "ops": [
    { "op": "set-state", "bucket": "selected", "key": "navigation", "value": "navigation:search" },
    { "op": "remove-state", "bucket": "badges", "key": "navigation:inbox" }
  ]
}
```

---

## Example: structural patch (add a tab)

```json
{
  "nativite": 2,
  "type": "chrome.patch",
  "docId": "main",
  "baseRevision": 2,
  "revision": 3,
  "ops": [
    {
      "op": "put-node",
      "node": {
        "id": "navigation:settings",
        "kind": "tab",
        "label": "Settings",
        "icon": "gear",
        "meta": { "subtitle": null, "role": null }
      }
    },
    {
      "op": "set-children",
      "id": "navigation",
      "children": ["navigation:inbox", "navigation:search", "navigation:settings"]
    }
  ]
}
```

---

## Example: host fires an event

User taps the compose button:

```json
{
  "nativite": 2,
  "type": "chrome.event",
  "docId": "main",
  "event": "activate",
  "target": "titleBar:trailing:compose",
  "value": null
}
```

Runtime maps to `ChromeEvent`: `{ type: "titleBar.trailingItemPressed", id: "compose" }`.

User changes tab:

```json
{
  "nativite": 2,
  "type": "chrome.event",
  "docId": "main",
  "event": "select",
  "target": "navigation",
  "value": "navigation:search"
}
```

Runtime maps to `ChromeEvent`: `{ type: "navigation.itemPressed", id: "search" }`.

---

## Suggested future extensions

- Standard icon vocabulary.
- Richer `search` field semantics (scope buttons, tokens).
- Capability versioning (minor versions for individual areas).
- Runtime acknowledgement of `shell.ready` with a `runtime.ready` response.
- Host-to-runtime snapshot request message (`shell.resync`).
- Standard extension namespaces for well-known community platforms.

These are out of scope for v2.
