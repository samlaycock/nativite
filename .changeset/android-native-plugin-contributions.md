---
"nativite": patch
---

Support Android native plugin contributions during project generation.

Android plugins can now provide Kotlin/Java sources, resources, Gradle dependencies, and bridge registrars through `platforms.android`. Android registrar declarations can include fully-qualified Kotlin import paths so plugin registration functions compile when they live outside the generated app package.
