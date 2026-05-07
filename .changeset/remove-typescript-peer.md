---
"nativite": patch
---

Move TypeScript from peer dependencies to development dependencies because
Nativite does not import or require the consumer's TypeScript compiler at
runtime.
