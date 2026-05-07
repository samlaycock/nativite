---
"nativite": patch
---

Fix CommonJS package exports for the root, Vite, and CLI entrypoints by avoiding
build output cycles and guarding CLI execution when imported.
