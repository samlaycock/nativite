# iOS App Entry Point & Root View

> Maps to: `src/ios/templates/app-delegate.ts`
> Generated file: `NativiteApp.swift` (via `AppDelegate` template)

The app entry point uses SwiftUI's `@main` attribute and wraps the UIKit `ViewController` in a SwiftUI hierarchy.

## Structure

### NativiteApp (@main)

```swift
@main
struct NativiteApp: App {
    #if os(macOS)
    @NSApplicationDelegateAdaptor(NativiteAppDelegate.self) var appDelegate
    #endif

    var body: some Scene {
        WindowGroup {
            NativiteRootView()
        }
        #if os(macOS)
        .defaultSize(width: 1024, height: 768)
        #endif
    }
}
```

- Uses `WindowGroup` for multi-window support.
- macOS gets a default window size of 1024x768.
- macOS uses `@NSApplicationDelegateAdaptor` for the app delegate.

### NativiteRootView

#### iOS

The root view creates a `NavigationStack` wrapping the UIKit view controller:

```
NavigationStack
  └── NativiteViewControllerRepresentable
        └── ViewController (UIKit)
  + .nativiteTitleBar()      // SwiftUI title bar modifier
  + .nativiteToolbar()       // SwiftUI toolbar modifier
  + .nativiteSheets()        // Sheet presentation
  + .nativiteAlerts()        // Alert/confirm/prompt dialogs
  + Splash overlay           // Fade-out splash screen
```

#### macOS

Simpler structure without `NavigationStack`:

```
NativiteViewControllerRepresentable
  └── ViewController (NSViewController)
+ .nativiteSheets()
+ .nativiteAlerts()
```

### NativiteViewControllerRepresentable

A `UIViewControllerRepresentable` (iOS) / `NSViewControllerRepresentable` (macOS) that:

- Creates the `ViewController` instance.
- Injects `chromeState` into the view controller.
- On iOS, sets `navigationItem.prompt` for UIKit subtitle display.

## Splash Overlay (iOS Only)

The splash overlay appears on top of all content and fades out when the page load completes (or when manually hidden):

- **Background**: Uses `config.splash.backgroundColor` or falls back to `systemBackground`.
- **Image**: Optional centred image from `config.splash.image`.
- **Animation**: Smooth opacity transition when `chromeState.splashVisible` becomes `false`.
- **Manual control**: Developers can call `chrome.splash.preventAutoHide()` to keep the splash visible, then `chrome.splash.hide()` when ready. See [Splash Screen Control](../shared/splash-screen.md).

The overlay prevents the user from seeing a blank webview while content loads.

## macOS App Delegate

```swift
class NativiteAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}
```

- `.regular` activation policy ensures the app appears in the Dock with proper window management.
- App terminates when the last window is closed.
