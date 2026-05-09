# Android Project Generation

> Maps to: `src/native/android/generator.ts`
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
│   │   │   └── dev.json                (dev URL, debug/dev only)
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts
│   └── build/generated/nativite/assets/
│       └── dist/                       (web bundle, copied for release)
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
9. In dev mode, copies `.nativite/dev.json` to `app/src/main/assets/dev.json` after normalizing loopback hosts to `10.0.2.2`.
10. Writes `.hash-android` for dirty-check optimization.
11. In non-dev generation modes, removes stale `assets/dev.json` so production builds do not carry dev server configuration.

## Toolchain Boundary

The `gradle wrapper` step requires a `gradle` command on `PATH`. Nativite
intentionally does not download, vendor, or bootstrap Gradle binaries or wrapper
JARs. Gradle, Java, Android Studio, and the Android SDK are machine-level
toolchain prerequisites that should be installed by the developer or CI image.

If project generation fails because `gradle` is missing, install/configure Gradle
and rerun `bunx nativite build --platform android`. The generated wrapper then
uses the pinned Gradle distribution URL in `gradle-wrapper.properties` for normal
Gradle wrapper operation.

## Dirty-Check Optimization

Same as iOS: SHA256 hash of normalised config (including plugin fingerprints). Skips regeneration if hash matches the stored `.hash-android` file.

## Native Plugin Contributions

Android native plugin contributions are currently unsupported. If Android is
enabled and a plugin declares `platforms.android.sources`, `resources`,
`registrars`, or `dependencies`, plugin resolution throws before Gradle project
generation. The generated Android project does not copy plugin Kotlin sources,
merge plugin resources, add plugin dependencies, or generate an Android plugin
registrant.

This is an explicit contract boundary for the current release: iOS/macOS consume
native plugin contributions, while Android support must be implemented before
plugins can rely on parity.

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

- `android()` uses the default `minSdk` of `26` when omitted.
- `minSdk` must be an integer when provided.
- `targetSdk` is optional, but must be an integer when provided.

## Gradle Configuration

### Version Catalog (`libs.versions.toml`)

> Maps to: `src/native/android/version-catalog.ts`

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

> Maps to: `src/native/android/build-gradle-app.ts`

- `namespace` and `applicationId` from bundleId
- Java/Kotlin version 17
- Compose enabled: `compose = true`
- Release builds with ProGuard minification
- Assets sourced from `src/main/assets`
- Release asset merging depends on `copyNativiteWebBundle`, which copies
  `../../dist-android` into `app/build/generated/nativite/assets/dist`
- Release asset merging also depends on `deleteNativiteDevMetadata`, which
  removes `src/main/assets/dev.json` before release assets are packaged
- Release builds fail before asset merging if `dist-android` is missing, with
  instructions to run `bunx nativite build --platform android`

The generated Gradle project keeps production web assets in Gradle's build
directory rather than mutating `src/main/assets`. Debug assets such as
`src/main/assets/dev.json` remain source-controlled/generated project inputs,
while the production bundle is copied from the latest web build whenever release
assets are merged.

### Dependencies

- `androidx.core:core-ktx`
- `androidx.lifecycle:lifecycle-runtime-ktx`
- `androidx.activity:activity-compose`
- `androidx.compose` (BOM + ui, ui-graphics, material3)
- `androidx.webkit` (WebViewCompat, WebMessagePort)
- `androidx.core:core-splashscreen`

### Gradle Properties

> Maps to: `src/native/android/gradle-properties.ts`

```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
```

## App Icon

> Maps to: `src/native/android/app-icon.ts`

### Adaptive Icon (API 26+)

```xml
<adaptive-icon>
    <background android:drawable="@color/white" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
```

The user-provided icon is copied to `mipmap-xxxhdpi/ic_launcher.png` as the foreground layer. The adaptive icon wrapper ensures proper rendering across different device launcher mask shapes (round, squircle, teardrop, etc.).
