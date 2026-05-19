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
│   │   │   ├── drawable-{density}/      (if splash image configured)
│   │   │   │   └── nativite_splash.png
│   │   │   ├── mipmap-{density}/
│   │   │   │   └── ic_launcher_foreground.png
│   │   │   └── mipmap-anydpi-v26/
│   │   │       └── ic_launcher.xml     (adaptive icon)
│   │   ├── assets/
│   │   │   └── dev.json                (dev URL, debug/dev only)
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts
│   └── proguard-rules.pro
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
3. Runs `gradle wrapper --gradle-version 8.13 --no-daemon` to generate wrapper files (`gradlew`, `gradlew.bat`, `gradle-wrapper.jar`).
4. Writes root and app `build.gradle.kts` files plus the app
   `proguard-rules.pro` file referenced by release builds.
5. Writes `AndroidManifest.xml`.
6. Generates Kotlin source files.
7. Writes resource XML files (strings, colours, themes).
8. Optional: Validates configured icon/splash assets and writes deterministic Android resource outputs.
9. In dev mode, copies `.nativite/dev.json` to `app/src/main/assets/dev.json` after normalizing loopback hosts to `10.0.2.2`.
10. Writes `.hash-android` for dirty-check optimization.
11. In non-dev generation modes, removes stale `assets/dev.json` so production builds do not carry dev server configuration.

`AndroidManifest.xml` includes platform permissions required by configured
first-party plugins, including contacts, calendar, notifications, and local auth
`android.permission.USE_BIOMETRIC`.

## Toolchain Boundary

The `gradle wrapper` step requires a `gradle` command on `PATH`. Nativite
intentionally does not download, vendor, or bootstrap Gradle binaries or wrapper
JARs. Gradle, Java, Android Studio, and the Android SDK are machine-level
toolchain prerequisites that should be installed by the developer or CI image.

For 1.0 this global Gradle prerequisite is intentional. Before wrapper
generation, Nativite runs `gradle --version` as a preflight check. If that check
or the wrapper command fails, the error includes remediation steps to:

- Install Gradle or expose `gradle` on `PATH`.
- Verify Java is installed and `JAVA_HOME` points to a supported JDK.
- Verify the Android SDK is installed through Android Studio and
  `ANDROID_HOME` or `ANDROID_SDK_ROOT` is set when the environment requires it.
- Rerun `bunx nativite build --platform android` after fixing the toolchain.

Once bootstrapped, the generated wrapper uses the pinned Gradle distribution URL
in `gradle-wrapper.properties` for normal Gradle wrapper operation.

## Smoke Coverage

Android wrapper-file assertions are intentionally excluded from the default Bun
unit suite because they require invoking the host `gradle` tool and can download
the pinned Gradle distribution. The generated-app smoke suite covers those
outputs instead by generating a full Android project and running the generated
wrapper through `assembleDebug` and `assembleRelease`.

Generated Android projects keep release lint enabled by default. The smoke
runner passes `-PnativiteSmokeDisableReleaseLint=true` only for its temporary
release build fixture so smoke packaging can validate compilation and assets
without changing the lint policy of user-generated projects.

Run that coverage locally with:

```bash
bun run test:generated:native:android
```

## Dirty-Check Optimization

Same as iOS: SHA256 hash of normalised config, resolved plugin fingerprints, generated Kotlin/XML/Gradle template inputs, and configured native asset fingerprints. Skips regeneration if hash matches the stored `.hash-android` file.

This means package upgrades regenerate Android projects when embedded runtime or template output changes, even when the user's config is unchanged.

## Native Plugin Contributions

Android consumes `platforms.android` native plugin contributions during Gradle
project generation:

- `sources` are copied into `app/src/main/generated/nativite/plugins/java` and
  added to the main source set with `java.srcDirs(...)`.
- `resources` are copied into `app/src/main/generated/nativite/plugins/res` and
  added to the main source set with `res.srcDirs(...)`.
- `dependencies` are emitted into `app/build.gradle.kts` with Gradle `add(...)`
  calls. String dependencies default to the `implementation` configuration.
- `registrars` are emitted into `NativitePluginRegistrant.kt`, and
  `MainActivity` calls `registerNativitePlugins(bridge)` before rendering.

Plugin authors should expose Android registrars as Kotlin functions that accept
`NativiteBridge`, for example `fun registerCameraPlugin(bridge: NativiteBridge)`.
When that function lives outside the generated app package, declare it as
`{ symbol: "registerCameraPlugin", import: "com.example.camera.registerCameraPlugin" }`
so `NativitePluginRegistrant.kt` can import it before calling it.

## Configuration

The generator resolves platform-specific settings:

| Setting       | Default          | Description                   |
| ------------- | ---------------- | ----------------------------- |
| `minSdk`      | `26`             | Minimum Android SDK version   |
| `targetSdk`   | `36`             | Target Android SDK version    |
| `compileSdk`  | (from targetSdk) | Compile SDK version           |
| `bundleId`    | from config      | Application ID / package name |
| `versionCode` | from config      | Integer version code          |
| `versionName` | from config      | Display version string        |

Validation notes:

- `android()` uses the default `minSdk` of `26` when omitted.
- `minSdk` must be an integer when provided.
- `minSdk` must be at least `26`, matching the generated runtime's Android API requirements.
- `android()` uses the default `targetSdk` of `36` when omitted.
- `targetSdk` is optional, but must be an integer when provided.
- Google Play requires new apps and app updates to target an Android API level
  within one year of the latest major Android release. Apps can override
  `targetSdk` when they need to move ahead of Nativite's default for a newer
  policy deadline.

## Gradle Configuration

### Version Catalog (`libs.versions.toml`)

> Maps to: `src/native/android/version-catalog.ts`

| Dependency            | Version    |
| --------------------- | ---------- |
| Android Gradle Plugin | 8.13.2     |
| Kotlin                | 2.3.20     |
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
- `io.github.dokar3:quickjs-kt-android` only when `backgroundTasks` are configured
- Plugin Gradle dependencies declared through `platforms.android.dependencies`

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

Configured PNG or SVG icons are validated before generation. Nativite rasterizes deterministic foreground files named `ic_launcher_foreground.png` into each `mipmap-{density}` bucket and writes the adaptive icon wrapper in `mipmap-anydpi-v26/ic_launcher.xml`. See [Native Asset Pipeline](../shared/native-assets.md) for validation rules and opt-out behaviour.
