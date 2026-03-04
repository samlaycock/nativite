# Platform Comparison

A side-by-side comparison of how nativite features are implemented across iOS, Android, and macOS.

## Architecture

| Aspect          | iOS                               | Android                            | macOS                             |
| --------------- | --------------------------------- | ---------------------------------- | --------------------------------- |
| UI Framework    | UIKit + SwiftUI                   | Jetpack Compose (Material 3)       | AppKit + SwiftUI                  |
| Entry Point     | `@main` SwiftUI app               | `ComponentActivity`                | `@main` SwiftUI app               |
| WebView         | `WKWebView`                       | Android `WebView`                  | `WKWebView`                       |
| Bridge Protocol | `WKScriptMessageHandlerWithReply` | `WebMessagePort` (AndroidX WebKit) | `WKScriptMessageHandlerWithReply` |
| Project Format  | Xcode `.xcodeproj`                | Gradle (Kotlin DSL)                | Xcode `.xcodeproj`                |
| Language        | Swift                             | Kotlin                             | Swift                             |

## Chrome Areas

| Area               | iOS                                                                 | Android                             | macOS                                                                                |
| ------------------ | ------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| Title Bar          | SwiftUI `NavigationStack` toolbar modifiers + UIKit subtitle bridge | `TopAppBar` / `LargeTopAppBar`      | SwiftUI toolbar modifiers + `NSWindow` title properties                              |
| Navigation         | `UITabBar` / `UITabBarController` (iOS 18+)                         | `NavigationBar`                     | `NSSegmentedControl` + sidebar patterns                                              |
| Toolbar            | SwiftUI `.toolbar` (bottom bar)                                     | `BottomAppBar`                      | SwiftUI `.toolbar` with placement groups, customisation, display mode, toolbar style |
| Status Bar         | `preferredStatusBarStyle`                                           | `WindowInsetsController`            | N/A                                                                                  |
| Home Indicator     | `prefersHomeIndicatorAutoHidden`                                    | `WindowInsetsController` (nav bars) | N/A                                                                                  |
| Keyboard Accessory | `inputAccessoryView` override                                       | `Surface` above IME                 | N/A                                                                                  |
| Sidebar Panel      | N/A (iPad uses tabs/sidebar)                                        | N/A                                 | SwiftUI sidebar                                                                      |
| Menu Bar           | N/A                                                                 | N/A                                 | `NSMenu` / SwiftUI                                                                   |
| Sheets             | SwiftUI `sheet()`                                                   | `ModalBottomSheet`                  | SwiftUI `sheet()`                                                                    |
| Drawers            | N/A                                                                 | `ModalNavigationDrawer`             | SwiftUI / AppKit                                                                     |
| App Windows        | N/A                                                                 | N/A                                 | Separate `NSWindow`                                                                  |
| Popovers           | N/A                                                                 | `Popup`                             | `NSPopover`                                                                          |

## Bridge Transport

| Aspect          | iOS                                                 | Android                                               |
| --------------- | --------------------------------------------------- | ----------------------------------------------------- |
| JS → Native     | `webkit.messageHandlers.nativite.postMessage()`     | `MessagePort.postMessage()`                           |
| Request/Reply   | `postMessageWithReply()` (single roundtrip)         | Correlation ID matching                               |
| Native → JS     | `evaluateJavaScript("window.nativiteReceive(...)")` | `evaluateJavascript("window.nativiteReceive(...)")`   |
| Port Setup      | Automatic (WebKit handler)                          | Transferred via `postWebMessage("__nativite_port__")` |
| Reply Mechanism | `replyHandler(result, error)`                       | JSON reply through same port                          |

## CSS Variables

| Category        | iOS                                    | Android                           | macOS                                 |
| --------------- | -------------------------------------- | --------------------------------- | ------------------------------------- |
| Safe Area       | `view.safeAreaInsets`                  | `WindowInsetsCompat.systemBars()` | Limited                               |
| Chrome Geometry | UIKit frame measurements               | Compose runtime measurements      | `NSWindow` + AppKit view measurements |
| Keyboard        | `keyboardWillChangeFrame` notification | `WindowInsetsCompat.ime()`        | N/A                                   |
| Dark Mode       | `UITraitUserInterfaceStyle`            | `Configuration.UI_MODE_NIGHT_*`   | `NSApplication` notifications         |
| Dynamic Type    | `UIFont.preferredFont` sizes           | Not yet exposed                   | Fixed HIG sizes                       |
| Accent Colour   | `UIColor.tintColor` components         | Not yet exposed                   | `NSColor.controlAccentColor`          |
| Display         | `UIScreen` properties                  | Not yet exposed                   | `NSScreen` properties                 |

## Icon Systems

| Platform    | System                      | Examples                                      |
| ----------- | --------------------------- | --------------------------------------------- |
| iOS / macOS | SF Symbols                  | `"house.fill"`, `"gear"`, `"magnifyingglass"` |
| Android     | Material Icons (reflection) | `"Home"`, `"Settings"`, `"Search"`            |

## Dev Workflow

| Step               | iOS                                 | Android                     | macOS                  |
| ------------------ | ----------------------------------- | --------------------------- | ---------------------- |
| Project Generation | Xcode project                       | Gradle project              | Xcode project          |
| Device/Emulator    | iOS Simulator (simctl)              | Android Emulator (adb)      | Direct launch          |
| Dev URL Injection  | `SIMCTL_CHILD_NATIVITE_DEV_URL` env | `assets/dev.json` file      | `NATIVITE_DEV_URL` env |
| Build Tool         | `xcodebuild`                        | `gradle assembleDebug`      | `xcodebuild`           |
| Install            | `simctl install`                    | `adb install -r`            | N/A (direct launch)    |
| Launch             | `simctl launch`                     | `adb shell am start`        | Process launch         |
| Host Loopback      | Direct (simulator shares host)      | `10.0.2.2` (emulator alias) | Direct (native app)    |

## User-Agent Identification

| Platform | User-Agent Suffix      |
| -------- | ---------------------- |
| iPhone   | `Nativite/ios/1.0`     |
| iPad     | `Nativite/ipad/1.0`    |
| Android  | `Nativite/android/1.0` |
| macOS    | `Nativite/macos/1.0`   |

## File Extension Priority

| Platform | Resolution Order                                    |
| -------- | --------------------------------------------------- |
| iOS      | `.ios` → `.mobile` → `.native` → fallback           |
| iPad     | `.ipad` → `.ios` → `.mobile` → `.native` → fallback |
| Android  | `.android` → `.mobile` → `.native` → fallback       |
| macOS    | `.macos` → `.desktop` → `.native` → fallback        |
| Web      | `.web` → fallback                                   |

## Shared Data Between Webviews

| Platform    | Mechanism                                                 |
| ----------- | --------------------------------------------------------- |
| iOS / macOS | `WKWebsiteDataStore.default()` shared across all webviews |
| Android     | Same `WebView` session / `WebViewAssetLoader`             |
