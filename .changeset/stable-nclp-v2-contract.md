---
"nativite": patch
---

Document NCLP v2 as the stable public host wire protocol for Nativite 1.0.

The README, Chrome API docs, and NCLP reference now distinguish the app-facing JavaScript chrome API from the host-facing wire protocol contract, define NCLP v2 compatibility and versioning rules, and clarify capability negotiation through `shell.ready areas`. A regression test now covers the stable `chrome.snapshot` envelope emitted by the JavaScript runtime.
