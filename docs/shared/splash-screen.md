# Splash Screen Control

> Maps to: `src/chrome/index.ts` (JS API), platform-specific bridge and view controller templates

The splash screen API gives developers control over when the splash screen hides. By default, the splash hides automatically when the webview finishes loading. With the splash API, you can keep it visible until your app is ready (data fetched, auth checked, etc.).

## JavaScript API

```javascript
import { chrome } from "nativite/chrome";

// Call at the top level of your module to prevent auto-hide
chrome.splash.preventAutoHide();

// Later, when your app is ready
chrome.splash.hide();
```

### `chrome.splash.preventAutoHide()`

Prevents the splash screen from automatically hiding when the page finishes loading. **Must be called synchronously at module top level** before any async work, so the flag is set before the native page-finished handler runs.

After calling this, you **must** eventually call `chrome.splash.hide()` to dismiss the splash.

### `chrome.splash.hide()`

Manually hides the splash screen. Sends a bridge message to the native side. Can be called with or without a prior `preventAutoHide()` call.

## How It Works

### Timing

The key challenge is that `preventAutoHide()` must take effect before the native `didFinish` (iOS) or `onPageFinished` (Android) handler runs. Since JavaScript modules execute during page load (before those handlers fire), `preventAutoHide()` sets a **synchronous window global** (`window.__nativite_splash_prevent_auto_hide__`). The native side checks this global via `evaluateJavaScript` in its page-finished handler.

### Flow

```
Page load starts
  -> JS modules execute (chrome.splash.preventAutoHide() sets window global)
  -> Page load finishes
  -> Native didFinish / onPageFinished fires
  -> Native checks window.__nativite_splash_prevent_auto_hide__
     -> If true:  splash stays visible
     -> If false: splash hides automatically (default behaviour)
  -> App calls chrome.splash.hide() when ready
  -> Bridge message __chrome_splash_hide__ hides the splash
```

## Platform Behaviour

### iOS

- The splash is a SwiftUI overlay controlled by `NativiteChromeState.splashVisible`.
- In `didFinish`, the view controller checks the JS global via `evaluateJavaScript`. If not set, sets `splashVisible = false`.
- `chrome.splash.hide()` sends `__chrome_splash_hide__` through the bridge, which sets `splashVisible = false`.
- Fade-out animation (0.2s ease-out) applies in both auto and manual hide.

### Android

- Uses the AndroidX `SplashScreen` API with `setKeepOnScreenCondition`.
- When splash is configured, `MainActivity` sets `bridge.splashKeepOnScreen = true` and installs the keep-on-screen condition.
- In `onPageFinished`, the webview checks the JS global. If not set, sets `splashKeepOnScreen = false` (auto-hide).
- `chrome.splash.hide()` sends `__chrome_splash_hide__` through the bridge, which sets `splashKeepOnScreen = false`.

### macOS

- macOS does not have a splash overlay. The API is available but `preventAutoHide()` and `hide()` are no-ops.

## Bridge Methods

| Method                   | Direction    | Description              |
| ------------------------ | ------------ | ------------------------ |
| `__chrome_splash_hide__` | JS to native | Manually hide the splash |

## Configuration

The splash screen itself is configured in `nativite.config`:

```javascript
{
  splash: {
    backgroundColor: "#1A2B3C",
    image: "assets/logo.png"  // optional
  }
}
```

The `preventAutoHide` / `hide` API works regardless of splash configuration. If no splash is configured, both methods are effectively no-ops.
