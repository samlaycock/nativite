# Nativite Platform Documentation

Technical reference for how nativite features are implemented on each native platform.

## iOS

- [View Controller](./ios/view-controller.md) — Primary UIViewController hosting WKWebView
- [Native Bridge](./ios/bridge.md) — JS↔Swift communication via WKScriptMessageHandlerWithReply
- [Chrome Reconciliation](./ios/chrome.md) — iOS/macOS chrome state reconciliation (SwiftUI + UIKit/AppKit)
- [Chrome State Model](./ios/chrome-state.md) — SwiftUI @Observable model for chrome areas
- [CSS Variables](./ios/css-variables.md) — 70+ `--nv-*` CSS custom properties
- [Keyboard & Input Accessory](./ios/keyboard.md) — Keyboard dismiss modes and accessory bar
- [App Entry Point](./ios/app-entry.md) — SwiftUI @main, root view, splash overlay
- [Project Generation](./ios/project-generation.md) — Xcode project generation and structure
- [Background Tasks](./ios/background-tasks.md) — BGTaskScheduler registration and JavaScriptCore execution
- [OTA Updates](./ios/ota-updates.md) — Over-the-air bundle updates
- [Dev Workflow](./ios/dev-workflow.md) — IDE-owned debug runs and dev server integration

## Android

- [Main Activity](./android/main-activity.md) — ComponentActivity entry point
- [Native Bridge](./android/bridge.md) — JS↔Kotlin communication via WebMessagePort
- [Chrome UI](./android/chrome.md) — Jetpack Compose Material 3 chrome components
- [WebView](./android/webview.md) — WebView creation, lifecycle, and URL resolution
- [CSS Variables](./android/css-variables.md) — Safe area and keyboard CSS properties
- [Theme](./android/theme.md) — Material 3 dynamic colours and theming
- [Project Generation](./android/project-generation.md) — Gradle project generation and structure
- [Dev Workflow](./android/dev-workflow.md) — IDE-owned debug runs and dev server integration
- [Background Tasks](./android/background-tasks.md) — QuickJS runtime adapter for bundled task execution
- [OTA Updates](./android/bridge.md#ota-placeholder) — Not implemented yet; Android bridge OTA checks currently return `{ available: false }`

## macOS

- [Overview](./macos/overview.md) — Shared codebase with iOS, macOS-specific features (sidebar, menu bar, app windows)

## Shared / Cross-Platform

- [Drop-In Quickstart](./shared/quickstart.md) — Shortest path from existing Vite app to native shell
- [Chrome API](./shared/chrome-api.md) — JavaScript runtime for controlling native chrome
- [Splash Screen Control](./shared/splash-screen.md) — Manual splash screen hide with `chrome.splash`
- [Native Asset Pipeline](./shared/native-assets.md) — Icon and splash asset validation and platform output mapping
- [Chrome Types](./shared/chrome-types.md) — Full type definitions for all chrome areas and events
- [Client Bridge](./shared/client-bridge.md) — Low-level RPC and event subscription API
- [CSS Variables Module](./shared/css-vars-module.md) — Observable access to `--nv-*` variables
- [Background Tasks](./shared/background-tasks.md) — JavaScript task authoring API and manifest model
- [App Testing Strategy](./shared/app-testing-strategy.md) — Choosing between regular Vitest, stub-host Browser Mode, and native provider tests
- [JavaScript Test Utilities](./shared/test-utilities.md) — `nativite/test` local stub host and native harness helpers
- [Native Test Protocol](./shared/native-test-protocol.md) — Debug-only coordinator/harness protocol for native-aware tests
- [Native Test Harness](./shared/native-test-harness.md) — Generated iOS, macOS, and Android debug harness configuration
- [Vitest Browser Provider](./shared/vitest-browser-provider.md) — Real-native Vitest Browser Mode provider contract
- [Contacts Plugin](./shared/contacts-plugin.md) — First-party native address-book plugin API and platform behavior
- [Calendar Plugin](./shared/calendar-plugin.md) — First-party native calendar, event, and reminder plugin API
- [Notifications Plugin](./shared/notifications-plugin.md) — First-party native local notifications plugin API and platform behavior
- [Secure Store Plugin](./shared/secure-store-plugin.md) — First-party Keychain and Keystore-backed secure string storage
- [Local Auth Plugin](./shared/local-auth-plugin.md) — First-party native biometric and device-credential user-presence prompts
- [System Controls Plugin](./shared/system-controls-plugin.md) — First-party keep-awake, orientation, brightness, and power status controls
- [Haptics Plugin](./shared/haptics-plugin.md) — First-party native semantic haptic feedback
- [App Integrity Plugin](./shared/app-integrity-plugin.md) — First-party App Attest and Play Integrity attestation bridge
- [Capture Protection Plugin](./shared/capture-protection-plugin.md) — First-party screen capture prevention and capture detection bridge
- [Native Test Scripts](./shared/native-test-scripts.md) — Bun commands for running Swift and Kotlin runtime tests
- [CLI Init Command](./shared/cli-init.md) — One-command setup for existing Vite projects
- [CLI Dev Command](./shared/cli-dev.md) — Optional native development status dashboard
- [CLI Test Command](./shared/cli-test.md) — Vitest Browser Mode orchestration for native-aware app tests
- [CLI Build Command](./shared/cli-build.md) — Production native build output and next steps
- [Vite Plugin](./shared/vite-plugin.md) — Build pipeline, dev server routing, HMR
- [Desktop Web Engines](./shared/desktop-web-engines.md) — Desktop-only system and Chromium web engine selection
- [Platform Registry](./shared/platform-registry.md) — Platform plugin resolution and config merging
- [Inter-Webview Messaging](./shared/inter-webview-messaging.md) — Communication between main and child webviews
- [Plugin System](./shared/plugin-system.md) — Third-party native capability registration
- [First-Party Plugin Platform Support](./shared/first-party-plugin-support.md) — Supported and stubbed native plugin platforms
- [Platform Comparison](./shared/platform-comparison.md) — Side-by-side feature comparison across platforms
- [Package Exports](./shared/package-exports.md) — Published import and require entrypoint contract

## Examples

- [`examples/background-tasks`](../examples/background-tasks/README.md) — End-to-end background task definitions, registration, and scheduling
