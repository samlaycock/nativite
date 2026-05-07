---
"nativite": patch
---

Align CSS variable injection across platforms.

Android now seeds the full shared `NVVarName` surface, updates safe-area values from system insets, and refreshes keyboard values during IME animation. The Apple runtimes stop emitting undocumented `--nv-sidebar-*` defaults so the runtime variable set matches the public JavaScript contract.
