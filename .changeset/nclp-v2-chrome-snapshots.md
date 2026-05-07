---
"nativite": minor
---

Implement NCLP v2 chrome snapshots and shell readiness handling.

The JavaScript chrome runtime now waits for `shell.ready`, compiles merged chrome state into versioned `chrome.snapshot` messages, filters unsupported host areas, and maps incoming `chrome.event` envelopes back to the existing `ChromeEvent` API. iOS and Android shells now advertise supported areas and accept snapshot envelopes.
