---
"nativite": patch
---

Improve native CSS variable accuracy across platforms.

- Android now reports `--nv-nav-*`, `--nv-tab-*`, and `--nv-toolbar-*` from measured Compose chrome geometry instead of fixed height guesses.
- Android now updates device/orientation/theme flags (`--nv-is-phone`, `--nv-is-tablet`, `--nv-is-portrait`, `--nv-is-dark`, etc.) from runtime configuration changes.
- iOS now uses consistent inset-top math (`safe-top + nav-height`) so `--nv-inset-top` no longer double-counts status bar height.
- macOS now seeds appearance variables on startup and pushes chrome geometry with measured navigation height semantics.
