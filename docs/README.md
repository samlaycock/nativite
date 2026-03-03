# Nativite Platform Documentation

Technical reference for how nativite features are implemented on each native platform.

## iOS

- [View Controller](./ios/view-controller.md) — Primary UIViewController hosting WKWebView
- [Native Bridge](./ios/bridge.md) — JS↔Swift communication via WKScriptMessageHandlerWithReply
- [Chrome Reconciliation](./ios/chrome.md) — UIKit chrome state reconciliation
- [Chrome State Model](./ios/chrome-state.md) — SwiftUI @Observable model for chrome areas
- [CSS Variables](./ios/css-variables.md) — 70+ `--nk-*` CSS custom properties
- [Keyboard & Input Accessory](./ios/keyboard.md) — Keyboard dismiss modes and accessory bar
- [App Entry Point](./ios/app-entry.md) — SwiftUI @main, root view, splash overlay
- [Project Generation](./ios/project-generation.md) — Xcode project generation and structure
- [OTA Updates](./ios/ota-updates.md) — Over-the-air bundle updates
- [Dev Workflow](./ios/dev-workflow.md) — Simulator management and dev server integration

## Android

- [Main Activity](./android/main-activity.md) — ComponentActivity entry point
- [Native Bridge](./android/bridge.md) — JS↔Kotlin communication via WebMessagePort
- [Chrome UI](./android/chrome.md) — Jetpack Compose Material 3 chrome components
- [WebView](./android/webview.md) — WebView creation, lifecycle, and URL resolution
- [CSS Variables](./android/css-variables.md) — Safe area and keyboard CSS properties
- [Theme](./android/theme.md) — Material 3 dynamic colours and theming
- [Project Generation](./android/project-generation.md) — Gradle project generation and structure
- [Dev Workflow](./android/dev-workflow.md) — Emulator management and dev server integration

## macOS

- [Overview](./macos/overview.md) — Shared codebase with iOS, macOS-specific features (sidebar, menu bar, app windows)

## Shared / Cross-Platform

- [Chrome API](./shared/chrome-api.md) — JavaScript runtime for controlling native chrome
- [Chrome Types](./shared/chrome-types.md) — Full type definitions for all chrome areas and events
- [Client Bridge](./shared/client-bridge.md) — Low-level RPC and event subscription API
- [CSS Variables Module](./shared/css-vars-module.md) — Observable access to `--nk-*` variables
- [Vite Plugin](./shared/vite-plugin.md) — Build pipeline, dev server routing, HMR
- [Platform Registry](./shared/platform-registry.md) — Platform plugin resolution and config merging
- [Inter-Webview Messaging](./shared/inter-webview-messaging.md) — Communication between main and child webviews
- [Plugin System](./shared/plugin-system.md) — Third-party native capability registration
- [Platform Comparison](./shared/platform-comparison.md) — Side-by-side feature comparison across platforms
