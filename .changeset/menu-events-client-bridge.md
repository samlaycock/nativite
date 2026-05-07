---
"nativite": patch
---

Forward native chrome event envelopes through `nativite/client` unchanged so `chrome.on("titleBar.menuItemPressed")`, `chrome.on("toolbar.menuItemPressed")`, and `chrome.on("menuBar.itemPressed")` handlers receive menu item taps when the client bridge is imported.
