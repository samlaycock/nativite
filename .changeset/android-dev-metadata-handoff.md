---
"nativite": patch
---

Wire Android debug builds to consume Vite dev server metadata by mirroring `.nativite/dev.json` into generated Android debug assets and removing stale metadata outside dev mode.
