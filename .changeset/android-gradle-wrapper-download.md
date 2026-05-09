---
"nativite": patch
---

Remove the Android project generator's dependency on a globally installed
Gradle command by generating wrapper scripts directly and copying a packaged,
checksum-verified Gradle 8.11.1 wrapper JAR during project generation.
