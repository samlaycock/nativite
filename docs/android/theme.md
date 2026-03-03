# Android Theme

> Maps to: `src/android/templates/nativite-theme.ts`
> Generated file: `NativiteTheme.kt`

The theme module wraps the app in a Material 3 theme with dynamic colour support.

## Composable

```kotlin
@Composable
fun NativiteTheme(content: @Composable () -> Unit)
```

## Dynamic Colours (Material You)

On Android 12+ (SDK 31+), the theme uses **dynamic colours** — Material You colours extracted from the user's wallpaper:

```kotlin
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    if (darkTheme) dynamicDarkColorScheme(context)
    else dynamicLightColorScheme(context)
}
```

## Fallback Colour Scheme

On older devices (SDK < 31), predefined light and dark colour schemes are used as fallback.

## Dark Mode Detection

Uses `isSystemInDarkTheme()` to automatically detect the system dark mode preference and apply the appropriate colour scheme.

## XML Theme

> Maps to: `src/android/templates/resources.ts`

The XML theme extends `android:Theme.Material.Light.NoActionBar` with:

| Item                              | Value                        | Purpose                                         |
| --------------------------------- | ---------------------------- | ----------------------------------------------- |
| `android:statusBarColor`          | `@android:color/transparent` | Transparent status bar for edge-to-edge         |
| `android:navigationBarColor`      | `@android:color/transparent` | Transparent navigation bar                      |
| `windowLayoutInDisplayCutoutMode` | `shortEdges`                 | Content extends into notch/display cutout areas |

### Splash Theme Variant (Optional)

If splash screen is configured:

```xml
<style name="Theme.{AppName}.Splash" parent="Theme.SplashScreen">
    <item name="windowSplashScreenBackground">{backgroundColor}</item>
    <item name="postSplashScreenTheme">@style/Theme.{AppName}</item>
</style>
```

Uses the Material 3 `Theme.SplashScreen` parent for the Android 12+ splash screen API.
