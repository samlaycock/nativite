# iOS Project Generation

> Maps to: `src/ios/generator.ts`
> Generated output: `.nativite/ios/` or `.nativite/macos/`

The generator creates a complete Xcode project from the user's configuration. It supports both iOS and macOS targets via the `AppleTargetPlatform` parameter.

## Generated Directory Structure

```
.nativite/{ios|macos}/
├── {AppName}.xcodeproj/
│   └── project.pbxproj
└── {AppName}/
    ├── NativiteApp.swift              # @main SwiftUI entry point
    ├── AppDelegate.swift              # Root view + splash overlay
    ├── ViewController.swift           # UIKit/AppKit view controller
    ├── NativiteBridge.swift           # JS↔Native bridge
    ├── NativiteChrome.swift           # Chrome state reconciliation
    ├── NativiteChromeState.swift      # SwiftUI @Observable model
    ├── NativiteVars.swift             # CSS custom property injection
    ├── NativiteKeyboard.swift         # Input accessory (iOS only)
    ├── NativitePluginRegistrant.swift # Auto-generated plugin registration
    ├── OTAUpdater.swift               # Over-the-air updates (if configured)
    ├── LaunchScreen.storyboard        # Splash screen (iOS only)
    ├── Info.plist                      # Platform manifest
    └── Assets.xcassets/
        ├── AppIcon.appiconset/
        │   └── Contents.json + icon image
        └── Splash.imageset/           # iOS only
            └── Contents.json + splash image
```

## Dirty-Check Optimization

The generator computes a SHA256 hash of the normalised config (including resolved plugin fingerprints). If the hash matches the stored `.hash-ios` or `.hash-macos` file from the previous generation, regeneration is skipped entirely.

A force regeneration is triggered when:

- The hash doesn't match (config changed)
- The `force` flag is passed
- Legacy detection finds the project needs migration (e.g., missing `NativiteApp.swift` entry point or presence of stale `NativiteRootView` in AppDelegate)

## Xcode Project File (`project.pbxproj`)

> Maps to: `src/ios/templates/pbxproj.ts`

Generates the Xcode project structure with:

- **Deterministic UUIDs**: Generated from SHA1 of seed strings (safe because the project is fully regenerated each time).
- **Source file type detection**: Recognises `.swift`, `.m`, `.mm`, `.c`, `.cpp`, `.metal`, `.h`.
- **Resource file detection**: Recognises `.storyboard`, `.xcassets`, `.plist`, `.png`, `.json`.
- **Build phases**:
  - `PBXSourcesBuildPhase` — Swift source compilation
  - `PBXFrameworksBuildPhase` — WebKit framework linking
  - `PBXResourcesBuildPhase` — Assets, storyboards, plists
  - Custom copy build phase for the `dist/` web bundle

### Platform-Specific Build Settings

| Setting               | iOS                        | macOS                  |
| --------------------- | -------------------------- | ---------------------- |
| `SUPPORTED_PLATFORMS` | `iphoneos iphonesimulator` | (not set)              |
| `SDKROOT`             | `iphoneos`                 | `macosx`               |
| `INFOPLIST_FILE`      | `{AppName}/Info.plist`     | `{AppName}/Info.plist` |

## Info.plist

> Maps to: `src/ios/templates/info-plist.ts`

### iOS

- `LSRequiresIPhoneOS = true`
- `UILaunchScreen` (system white, or custom storyboard reference)
- `UISupportedInterfaceOrientations` (portrait + both landscape)
- `NSAppTransportSecurity` with `NSAllowsLocalNetworking` for dev server

### macOS

- `LSMinimumSystemVersion`
- `NSHighResolutionCapable = true`
- `NSAppTransportSecurity` with `NSAllowsLocalNetworking`

## App Icon

> Maps to: `src/ios/templates/app-icon-contents.ts`

Uses Xcode 14+ single-image format:

- One 1024x1024 universal entry in `Contents.json`
- Xcode auto-generates all required sizes at build time
- User-provided icon file is copied in if configured

## Launch Screen (iOS Only)

> Maps to: `src/ios/templates/launch-screen.ts`

Generates `LaunchScreen.storyboard` with:

- Centred image (scale-to-fit, max 80% of screen)
- Custom background colour from config
- XIB/storyboard format with static IDs

## Plugin Registration

> Maps to: `src/ios/templates/nativite-plugin-registrant.ts`

Auto-generated file that registers all resolved plugins on the bridge:

```swift
func registerNativitePlugins(on bridge: NativiteBridge) {
    #if os(iOS)
    iosPlugin1Register(bridge)
    iosPlugin2Register(bridge)
    #elseif os(macOS)
    macosPlugin1Register(bridge)
    #endif
}
```

Plugins export C functions like `iosPluginNameRegister(_ bridge: NativiteBridge)` that call `bridge.register(namespace:method:handler:)`.
