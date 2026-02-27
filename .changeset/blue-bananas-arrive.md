---
"nativite": minor
---

Add iOS native menu/submenu support to `ToolbarItem` button entries used by `chrome.toolbar` and `chrome.navigationBar`.

`ToolbarItem` buttons now accept a `menu` object with nested `submenu` items, and the generated `NativiteChrome.swift` template now builds recursive `UIMenu`/`UIAction` trees so menu selections emit the existing `toolbar.buttonTapped` / `navigationBar.buttonTapped` events by item id.
