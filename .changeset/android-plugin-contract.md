---
"nativite": patch
---

Reject Android native plugin source/resource/registrar/dependency contributions during plugin resolution.

Android Gradle project generation does not yet include plugin Kotlin sources, resources, dependencies, or a generated native registrant, so unsupported Android plugin contributions now fail before generation instead of being silently ignored.
