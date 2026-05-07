---
"nativite": minor
---

Implement NCLP v2 chrome snapshots and shell readiness handling.

The JavaScript chrome runtime now waits for validated `shell.ready`, compiles merged chrome state into versioned `chrome.snapshot` messages, filters unsupported host areas, emits state buckets for selected/disabled/hidden/badges/values, and maps incoming `chrome.event` envelopes back to the existing `ChromeEvent` API. iOS and Android shells now advertise supported areas, validate and revision-gate snapshot envelopes, enforce graph invariants and size caps, adapt snapshots to the current native renderer state shape, and preserve full NCLP node identity for native interaction events.
