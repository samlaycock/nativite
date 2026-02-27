---
"nativite": major
---

Refactor `chrome` API to singleton instance API with named setters and explicit `on*` subscriptions.

## Breaking Changes

The per-element function call API (`chrome.navigationBar(opts)`, `chrome.toolbar(opts)`, etc.) has been replaced with a singleton namespace API. Each chrome element is now accessed as a property of `chrome` with dedicated methods for state updates and event subscriptions.

### Before

```typescript
chrome.navigationBar({
  title: "Settings",
  toolbarRight: [{ type: "button", id: "save", title: "Save", style: "done" }],
  onButtonTap: ({ id }) => console.log("Tapped:", id),
});

chrome.tabBar({
  items: [{ id: "home", title: "Home", systemImage: "house.fill" }],
  onSelect: ({ id }) => navigate(id),
});
```

### After

```typescript
chrome.navigationBar.setTitle("Settings");
chrome.navigationBar.setToolbarRight([
  { type: "button", id: "save", title: "Save", style: "done" },
]);
chrome.navigationBar.show();

const unsub = chrome.navigationBar.onButtonTap(({ id }) => console.log("Tapped:", id));
unsub(); // unsubscribe when done

chrome.tabBar.setTabs([{ id: "home", title: "Home", systemImage: "house.fill" }]);
chrome.tabBar.show();
const unsubTab = chrome.tabBar.onSelect(({ id }) => navigate(id));
```

## API Reference

Each element exposes a consistent set of methods:

- **`show()` / `hide()`** — control visibility (sheet uses `present()` / `dismiss()`)
- **Named content setters** — `setTitle()`, `setTabs()`, `setActiveTab()`, `setItems()`, etc.
- **`configure(opts)`** — set appearance/styling properties (tint colour, translucency, etc.)
- **`on*` subscriptions** — `onButtonTap()`, `onSelect()`, `onTextChange()`, etc. Each returns an unsubscribe function

### `chrome.navigationBar`

`show()`, `hide()`, `setTitle(title)`, `setToolbarLeft(items)`, `setToolbarRight(items)`, `configure({ tintColor, barTintColor, translucent, backButtonTitle, largeTitleMode })`, `onButtonTap(handler)`, `onBackTap(handler)`

### `chrome.tabBar`

`show()`, `hide()`, `setTabs(items)`, `setActiveTab(id)`, `configure({ tintColor, unselectedTintColor, barTintColor, translucent })`, `onSelect(handler)`

### `chrome.toolbar`

`show()`, `hide()`, `setItems(items)`, `configure({ barTintColor, translucent })`, `onButtonTap(handler)`

### `chrome.statusBar`

`show()`, `hide()`, `setStyle("light" | "dark")`

### `chrome.homeIndicator`

`show()`, `hide()`

### `chrome.searchBar`

`setText(text)`, `setPlaceholder(placeholder)`, `configure({ barTintColor, showsCancelButton })`, `onTextChange(handler)`, `onSubmit(handler)`, `onCancel(handler)`

### `chrome.sheet`

`present()`, `dismiss()`, `setDetents(detents)`, `setSelectedDetent(detent)`, `configure({ grabberVisible, backgroundColor, cornerRadius })`, `onDetentChange(handler)`, `onDismiss(handler)`

### `chrome.keyboard`

`setAccessory(accessory | null)`, `configure({ dismissMode })`, `onAccessoryItemTap(handler)`

### `chrome.sidebar`

`show()`, `hide()`, `setItems(items)`, `setActiveItem(id)`, `onItemSelect(handler)`

### `chrome.window`

`setTitle(title)`, `setSubtitle(subtitle)`, `configure({ titlebarSeparatorStyle, titleHidden, fullSizeContent })`

### `chrome.menuBar`

`setMenus(menus)`, `onItemSelect(handler)`

## Other Changes

- State is **merged** across calls to the same element — calling `setTitle("Hello")` then `setToolbarRight([...])` preserves the title in subsequent bridge sends.
- `*Options` types removed from public API (`NavigationBarOptions`, `TabBarOptions`, etc.). Use the corresponding `*State` types with named setters instead.
- New `Unsubscribe` type exported: `() => void`.
- `chrome.on()`, `chrome.off()`, and `chrome.set()` are unchanged.
