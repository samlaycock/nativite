# Android WebView

> Maps to: `src/android/templates/nativite-webview.ts`
> Generated file: `NativiteWebView.kt`

The WebView module handles creation, lifecycle management, and URL resolution for both the main webview and child webviews (sheets, drawers, popovers).

## WebView Creation

```kotlin
fun createNativiteWebView(
    context: Context,
    bridge: NativiteBridge,
    instanceName: String
): WebView
```

### Configuration

| Setting                       | Value                             | Purpose                                        |
| ----------------------------- | --------------------------------- | ---------------------------------------------- |
| `javaScriptEnabled`           | `true`                            | Required for web content                       |
| `domStorageEnabled`           | `true`                            | localStorage / sessionStorage                  |
| `mixedContentMode`            | `MIXED_CONTENT_ALWAYS_ALLOW`      | Dev server compatibility                       |
| `algorithmicDarkeningAllowed` | `true` (SDK 33+)                  | Auto dark mode for web content                 |
| User-Agent                    | `"Nativite/android/1.0"` appended | Platform identification for dev server routing |

### Asset Loading

Uses `WebViewAssetLoader` to serve bundled assets from `context.assets`:

- Production assets are served from the `dist/` directory within the APK's assets.
- The `shouldInterceptRequest()` method routes asset requests through the loader.

### Page Lifecycle

**`onPageStarted`**: Injects `window.__nativekit_instance_name__`, sets `data-nv-platform="android"` on `<html>`, and initializes CSS variable defaults.

**`onPageFinished`**:

- Reapplies `data-nv-platform="android"` on the final loaded document (helps ensure visibility in DevTools after navigation commits).
- Calls `bridge.attachWebView()` to set up the message channel.
- If a SPA route was deferred (for child webviews with relative URLs in production), applies it via `history.replaceState()` + `popstate` event.

### Debugging

WebView debugging is explicitly gated by `BuildConfig.DEBUG`:

```kotlin
WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
```

## NativiteWebView Composable

```kotlin
@Composable
fun NativiteWebView(
    bridge: NativiteBridge,
    instanceName: String,
    url: String? = null  // null for main webview
)
```

### Compose Integration

Uses `AndroidView` to embed the native `WebView` in the Compose hierarchy.

### Lifecycle Management

Observes the `LocalLifecycleOwner` via `DisposableEffect`:

| Lifecycle Event | Action                                        |
| --------------- | --------------------------------------------- |
| `ON_PAUSE`      | `webView.onPause()`                           |
| `ON_RESUME`     | `webView.onResume()`                          |
| Disposal        | `bridge.detachWebView()`, `webView.destroy()` |

### URL Loading

URL loading is triggered via `DisposableEffect` on the `url` dependency:

- **Main webview** (`url == null`): Calls `resolveContentUrl()` to determine dev or production URL.
- **Child webview** (`url != null`): Calls `resolveChildUrl()` for resolution.

## URL Resolution

### `resolveContentUrl(context)`

Returns the URL to load for the main webview:

1. **Development (debug builds only)**: Reads `assets/dev.json` for `{ "devURL": "..." }`. Automatically maps `localhost` / `127.0.0.1` to `10.0.2.2` (Android emulator's host loopback address).
2. **Production (release builds)**: Skips `dev.json` and always returns `PRODUCTION_BASE_URL`.

### `resolveChildUrl(context, rawUrl)`

Returns a `Pair<String, String?>` where first is the URL to load and second is an optional SPA route to apply after load.

| URL Type                  | Behaviour                                                                    |
| ------------------------- | ---------------------------------------------------------------------------- |
| Absolute (contains `://`) | Used as-is, no SPA route                                                     |
| Relative, dev mode        | Resolved against the dev server base URL                                     |
| Relative, production      | Loads production entry point; SPA route applied via `history.replaceState()` |

### Production Base URL

```kotlin
const val PRODUCTION_BASE_URL = "https://appassets.androidplatform.net/assets/dist/index.html"
```

This is the virtual URL used by `WebViewAssetLoader` to serve files from the APK's assets directory.

## SPA Route Application

For child webviews with relative URLs in production mode, the SPA route is applied after the page loads:

```javascript
history.replaceState(null, "", "/route");
window.dispatchEvent(new PopStateEvent("popstate"));
```

This is injected in `onPageFinished` and allows the SPA router (React Router, Vue Router, etc.) to pick up the route without requiring a separate HTML entry point per child webview.
