---
"nativite": minor
---

Remove the public `nativite dev` command and the associated terminal-owned native build, launch, hotkey, status polling, and dev URL resolver implementation. Generated debug native projects continue to use Vite dev server routing and `.nativite/dev.json`.
