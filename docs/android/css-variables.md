# Android CSS Variables

> Maps to: `src/android/templates/nativite-vars.ts`
> Generated file: `NativiteVars.kt`

The CSS variables module injects `--nk-*` CSS custom properties into the webview as a `<style>` block and observes Android window insets for keyboard tracking.

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

1. Creates a `<style>` element on `document.documentElement` with all `--nk-*` variables set to defaults.
2. Defines a `window.__nk_patch()` helper function for efficient subsequent updates.

On Android, native chrome (title bar, navigation bar, toolbar) sits **around** the WebView in the Compose `Scaffold` layout rather than overlapping it. This means safe-area and chrome-geometry variables default to `0px` — the Scaffold already provides the necessary padding.

### Default values

| Variable                | Default | Notes                                      |
| ----------------------- | ------- | ------------------------------------------ |
| `--nk-safe-top`         | `0px`   | Scaffold handles status bar padding        |
| `--nk-safe-bottom`      | `0px`   | Scaffold handles navigation bar padding    |
| `--nk-safe-left`        | `0px`   | Scaffold handles display cutout            |
| `--nk-safe-right`       | `0px`   | Scaffold handles display cutout            |
| `--nk-inset-top`        | `0px`   | Combined safe area + chrome (all handled)  |
| `--nk-inset-bottom`     | `0px`   | Combined safe area + chrome (all handled)  |
| `--nk-inset-left`       | `0px`   | Same as safe-left                          |
| `--nk-inset-right`      | `0px`   | Same as safe-right                         |
| `--nk-nav-height`       | `0px`   | Chrome sits outside webview                |
| `--nk-nav-visible`      | `0`     | Updated via `pushCustomVars`               |
| `--nk-tab-height`       | `0px`   | Chrome sits outside webview                |
| `--nk-tab-visible`      | `0`     | Updated via `pushCustomVars`               |
| `--nk-toolbar-height`   | `0px`   | Chrome sits outside webview                |
| `--nk-toolbar-visible`  | `0`     | Updated via `pushCustomVars`               |
| `--nk-status-height`    | `0px`   | Scaffold handles status bar                |
| `--nk-keyboard-height`  | `0px`   | Updated dynamically via IME inset observer |
| `--nk-keyboard-visible` | `0`     | Updated dynamically via IME inset observer |
| `--nk-keyboard-inset`   | `0px`   | Updated dynamically via IME inset observer |
| `--nk-is-phone`         | `1`     | Default device type                        |
| `--nk-is-tablet`        | `0`     |                                            |
| `--nk-is-desktop`       | `0`     |                                            |
| `--nk-is-dark`          | `0`     |                                            |
| `--nk-is-light`         | `1`     |                                            |

## Keyboard Observation

### `startObserving()`

Installs a `ViewCompat.setOnApplyWindowInsetsListener()` on the WebView that captures IME (soft keyboard) insets via `WindowInsetsCompat.Type.ime()`.

System bar insets are **not** tracked as CSS variables because the Compose `Scaffold` already accounts for them in its padding.

### Variables Updated Dynamically

| Variable                | Source     | Description          |
| ----------------------- | ---------- | -------------------- |
| `--nk-keyboard-height`  | IME bottom | Soft keyboard height |
| `--nk-keyboard-visible` | IME bottom | `1` when open        |
| `--nk-keyboard-inset`   | IME bottom | Same as height       |

## Custom Variable Injection

### `pushCustomVars(vars: Map<String, String>)`

Accepts arbitrary CSS variables from other modules. Used by the bridge to inject chrome geometry variables:

- `--nk-nav-height` / `--nk-nav-visible`
- `--nk-tab-height` / `--nk-tab-visible`
- `--nk-toolbar-height` / `--nk-toolbar-visible`

### `updateVar(name: String, value: String)`

Tracks changes to avoid duplicate updates. Only variables whose value has actually changed are included in the next flush.

## Flushing

### `flush()`

Batches all pending variable changes into a single `window.__nk_patch()` call via `evaluateJavascript()`:

```javascript
if (window.__nk_patch) {
  window.__nk_patch({ "--nk-keyboard-height": "300px", "--nk-keyboard-visible": "1" });
}
```

## Comparison with iOS

| Aspect            | iOS                                  | Android                                 |
| ----------------- | ------------------------------------ | --------------------------------------- |
| Initial injection | `WKUserScript` at documentStart      | `evaluateJavascript` in `onPageStarted` |
| Update mechanism  | `window.__nk_patch()` helper         | `window.__nk_patch()` helper (same)     |
| Safe area vars    | Derived from actual insets           | `0px` (Scaffold handles spacing)        |
| Keyboard tracking | `UIResponder` keyboard notifications | `WindowInsetsCompat.Type.ime()`         |
