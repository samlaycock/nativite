# Android Main Activity

> Maps to: `src/android/templates/main-activity.ts`
> Generated file: `MainActivity.kt`

The `MainActivity` is the single entry point for the Android app, extending `ComponentActivity` for Jetpack Compose support.

## Class Hierarchy

```
ComponentActivity
  └── MainActivity
        ├── owns: NativiteBridge
        └── sets Compose content: NativiteTheme → NativiteApp
```

## Lifecycle

### `onCreate`

```kotlin
class MainActivity : ComponentActivity() {
    private val bridge = NativiteBridge()

    override fun onCreate(savedInstanceState: Bundle?) {
        // If splash configured:
        bridge.splashKeepOnScreen.value = true
        installSplashScreen().setKeepOnScreenCondition { bridge.splashKeepOnScreen.value }

        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        bridge.getDefaultChromeState()?.let { defaultState ->
            bridge.chromeState.value = defaultState
        }

        setContent {
            NativiteTheme {
                NativiteApp(bridge = bridge)
            }
        }
    }
}
```

### Key Steps

1. **Splash Screen** (optional): If configured, sets `bridge.splashKeepOnScreen = true` and calls `installSplashScreen().setKeepOnScreenCondition { ... }` to keep the OS splash visible until the webview finishes loading (or until `chrome.splash.hide()` is called from JS). See [Splash Screen Control](../shared/splash-screen.md).
2. **Edge-to-Edge**: Calls `enableEdgeToEdge()` to render behind the status bar and navigation bar with transparent system bars.
3. **Default Chrome**: If the configuration includes a `defaultChrome` state, it is parsed from an embedded JSON string and applied to `bridge.chromeState.value` before content renders.
4. **Compose Content**: Sets the activity content to `NativiteTheme { NativiteApp(bridge) }`.

## Android Manifest Configuration

> Maps to: `src/android/templates/android-manifest.ts`

```xml
<activity
    android:name=".MainActivity"
    android:exported="true"
    android:configChanges="orientation|screenSize|screenLayout|keyboardHidden"
    android:windowSoftInputMode="adjustResize">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
</activity>
```

| Attribute             | Value                                                 | Purpose                                            |
| --------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| `exported`            | `true`                                                | Required for launcher activity                     |
| `configChanges`       | orientation, screenSize, screenLayout, keyboardHidden | Activity survives these changes without recreation |
| `windowSoftInputMode` | `adjustResize`                                        | Resizes content when soft keyboard appears         |

## Permissions

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

Required for dev server connectivity and any web content loading.

## Other Manifest Settings

- `android:usesCleartextTraffic="true"` — Allows HTTP connections for the dev server.
- `android:theme="@style/Theme.{SanitizedAppName}"` — References the generated Material 3 theme.
