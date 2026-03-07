# Native Chrome Layout Protocol (NCLP) v1

## Status

Draft

## Purpose

The Native Chrome Layout Protocol (NCLP) is a JSON-based protocol for describing native application chrome from an embedded runtime.

Typical use cases include:

- an embedded webview describing menus, tabs, toolbars, sidebars, title bars, and other host-owned chrome,
- a JavaScript runtime sending UI intent to a native host,
- any embedded runtime that can produce JSON or JSON-compatible values,
- any host platform capable of rendering native UI primitives.

NCLP is designed to be:

- declarative,
- portable across platforms,
- easy to validate,
- trivial to diff,
- simple to reconcile on the host,
- stable enough for snapshot- and patch-based transport.

NCLP is not a general-purpose UI framework. It is a protocol for describing host chrome around embedded content.

---

## Design goals

NCLP v1 prioritizes the following:

### 1. Declarative structure

The embedded runtime describes the desired chrome state, not step-by-step UI commands.

### 2. Stable identity

Every meaningful UI node has a stable ID so the host can cheaply detect insertions, removals, moves, and updates.

### 3. Cheap diffing

The protocol is intentionally normalized so that a host can reconcile documents using shallow comparisons and ordered child lists, without a complex virtual DOM implementation.

### 4. Cross-platform intent

The protocol describes intent, not exact rendering. Hosts map protocol nodes onto native platform conventions.

### 5. Strict core, flexible edges

The core schema is small and closed. Extensions are allowed, but isolated.

### 6. Snapshot-first correctness

Full snapshots are the canonical representation. Patches are an optimization.

---

## Non-goals

NCLP v1 does not attempt to provide:

- arbitrary custom widgets,
- complex layout engines,
- pixel-perfect rendering,
- animation choreography,
- rich styling systems,
- embedded scripting,
- host-specific APIs in the core schema,
- a replacement for native app toolkits.

If a feature pushes NCLP toward becoming a generic UI DSL, it is out of scope for v1.

---

## Terminology

### Embedded runtime

The environment producing NCLP documents, such as a webview, JavaScript engine, scripting runtime, or other sandboxed process.

### Host

The native application code receiving NCLP documents and rendering native chrome.

### Document

A complete description of the chrome state for a logical host-owned UI surface.

### Snapshot

A full document representation.

### Patch

An incremental update against a previously accepted snapshot or patch revision.

### Node

A single UI entity in the document graph.

### State bucket

A map of dynamic values keyed by node ID.

---

## Transport model

NCLP defines document shapes and patch semantics. It does not mandate a transport.

Possible transports include:

- JavaScript-to-native bridge messages,
- postMessage-style channels,
- IPC,
- WebSocket,
- stdin/stdout,
- in-memory host APIs.

A valid NCLP implementation must preserve:

- JSON value fidelity,
- message ordering within a document stream,
- monotonic revision semantics.

---

## High-level model

An NCLP document consists of:

- a top-level envelope,
- a root node ID,
- a normalized map of nodes,
- dynamic state buckets.

The normalized form is the canonical form in v1.

### Why normalized form is canonical

Normalized documents are easier to:

- diff,
- patch,
- validate,
- reconcile,
- serialize consistently across runtimes.

Hosts should not be required to recursively diff large nested trees to determine changes.

---

## Top-level envelope

A snapshot document has this shape:

```json
{
  "type": "snapshot",
  "version": 1,
  "docId": "main",
  "revision": 1,
  "root": "root",
  "nodes": {
    "root": {
      "id": "root",
      "kind": "window",
      "children": ["tabs", "toolbar"]
    },
    "tabs": {
      "id": "tabs",
      "kind": "tabs",
      "children": ["home", "search"]
    },
    "home": {
      "id": "home",
      "kind": "tab",
      "label": "Home"
    },
    "search": {
      "id": "search",
      "kind": "tab",
      "label": "Search"
    },
    "toolbar": {
      "id": "toolbar",
      "kind": "toolbar",
      "children": ["refresh"]
    },
    "refresh": {
      "id": "refresh",
      "kind": "action",
      "label": "Refresh"
    }
  },
  "state": {
    "selected": {
      "tabs": "home"
    },
    "disabled": {
      "refresh": false
    },
    "hidden": {},
    "badges": {}
  }
}
```

---

## Envelope fields

#### `type`

String. Required.

Allowed values in v1:

- `"snapshot"`
- `"patch"`
- `"event"`

#### `version`

Integer. Required for snapshots. Optional for patch and event envelopes if implied by session negotiation, but recommended.

For this specification, the version is:

```json
{ "version": 1 }
```

#### `docId`

String. Required.

Uniquely identifies the logical document stream within the host session.

Examples:

- `"main"`
- `"settings-window"`
- `"project:123:sidebar"`

#### `revision`

Integer. Required for snapshots and patches.

Must be monotonically increasing within a `docId`.

#### `root`

String. Required for snapshots.

The ID of the root node.

#### `nodes`

Object map. Required for snapshots.

Maps node IDs to node objects.

#### `state`

Object map. Required for snapshots, though individual buckets may be empty.

Contains dynamic state buckets.

---

## Document invariants

A valid NCLP snapshot must satisfy all of the following:

1. `type` must equal `"snapshot"`.
2. `version` must equal a supported protocol version.
3. `docId` must be non-empty.
4. `revision` must be an integer greater than zero.
5. root must reference an existing node.
6. Every key in `nodes` must equal that node’s `id`.
7. Every node ID must be unique within the document.
8. Every ID listed in a node’s `children` array must reference an existing node.
9. The node graph must be acyclic.
10. The node graph must be connected from `root`, unless the implementation explicitly permits unreachable nodes.
11. Leaf node kinds must not declare children.
12. Container node kinds must declare `children`, even if empty.
13. State bucket keys should reference existing node IDs unless the implementation explicitly permits speculative state.
14. Unknown top-level core fields should be ignored unless the host opts into strict validation.
15. Unknown core `kind` values must be either ignored or rejected consistently.

Recommended behavior: reject malformed snapshots rather than partially applying them.

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

### Common fields

```json
{
  "id": "refresh",
  "kind": "action",
  "label": "Refresh",
  "icon": "arrow.clockwise",
  "role": "primary",
  "placement": "primary",
  "presentation": "default",
  "accessibilityLabel": "Refresh content",
  "tooltip": "Refresh",
  "meta": {
    "route": "/refresh"
  },
  "ext": {
    "com.example.host": {
      "preferredWidth": 240
    }
  }
}
```

### Core node fields

#### `id`

String. Required.

A stable identifier unique within a document.

The embedded runtime owns node IDs. Hosts must treat IDs as opaque strings.

#### `kind`

String. Required.

Identifies the node type.

#### `children`

Array of strings. Required for container kinds. Forbidden for leaf kinds.

Contains ordered child node IDs.

#### `label`

String. Optional.

Human-readable label.

#### `icon`

String. Optional.

An implementation-defined icon token.

NCLP does not define a cross-platform icon library. The host and runtime must agree on icon token interpretation or gracefully degrade.

#### `role`

String. Optional.

Semantic hint describing intent, not exact rendering.

Suggested values:

- `"primary"`
- `"secondary"`
- `"destructive"`
- `"navigation"`
- `"confirm"`
- `"cancel"`

Hosts may ignore unsupported roles.

#### `placement`

String. Optional.

Describes intended placement.

Suggested values:

- `"primary"`
- `"secondary"`
- `"top"`
- `"bottom"`
- `"leading"`
- `"trailing"`
- `"sidebar"`
- `"overflow"`

#### `presentation`

String. Optional.

Presentation hint.

Suggested values:

- `"default"`
- `"compact"`
- `"prominent"`
- `"subtle"`

#### `description`

String. Optional.

Longer descriptive text.

#### `tooltip`

String. Optional.

Short hover/help description where supported.

#### `accessibilityLabel`

String. Optional.

Explicit accessibility label for assistive technologies.

#### `meta`

Object. Optional.

Opaque metadata for the runtime and host to use by agreement. Hosts should not assign core meaning to `meta`.

#### `ext`

Object. Optional.

Namespaced extension map. See the extension section.

---

## Node kinds

NCLP v1 defines a small set of core node kinds.

Hosts may map these onto platform-native UI constructs.

### Container kinds

#### `menubar`

Ordered collection of top-level `menu` children intended for OS-level or app-level menu bars on desktop platforms.

Must declare `children`.

#### `window`

Top-level chrome container.

Usually the root node.

Must declare `children`.

#### `titlebar`

Represents a title bar or top title region.

Must declare `children` if it is used as a container, otherwise may be leaf-like only if the implementation explicitly supports a leaf titlebar.

Recommended to treat as a container in v1 for consistency.

#### `toolbar`

Ordered set of actions and related items.

Must declare `children`.

#### `menu`

Ordered menu container.

Must declare `children`.

#### `section`

Logical grouping of related children.

Must declare `children`.

#### `group`

Generic grouping container.

Must declare `children`.

#### `tabs`

A set of tabs, typically with a single selected child.

Must declare `children`.

#### `sidebar`

A sidebar navigation or utility region.

Must declare `children`.

#### `stack`

A logical stack of regions or navigation hierarchy.

Must declare `children`.

#### `split`

A split-view container.

Must declare `children`.

The host may restrict valid child counts, for example requiring two children.

### Leaf kinds

#### `tab`

A selectable tab item.

Must not declare children.

#### `action`

An actionable control such as a button, menu command, or toolbar item.

Must not declare `children`.

#### `item`

A generic selectable item.

Must not declare `children`.

#### `title`

A text title element.

Must not declare `children`.

#### `search`

A search affordance.

Must not declare `children`.

#### `separator`

A visual separator.

Must not declare `children`.

#### `spacer`

A flexible or fixed spacer.

Must not declare `children`.

---

## Kind constraints

Hosts should enforce minimal kind constraints to preserve predictability.

Examples:

- `tabs.children` should usually contain `tab` nodes.
- `menubar.children` should usually contain `menu` nodes.
- `menu.children` should usually contain `action`, `item`, `separator`, `section`, or `group`.
- `toolbar.children` should usually contain `action`, `search`, `spacer`, `separator`, or small groups.
- `separator` should not have a label unless the host explicitly supports labeled separators.

Hosts may warn on semantically odd structures but still accept them where safe.

---

## State model

NCLP distinguishes stable structure from dynamic state.

Dynamic values belong in state buckets rather than forcing structural updates.

### Snapshot state shape

```json
{
  "state": {
    "selected": {
      "tabs": "home"
    },
    "disabled": {
      "refresh": false
    },
    "hidden": {
      "beta-tab": true
    },
    "badges": {
      "search": "3"
    },
    "values": {}
  }
}
```

### Core state buckets

#### `selected`

Map from container node ID to selected child node ID.

Typical for:

- `tabs`
- selectable `sidebar`
- selectable `group`

Example:

```json
{
  "selected": {
    "tabs": "search"
  }
}
```

#### `disabled`

Map from node ID to boolean.

Example:

```json
{
  "disabled": {
    "refresh": true
  }
}
```

#### `hidden`

Map from node ID to boolean.

Example:

```json
{
  "hidden": {
    "advanced-settings": true
  }
}
```

#### `badges`

Map from node ID to string or number-like display value.

Recommended to serialize badge values as strings for maximum portability.

Example:

```json
{
  "badges": {
    "inbox": "12"
  }
}
```

#### `values`

Map from node ID to arbitrary JSON-compatible value.

For dynamic values that do not belong in a more specific bucket.

Example:

```json
{
  "values": {
    "search-box": "cats"
  }
}
```

### Additional state buckets

Hosts may allow additional buckets, but the core buckets above should be enough for v1 interoperability.

---

## State invariants

Recommended invariants:

1. `selected[containerId]` should reference one of the container’s children.
2. `disabled[nodeId]` values should be booleans.
3. `hidden[nodeId]` values should be booleans.
4. Badge values should be short display values.
5. `values[nodeId]` may be any JSON-compatible value.

Hosts may accept inconsistent state but should either normalize or ignore invalid entries.

---

## Identity rules

Stable identity is central to NCLP.

### Requirements

1. Node IDs must be stable across revisions whenever the logical UI entity remains the same.
2. IDs must not be derived solely from current position in a child list.
3. Reordering must preserve IDs.
4. A newly created logical entity must receive a new ID.
5. Reusing IDs for unrelated logical entities is invalid.

### Examples

Good:

```json
{
  "children": ["home", "search", "settings"]
}
```

Bad:

```json
{
  "children": ["tab-0", "tab-1", "tab-2"]
}
```

if those IDs are regenerated from order on each update.

---

## Snapshot semantics

A snapshot is a full replacement description of the desired document state for a `docId` at a specific `revision`.

### Host behavior

On receiving a valid snapshot:

1. If no prior document exists for `docId`, adopt it.
2. If `revision` is less than or equal to the current revision, ignore it.
3. If `revision` is greater than the current revision, reconcile current state to the new snapshot.

A host may choose either:

- atomic replacement with fresh render, or
- incremental reconciliation via diff.

Incremental reconciliation is recommended.

---

## Patch model

Patches are an optimization over snapshots.

A patch applies a list of operations against a known base revision.

### Patch envelope

```json
{
  "type": "patch",
  "version": 1,
  "docId": "main",
  "baseRevision": 7,
  "revision": 8,
  "ops": [
    {
      "op": "set-state",
      "bucket": "selected",
      "key": "tabs",
      "value": "search"
    }
  ]
}
```

### Patch fields

#### `type`

Must equal "patch".

#### `version`

Recommended.

#### `docId`

Required.

#### `baseRevision`

Required.

The patch applies only if the host currently holds this revision for the same `docId`.

#### `revision`

Required.

The resulting revision after successful patch application.

Must be greater than `baseRevision`.

#### `ops`

Required.

Ordered array of patch operations.

---

## Patch application rules

A host must only apply a patch if:

- it recognizes the docId,
- it currently holds baseRevision,
- the patch is valid,
- applying the patch would not violate core document invariants.

If any of these fail, the host should reject the patch and resynchronize using a full snapshot.

### Recommended patch behavior on mismatch

If `baseRevision` does not equal the host’s current revision:

- reject the patch,
- request or await a fresh snapshot,
- do not attempt heuristic merge in v1.

---

## Core patch operations

NCLP v1 defines a minimal patch vocabulary.

#### `put-node`

Adds a new node or replaces an existing node by ID.

```json
{
  "op": "put-node",
  "node": {
    "id": "settings",
    "kind": "tab",
    "label": "Settings"
  }
}
```

Rules:

- `node.id` is required.
- If the node does not exist, it is created.
- If the node exists, it is replaced wholesale.
- The resulting document must still be valid.

Recommended usage: use `set-props` for shallow updates and reserve `put-node` for creation or full replacement.

---

#### `remove-node`

Removes a node by ID.

```json
{
  "op": "remove-node",
  "id": "legacy-tab"
}
```

Rules:

- The node must exist.
- No remaining `children` array may reference the removed node after patch application.
- State entries referencing the node should be removed or ignored.
- Removing a node that remains reachable through another parent is invalid, since NCLP nodes are not shared across multiple parents in v1.

Recommended behavior: patch authors should update parent `children` before or alongside removal.

---

#### `set-children`

Replaces the ordered child list of a container node.

```json
{
  "op": "set-children",
  "id": "tabs",
  "children": ["home", "search", "settings"]
}
```

Rules:

- `id` must reference a container node.
- All child IDs must exist after patch application.
- Child order is significant.
- Duplicate child IDs in the same list are invalid.

This operation is the primary mechanism for inserts, removals, and moves.

---

#### `set-props`

Shallow-merges a set of node fields.

```json
{
  "op": "set-props",
  "id": "refresh",
  "props": {
    "label": "Reload",
    "tooltip": "Reload content"
  }
}
```

Rules:

- `id` must reference an existing node.
- `props` may only include valid mutable node fields.
- `id` and `kind` should be treated as immutable in v1 and must not be changed via `set-props`.

Recommended mutable fields:

- `label`
- `icon`
- `role`
- `placement`
- `presentation`
- `description`
- `tooltip`
- `accessibilityLabel`
- `meta`
- `ext`

---

#### `set-state`

Sets or replaces a single state value.

```json
{
  "op": "set-state",
  "bucket": "selected",
  "key": "tabs",
  "value": "search"
}
```

Rules:

- `bucket` must name a state bucket.
- `key` must be a string.
- `value` must be JSON-compatible.

---

#### `remove-state`

Removes a single state value.

```json
{
  "op": "remove-state",
  "bucket": "badges",
  "key": "search"
}
```

Rules:

No error if the entry does not exist, unless host strictness requires one.

---

## Patch ordering

Patch operations are applied in array order.

This permits patches such as:

1. create a node,
2. attach it to a parent’s child list,
3. update selection state.

Example:

```json
{
  "type": "patch",
  "version": 1,
  "docId": "main",
  "baseRevision": 2,
  "revision": 3,
  "ops": [
    {
      "op": "put-node",
      "node": {
        "id": "settings",
        "kind": "tab",
        "label": "Settings"
      }
    },
    {
      "op": "set-children",
      "id": "tabs",
      "children": ["home", "search", "settings"]
    },
    {
      "op": "set-state",
      "bucket": "selected",
      "key": "tabs",
      "value": "settings"
    }
  ]
}
```

---

## Event model

The host may emit events back to the embedded runtime when users interact with host-rendered chrome.

### Event envelope

```json
{
  "type": "event",
  "version": 1,
  "docId": "main",
  "event": {
    "name": "activate",
    "target": "refresh"
  }
}
```

### Event fields

#### `type`

Must equal "event".

#### `version`

Recommended.

#### `docId`

Required.

#### `event`

Required.

Object with:

- `name` — required string event name,
- `target` — required string node ID,
- `value` — optional JSON-compatible payload,
- `meta` — optional metadata object.

### Core event names

#### `activate`

Triggered when an action-like node is activated.

Example:

```json
{
  "type": "event",
  "docId": "main",
  "event": {
    "name": "activate",
    "target": "refresh"
  }
}
```

#### `select`

Triggered when a selectable container changes selection.

Example:

```json
{
  "type": "event",
  "docId": "main",
  "event": {
    "name": "select",
    "target": "tabs",
    "value": "search"
  }
}
```

#### `open`

Triggered when a menu or related surface opens.

#### `close`

Triggered when a menu or related surface closes.

#### `input`

Triggered when a value-bearing control changes.

#### `submit`

Triggered when a search or similar input is submitted.

Hosts may define additional events, but should keep names semantic and platform-neutral.

---

## Host reconciliation model

Hosts are encouraged to use a simple normalized reconciliation algorithm.

### Recommended algorithm

For snapshots:

1. Compare node ID sets:
  - removed IDs,
  - added IDs,
  - common IDs.
2. Remove deleted nodes from host render state.
3. Add newly created nodes.
4. For each common node:
  - shallow-compare props,
  - if changed, update rendered properties.
5. For each container:
  - compare children array,
  - detect inserts, removals, and moves by child ID.
6. Reconcile state buckets:
  - selection changes,
  - disabled changes,
  - hidden changes,
  - badge changes,
  - value changes.

### Important note

The host does not need a sophisticated tree-diff algorithm if it follows the identity and normalization rules.

The protocol is intentionally designed so that:

- map diff handles node existence,
- shallow diff handles node field updates,
- ordered list diff handles child movement,
- state bucket diff handles dynamic state.

---

## Recommended child-list diff behavior

For a container node:

- compare old child ID list to new child ID list,
- detect matching IDs,
- treat unmatched old IDs as removals,
- treat unmatched new IDs as insertions,
- treat reordered matched IDs as moves.

Because identity is explicit, a host can perform this cheaply without deep comparisons.

---

## Error handling

Hosts should choose one of two validation modes:

### Strict mode

Reject malformed snapshots or patches entirely.

Recommended for development and test environments.

### Lenient mode

Ignore unknown non-core fields and unsupported hints, but reject violations of core invariants.

Recommended for production interoperability.

### Must-reject conditions

Hosts should reject when:

- required fields are missing,
- IDs are duplicated,
- the graph is cyclic,
- root is missing,
- a child references a nonexistent node,
- patch base revision does not match,
- node kinds violate structural rules in a way that cannot be recovered safely.

---

## Extension model

NCLP allows extensions through a namespaced ext field on nodes and, if needed, on top-level envelopes.

### Example

```json
{
  "id": "sidebar",
  "kind": "sidebar",
  "children": ["home", "search"],
  "ext": {
    "com.example.desktop": {
      "collapsible": true,
      "defaultWidth": 280
    }
  }
}
```

### Extension rules

1. Extension keys should be globally namespaced strings.
2. Hosts that do not recognize an extension must ignore it.
3. Extensions must not redefine core field semantics.
4. Core interoperability must not depend on extensions.

This preserves portability while allowing host-specific capabilities.

---

### Portability guidance

To keep documents portable:

- prefer semantic `kind`, `role`, and `placement`,
- avoid host-specific assumptions in core nodes,
- use `ext` for platform-specific hints,
- prefer `menubar` for top-level desktop menu bars rather than overloading `toolbar` or generic `group`,
- use `menu` for expandable menu surfaces beneath a `menubar`,
- avoid relying on unsupported icons or interaction patterns,
- treat exact rendering as host-controlled.

### Example

A `tabs` node may render as:

- bottom tab bar on mobile,
- segmented control,
- titlebar tabs,
- sidebar tabs on desktop.

This is expected and desirable.

---

## Security considerations

Hosts must treat NCLP documents as untrusted input.

### Hosts should:

- validate all inputs,
- cap document size and depth,
- reject pathological graphs,
- guard against excessively large child arrays,
- guard against extension abuse,
- avoid executing arbitrary code from document contents,
- treat metadata as data, not commands.

### Embedded runtimes should not assume:

- all hints will be honored,
- all nodes will render identically across platforms,
- host extensions will exist.

---

## Performance considerations

NCLP is designed to be cheap to process.

### Recommended practices

- use snapshots as the canonical representation,
- use patches only when beneficial,
- keep node objects shallow,
- keep dynamic state in state buckets,
- keep IDs stable,
- avoid generating entirely new IDs for reordered items,
- avoid embedding large blobs in meta,
- batch related updates into a single patch where practical.

### Why not generic JSON Patch

NCLP v1 intentionally avoids using generic JSON Patch as its public core patch format because generic path-based mutation is:

- less ergonomic,
- more fragile,
- harder to validate semantically,
- less intention-revealing.

Domain-specific patch operations make host implementations simpler and safer.

---

## Interoperability recommendations

A basic interoperable implementation should support:

- snapshot ingestion,
- patch ingestion,
- the core node kinds,
- the core state buckets,
- activate and select events,
- stable revision handling,
- normalized reconciliation.

A minimal implementation may ignore:

- unsupported presentation hints,
- unknown extensions,
- optional event names,
- nonessential metadata.

---

## Example: full snapshot

```json
{
  "type": "snapshot",
  "version": 1,
  "docId": "main",
  "revision": 7,
  "root": "root",
  "nodes": {
    "root": {
      "id": "root",
      "kind": "window",
      "children": ["titlebar", "sidebar", "tabs", "toolbar"]
    },
    "titlebar": {
      "id": "titlebar",
      "kind": "titlebar",
      "children": ["app-title"]
    },
    "app-title": {
      "id": "app-title",
      "kind": "title",
      "label": "My App"
    },
    "sidebar": {
      "id": "sidebar",
      "kind": "sidebar",
      "children": ["nav-home", "nav-search", "nav-settings"]
    },
    "nav-home": {
      "id": "nav-home",
      "kind": "item",
      "label": "Home",
      "icon": "house"
    },
    "nav-search": {
      "id": "nav-search",
      "kind": "item",
      "label": "Search",
      "icon": "magnifyingglass"
    },
    "nav-settings": {
      "id": "nav-settings",
      "kind": "item",
      "label": "Settings",
      "icon": "gear"
    },
    "tabs": {
      "id": "tabs",
      "kind": "tabs",
      "children": ["home", "search"]
    },
    "home": {
      "id": "home",
      "kind": "tab",
      "label": "Home"
    },
    "search": {
      "id": "search",
      "kind": "tab",
      "label": "Search"
    },
    "toolbar": {
      "id": "toolbar",
      "kind": "toolbar",
      "children": ["refresh", "share"]
    },
    "refresh": {
      "id": "refresh",
      "kind": "action",
      "label": "Refresh",
      "icon": "arrow.clockwise"
    },
    "share": {
      "id": "share",
      "kind": "action",
      "label": "Share",
      "icon": "square.and.arrow.up"
    }
  },
  "state": {
    "selected": {
      "sidebar": "nav-home",
      "tabs": "home"
    },
    "disabled": {
      "share": false
    },
    "hidden": {},
    "badges": {
      "nav-search": "2"
    },
    "values": {}
  }
}
```

---

## Example: state-only patch

```json
{
  "type": "patch",
  "version": 1,
  "docId": "main",
  "baseRevision": 7,
  "revision": 8,
  "ops": [
    {
      "op": "set-state",
      "bucket": "selected",
      "key": "tabs",
      "value": "search"
    },
    {
      "op": "set-state",
      "bucket": "badges",
      "key": "search",
      "value": "3"
    }
  ]
}
```

---

## Example: structural patch

```json
{
  "type": "patch",
  "version": 1,
  "docId": "main",
  "baseRevision": 8,
  "revision": 9,
  "ops": [
    {
      "op": "put-node",
      "node": {
        "id": "settings",
        "kind": "tab",
        "label": "Settings",
        "icon": "gear"
      }
    },
    {
      "op": "set-children",
      "id": "tabs",
      "children": ["home", "search", "settings"]
    }
  ]
}
```

---

## Example: event from host to runtime

```json
{
  "type": "event",
  "version": 1,
  "docId": "main",
  "event": {
    "name": "activate",
    "target": "refresh"
  }
}
```

---

## Implementation notes

For embedded runtimes

- keep IDs stable,
- prefer snapshots first,
- send patches only when you can guarantee a correct base revision,
- keep dynamic values in state buckets,
- do not encode layout semantics in arbitrary meta.

For hosts

- normalize internally if needed,
- reject malformed inputs,
- use child IDs for ordering diff,
- use shallow node comparisons,
- use state buckets for fast dynamic updates,
- resync on patch mismatch instead of guessing.

## Suggested future extensions

Possible future versions may define:

- a standard icon vocabulary,
- richer input/search field semantics,
- optional capability negotiation,
- host-to-runtime acknowledgements,
- optional nested authoring syntax that compiles to normalized form,
- standard extension namespaces.

These are intentionally out of scope for v1.

---

## Summary

NCLP v1 is a strict, normalized, JSON-based protocol for describing native host chrome from an embedded runtime.

Its key properties are:

- declarative desired-state modeling,
- stable node identity,
- normalized node storage,
- explicit ordered children,
- dedicated `menubar` support for desktop top-level menus,
- separated dynamic state,
- small domain-specific patch vocabulary,
- platform-neutral semantic intent.

That makes it suitable for hosts that need a simple, reliable reconciliation model without implementing a full virtual DOM.
