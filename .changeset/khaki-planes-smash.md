---
"nativite": patch
---

Fix native dev HMR behavior so React Fast Refresh can run on native variant edits without forced full page reloads.

- Replace native variant `full-reload` broadcasting with bridged `update` payloads sent to the client HMR channel.
- Keep native-only hot updates deduped per file-change token to avoid duplicate HMR broadcasts.
- Add regression tests that assert native variant updates emit `update` payloads instead of forced `full-reload`.
