# Native Test Scripts

> Maps to: `package.json`, `scripts/test-native-ios.ts`, `scripts/test-native-android.ts`, `scripts/test-generated-native-apps.ts`

Nativite exposes Bun scripts for running the native runtime test suites without
checking generated projects into the repo.

## Available Commands

```bash
bun run test:native:ios
bun run test:native:android
bun run test:native
bun run test:generated:native:ios
bun run test:generated:native:macos
bun run test:generated:native:android
bun run test:generated:native
```

## Continuous Integration

The native runtime suites and generated-app smoke suites run in
`.github/workflows/native-tests.yml`.

The workflow keeps the iOS and Android suites in separate jobs because they
require different host environments:

- iOS runtime tests run on `macos-latest` with the active Xcode Swift toolchain.
- Android runtime tests run on `ubuntu-latest` with Temurin Java 17 and Gradle
  configured through `gradle/actions/setup-gradle`.
- Generated iOS and macOS app smoke tests run on `macos-latest` because they
  compile generated Xcode projects with `xcodebuild`.
- Generated Android app smoke tests run on `ubuntu-latest` with Temurin Java 17
  and Gradle because they compile a generated Gradle app project.

The publish workflow also gates release creation and package publishing on the
native runtime and generated-app smoke jobs. A native compile or packaging
failure therefore blocks publish.

## iOS Runtime Tests

`bun run test:native:ios` creates a temporary Swift package, copies
`src/native/ios/runtime/*.swift` into a `NativiteRuntime` target, injects a
stub `NativiteConfig.swift`, copies `src/native/ios/runtime/Tests/*.swift` into
an XCTest target, and runs `swift test` via the active Xcode toolchain.

The temporary package is removed after the test run completes.

## Android Runtime Tests

`bun run test:native:android` creates a temporary Android library project,
copies `src/native/android/runtime/*.kt` and
`src/native/android/runtime/tests/*.kt` into package-scoped source sets,
injects a stub `NativiteConfig.kt`, and runs `gradle testDebugUnitTest`.

The harness enables Compose, BuildConfig generation, and Robolectric-backed JVM
unit tests so the runtime helpers can execute without a checked-in Android app
project. The temporary Gradle build uses AndroidX-enabled properties and Kotlin
compiler options compatible with the current Android Gradle Plugin, so it
should run without the previous namespace and deprecated `kotlinOptions`
warnings.

The temporary Gradle project is removed after the test run completes.

## Generated App Smoke Tests

`bun run test:generated:native:*` creates a temporary app fixture for each
target platform, enables every first-party native plugin, writes a minimal
`dist-<platform>/index.html` bundle, generates the native project in build mode,
and compiles/packages the result with the native platform toolchain.

The iOS and macOS smoke tests run both Debug compile coverage and Release
`build-for-testing` coverage through `xcodebuild` with code signing disabled.
This verifies generated Swift sources, framework links, Info.plist entries,
bundle resources, and release web-bundle copy phases.

The Android smoke test runs `assembleDebug` and `assembleRelease` through the
generated Gradle wrapper. This verifies generated Kotlin sources, plugin
registrants, manifest entries, generated resources, Gradle dependencies, and
release web-bundle packaging. The release smoke build passes
`-PnativiteSmokeDisableReleaseLint=true` so generated apps keep release lint
enabled by default while the smoke fixture focuses on native packaging coverage.

Set `NATIVITE_GENERATED_SMOKE_LAUNCH=1` to add launch smoke coverage after the
required compile/package steps. The runner launches the generated macOS app and
keeps it under `open --wait-apps` observation long enough to catch immediate
startup exits, installs and launches the iOS app when a simulator is already
booted, and runs `installDebug` plus an Android launcher intent when
`adb devices` reports an available emulator or device. Missing launch targets
are reported as skipped so CI can keep compile/package failures required without
depending on simulator or emulator availability in every job.

The fixture is deleted after the run. Set
`NATIVITE_KEEP_GENERATED_SMOKE_FIXTURE=1` to keep it for local debugging.
