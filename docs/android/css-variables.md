# Android CSS Variables

> Maps to: `src/native/android/runtime/NativiteVars.kt`
> Generated file: `NativiteVars.kt`

The CSS variables module injects the full shared `--nv-*` CSS variable contract into the webview as a `<style>` block, updates safe-area variables from Android window insets, keeps keyboard values in sync during IME animation, and refreshes device/orientation/appearance flags from the current Android configuration.

## Architecture

```kotlin
class NativiteVars(
    private val webView: WebView,
    private val bridge: NativiteBridge
)
```

## Initial Defaults

### `NativiteVars.buildInitScript()` (companion)

Returns a JS snippet injected in `onPageStarted` (before the `NativiteVars` instance is created) that:

1. Creates a `<style>` element on `document.documentElement` with all `--nv-*` variables set to defaults.
2. Defines a `window.__nv_patch()` helper function for efficient subsequent updates.

On Android, native chrome (title bar, navigation bar, toolbar) sits **around** the WebView in the Compose `Scaffold` layout rather than overlapping it. The init script therefore seeds conservative zero defaults first, then runtime inset updates replace the safe-area values with the current `systemBars + displayCutout` insets once the WebView has attached.

### Default values

| Variable                 | Default       | Notes                                                 |
| ------------------------ | ------------- | ----------------------------------------------------- |
| `--nv-safe-top`          | `0px`         | Replaced at runtime from `systemBars + displayCutout` |
| `--nv-safe-bottom`       | `0px`         | Replaced at runtime from `systemBars + displayCutout` |
| `--nv-safe-left`         | `0px`         | Replaced at runtime from `systemBars + displayCutout` |
| `--nv-safe-right`        | `0px`         | Replaced at runtime from `systemBars + displayCutout` |
| `--nv-inset-top`         | `0px`         | Combined safe area + chrome (all handled)             |
| `--nv-inset-bottom`      | `0px`         | Combined safe area + chrome (all handled)             |
| `--nv-inset-left`        | `0px`         | Same as safe-left                                     |
| `--nv-inset-right`       | `0px`         | Same as safe-right                                    |
| `--nv-nav-height`        | `0px`         | Chrome sits outside webview                           |
| `--nv-nav-visible`       | `0`           | Updated from rendered Compose chrome                  |
| `--nv-tab-height`        | `0px`         | Chrome sits outside webview                           |
| `--nv-tab-visible`       | `0`           | Updated from rendered Compose chrome                  |
| `--nv-toolbar-height`    | `0px`         | Chrome sits outside webview                           |
| `--nv-toolbar-visible`   | `0`           | Updated from rendered Compose chrome                  |
| `--nv-status-height`     | `0px`         | Replaced at runtime with the top safe inset           |
| `--nv-keyboard-height`   | `0px`         | Updated dynamically via IME inset observer            |
| `--nv-keyboard-visible`  | `0`           | Updated dynamically via IME inset observer            |
| `--nv-keyboard-floating` | `0`           | Android reports docked IME only                       |
| `--nv-keyboard-inset`    | `0px`         | Updated dynamically via IME inset observer            |
| `--nv-keyboard-duration` | `250ms`       | Updated during IME animation callbacks                |
| `--nv-keyboard-curve`    | `ease-in-out` | Updated during IME animation callbacks                |
| `--nv-is-phone`          | `1`           | Updated from `Configuration`                          |
| `--nv-is-tablet`         | `0`           | Updated from `Configuration`                          |
| `--nv-is-desktop`        | `0`           |                                                       |
| `--nv-is-dark`           | `0`           | Updated from Android night mode                       |
| `--nv-is-light`          | `1`           | Updated from Android night mode                       |

The init script also seeds the rest of the shared variable surface from `src/css-vars/index.ts`, including navigation-state flags, display metrics, accent colour channels, and default font-size tokens. Android does not emit undocumented `--nv-sidebar-*` variables.

## Keyboard Observation

### `startObserving()`

Installs both a `ViewCompat.setOnApplyWindowInsetsListener()` and a `WindowInsetsAnimationCompat.Callback` on the WebView:

- IME insets come from `WindowInsetsCompat.Type.ime()`
- Safe-area values come from `WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()`
- Keyboard duration and curve are refreshed during IME animation progress

### Variables Updated Dynamically

| Variable                 | Source                       | Description            |
| ------------------------ | ---------------------------- | ---------------------- |
| `--nv-safe-top`          | System bars + display cutout | Top safe inset         |
| `--nv-safe-bottom`       | System bars + display cutout | Bottom safe inset      |
| `--nv-safe-left`         | System bars + display cutout | Left safe inset        |
| `--nv-safe-right`        | System bars + display cutout | Right safe inset       |
| `--nv-status-height`     | System bars + display cutout | Same as top safe inset |
| `--nv-keyboard-height`   | IME bottom                   | Soft keyboard height   |
| `--nv-keyboard-visible`  | IME bottom                   | `1` when open          |
| `--nv-keyboard-floating` | IME state                    | Always `0` on Android  |
| `--nv-keyboard-inset`    | IME bottom                   | Same as height         |
| `--nv-keyboard-duration` | IME animation                | Animation duration     |
| `--nv-keyboard-curve`    | IME animation                | CSS timing function    |

## Chrome Geometry Updates

Chrome geometry variables are pushed from **rendered Compose measurements**, not fixed constants:

- `NativiteApp` measures title/navigation/toolbar heights using `onGloballyPositioned`.
- The measurements are forwarded to `NativiteBridge.updateRenderedChromeGeometry(...)`.
- The bridge then patches:
  - `--nv-nav-height` / `--nv-nav-visible`
  - `--nv-tab-height` / `--nv-tab-visible`
  - `--nv-toolbar-height` / `--nv-toolbar-visible`

This keeps CSS values aligned with the actual chrome currently on screen (including large-title and search variants).

## Custom Variable Injection

### `pushCustomVars(vars: Map<String, String>)`

Accepts arbitrary CSS variables from other modules.

Used by the bridge to inject measured chrome geometry variables:

- `--nv-nav-height` / `--nv-nav-visible`
- `--nv-tab-height` / `--nv-tab-visible`
- `--nv-toolbar-height` / `--nv-toolbar-visible`

### `updateVar(name: String, value: String)`

Tracks changes to avoid duplicate updates. Only variables whose value has actually changed are included in the next flush.

## Flushing

### `flush()`

Batches all pending variable changes into a single `window.__nv_patch()` call via `evaluateJavascript()`:

```javascript
if (window.__nv_patch) {
  window.__nv_patch({ "--nv-keyboard-height": "300px", "--nv-keyboard-visible": "1" });
}
```

## Dark Mode & `prefers-color-scheme`

The injected CSS includes `color-scheme: light dark` on `:root`, which:

- Enables `@media (prefers-color-scheme: dark)` CSS media queries to match the system setting
- Adapts UA default colours (page background, text, form controls, scrollbars) automatically

### `data-nv-theme` attribute

A `data-nv-theme` attribute (`"dark"` or `"light"`) is set on `<html>` and updated in real time when the system configuration changes. This provides a reliable CSS selector for dark mode:

```css
html[data-nv-theme="dark"] body {
  background: #1a1a1a;
}
```

For Tailwind CSS 4, use `data-nv-theme` in your custom dark variant:

```css
@custom-variant dark (&:where(html[data-nv-theme="dark"], html[data-nv-theme="dark"] *));
```

All three approaches are available for dark mode styling: the `data-nv-theme` attribute, `@media (prefers-color-scheme: dark)`, and the `--nv-is-dark` / `--nv-is-light` custom properties.

## Comparison with iOS

| Aspect            | iOS                                  | Android                                      |
| ----------------- | ------------------------------------ | -------------------------------------------- |
| Initial injection | `WKUserScript` at documentStart      | `evaluateJavascript` in `onPageStarted`      |
| Update mechanism  | `window.__nv_patch()` helper         | `window.__nv_patch()` helper (same)          |
| Safe area vars    | Derived from actual insets           | Derived from `systemBars + displayCutout`    |
| Keyboard tracking | `UIResponder` keyboard notifications | `Type.ime()` + `WindowInsetsAnimationCompat` |
