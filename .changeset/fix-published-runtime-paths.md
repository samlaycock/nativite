---
"nativite": patch
---

Fix the published package layout for first-party native runtime templates.

Swift and Kotlin runtime templates are now copied to `dist/runtime`, matching the path used by the bundled platform generators when generating iOS, macOS, and Android projects from the published package.
