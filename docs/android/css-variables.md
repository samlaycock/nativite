# Android CSS Variables

> Maps to: `src/android/templates/nativite-vars.ts`
> Generated file: `NativiteVars.kt`

The CSS variables module injects `--nv-*` CSS custom properties into the webview as a `<style>` block, observes Android window insets for keyboard tracking, and updates device/orientation/appearance flags from the current Android configuration.

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

On Android, native chrome (title bar, navigation bar, toolbar) sits **around** the WebView in the Compose `Scaffold` layout rather than overlapping it. This means safe-area and chrome-geometry variables default to `0px` — the Scaffold already provides the necessary padding.

### Default values

| Variable                | Default | Notes                                      |
| ----------------------- | ------- | ------------------------------------------ |
| `--nv-safe-top`         | `0px`   | Scaffold handles status bar padding        |
| `--nv-safe-bottom`      | `0px`   | Scaffold handles navigation bar padding    |
| `--nv-safe-left`        | `0px`   | Scaffold handles display cutout            |
| `--nv-safe-right`       | `0px`   | Scaffold handles display cutout            |
| `--nv-inset-top`        | `0px`   | Combined safe area + chrome (all handled)  |
| `--nv-inset-bottom`     | `0px`   | Combined safe area + chrome (all handled)  |
| `--nv-inset-left`       | `0px`   | Same as safe-left                          |
| `--nv-inset-right`      | `0px`   | Same as safe-right                         |
| `--nv-nav-height`       | `0px`   | Chrome sits outside webview                |
| `--nv-nav-visible`      | `0`     | Updated from rendered Compose chrome       |
| `--nv-tab-height`       | `0px`   | Chrome sits outside webview                |
| `--nv-tab-visible`      | `0`     | Updated from rendered Compose chrome       |
| `--nv-toolbar-height`   | `0px`   | Chrome sits outside webview                |
| `--nv-toolbar-visible`  | `0`     | Updated from rendered Compose chrome       |
| `--nv-status-height`    | `0px`   | Scaffold handles status bar                |
| `--nv-keyboard-height`  | `0px`   | Updated dynamically via IME inset observer |
| `--nv-keyboard-visible` | `0`     | Updated dynamically via IME inset observer |
| `--nv-keyboard-inset`   | `0px`   | Updated dynamically via IME inset observer |
| `--nv-is-phone`         | `1`     | Updated from `Configuration`               |
| `--nv-is-tablet`        | `0`     | Updated from `Configuration`               |
| `--nv-is-desktop`       | `0`     |                                            |
| `--nv-is-dark`          | `0`     | Updated from Android night mode            |
| `--nv-is-light`         | `1`     | Updated from Android night mode            |

## Keyboard Observation

### `startObserving()`

Installs a `ViewCompat.setOnApplyWindowInsetsListener()` on the WebView that captures IME (soft keyboard) insets via `WindowInsetsCompat.Type.ime()`.

System bar insets are **not** tracked as CSS variables because the Compose `Scaffold` already accounts for them in its padding.

### Variables Updated Dynamically

| Variable                | Source     | Description          |
| ----------------------- | ---------- | -------------------- |
| `--nv-keyboard-height`  | IME bottom | Soft keyboard height |
| `--nv-keyboard-visible` | IME bottom | `1` when open        |
| `--nv-keyboard-inset`   | IME bottom | Same as height       |

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

## Comparison with iOS

| Aspect            | iOS                                  | Android                                 |
| ----------------- | ------------------------------------ | --------------------------------------- |
| Initial injection | `WKUserScript` at documentStart      | `evaluateJavascript` in `onPageStarted` |
| Update mechanism  | `window.__nv_patch()` helper         | `window.__nv_patch()` helper (same)     |
| Safe area vars    | Derived from actual insets           | `0px` (Scaffold handles spacing)        |
| Keyboard tracking | `UIResponder` keyboard notifications | `WindowInsetsCompat.Type.ime()`         |
