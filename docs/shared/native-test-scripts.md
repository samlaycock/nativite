# Native Test Scripts

> Maps to: `package.json`, `scripts/test-native-ios.ts`, `scripts/test-native-android.ts`

Nativite exposes Bun scripts for running the native runtime test suites without
checking generated projects into the repo.

## Available Commands

```bash
bun run test:native:ios
bun run test:native:android
bun run test:native
```

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
