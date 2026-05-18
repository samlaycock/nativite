---
"nativite": minor
---

Add declarative title bar web component support to `nativite/chrome` via `registerWebComponents()`.

This introduces v1 custom elements for title bar authoring (`nv-titlebar`, `nv-title`, `nv-leadingitems`, `nv-trailingitems`, and `nv-button`) with automatic lifecycle setup/cleanup and DOM-driven updates while preserving the existing imperative chrome APIs.
