---
"nativite": patch
---

Remove the Android project generator's dependency on a globally installed
Gradle command by generating wrapper scripts directly and downloading the
pinned Gradle 8.11.1 wrapper JAR during project generation.
