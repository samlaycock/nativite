---
"nativite": minor
---

Add sheet header chrome with `title`, `leadingItems`, and `trailingItems` support across the shared API, Android runtime, and iOS runtime.

The change also emits `sheet.leadingItemPressed` and `sheet.trailingItemPressed` events so sheet header actions can be handled like other native chrome buttons.
