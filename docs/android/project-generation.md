# Android Project Generation

> Maps to: `src/android/generator.ts`
> Generated output: `.nativite/android/`

The generator creates a complete Android Gradle project from the user's configuration.

## Generated Directory Structure

```
.nativite/android/
├── app/
│   ├── src/main/
│   │   ├── java/{package/path}/
│   │   │   ├── MainActivity.kt
│   │   │   ├── NativiteBridge.kt
│   │   │   ├── NativiteChrome.kt     (NativiteApp + all composables)
│   │   │   ├── NativiteWebView.kt
│   │   │   ├── NativiteVars.kt
│   │   │   └── NativiteTheme.kt
│   │   ├── res/
│   │   │   ├── values/
│   │   │   │   ├── strings.xml
│   │   │   │   ├── colors.xml
│   │   │   │   ├── themes.xml
│   │   │   │   └── splash.xml         (if splash configured)
│   │   │   ├── mipmap-xxxhdpi/
│   │   │   │   └── ic_launcher.png     (app icon)
│   │   │   └── mipmap-anydpi-v26/
│   │   │       └── ic_launcher.xml     (adaptive icon)
│   │   ├── assets/
│   │   │   ├── dist/                   (web bundle, copied at build)
│   │   │   └── dev.json                (dev URL, debug/dev only)
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts
├── gradle/
│   ├── wrapper/
│   │   ├── gradle-wrapper.properties
│   │   └── gradle-wrapper.jar
│   └── libs.versions.toml              (version catalog)
├── gradlew                              (Unix shell script, +x)
├── gradlew.bat                          (Windows batch)
├── settings.gradle.kts
├── build.gradle.kts
└── gradle.properties
```

## Generation Steps

1. Creates all necessary directories with `mkdirSync(dir, { recursive: true })`.
2. Writes `settings.gradle.kts` first (required by Gradle).
3. Runs `gradle wrapper --gradle-version 8.11.1 --no-daemon` to generate wrapper files (`gradlew`, `gradlew.bat`, `gradle-wrapper.jar`).
4. Writes root and app `build.gradle.kts` files.
5. Writes `AndroidManifest.xml`.
6. Generates Kotlin source files.
7. Writes resource XML files (strings, colours, themes).
8. Optional: Writes splash screen XML and copies icon file.
9. Writes `.hash-android` for dirty-check optimization.
10. In non-dev generation modes, removes stale `assets/dev.json` so production builds do not carry dev server configuration.

## Dirty-Check Optimization

Same as iOS: SHA256 hash of normalised config (including plugin fingerprints). Skips regeneration if hash matches the stored `.hash-android` file.

## Configuration

The generator resolves platform-specific settings:

| Setting       | Default          | Description                   |
| ------------- | ---------------- | ----------------------------- |
| `minSdk`      | `26`             | Minimum Android SDK version   |
| `targetSdk`   | `35`             | Target Android SDK version    |
| `compileSdk`  | (from targetSdk) | Compile SDK version           |
| `bundleId`    | from config      | Application ID / package name |
| `versionCode` | from config      | Integer version code          |
| `versionName` | from config      | Display version string        |

Validation notes:

- `minSdk` is required and must be an integer.
- `targetSdk` is optional, but must be an integer when provided.

## Gradle Configuration

### Version Catalog (`libs.versions.toml`)

> Maps to: `src/android/templates/version-catalog.ts`

| Dependency            | Version    |
| --------------------- | ---------- |
| Android Gradle Plugin | 8.7.3      |
| Kotlin                | 2.1.0      |
| Core KTX              | 1.15.0     |
| Lifecycle Runtime KTX | 2.8.7      |
| Activity Compose      | 1.9.3      |
| Compose BOM           | 2024.12.01 |
| AndroidX WebKit       | 1.12.1     |
| Splashscreen          | 1.0.1      |

### App Build Configuration (`build.gradle.kts`)

> Maps to: `src/android/templates/build-gradle-app.ts`

- `namespace` and `applicationId` from bundleId
- Java/Kotlin version 17
- Compose enabled: `compose = true`
- Release builds with ProGuard minification
- Assets sourced from `src/main/assets`

### Dependencies

- `androidx.core:core-ktx`
- `androidx.lifecycle:lifecycle-runtime-ktx`
- `androidx.activity:activity-compose`
- `androidx.compose` (BOM + ui, ui-graphics, material3)
- `androidx.webkit` (WebViewCompat, WebMessagePort)
- `androidx.core:core-splashscreen`

### Gradle Properties

> Maps to: `src/android/templates/gradle-properties.ts`

```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
```

## App Icon

> Maps to: `src/android/templates/app-icon.ts`

### Adaptive Icon (API 26+)

```xml
<adaptive-icon>
    <background android:drawable="@color/white" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
```

The user-provided icon is copied to `mipmap-xxxhdpi/ic_launcher.png` as the foreground layer. The adaptive icon wrapper ensures proper rendering across different device launcher mask shapes (round, squircle, teardrop, etc.).
