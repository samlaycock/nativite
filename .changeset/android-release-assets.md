---
"nativite": patch
---

Copy the Android production web bundle into generated Gradle assets for release builds.

Generated Android projects now copy `dist-android` into Gradle-generated assets
before `mergeReleaseAssets`, and release builds fail clearly if the web bundle is
missing.
