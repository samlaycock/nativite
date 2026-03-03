# iOS CSS Variables

> Maps to: `src/ios/templates/nativite-vars.ts`
> Generated file: `NativiteVars.swift`

The CSS variables layer injects 70+ `--nk-*` CSS custom properties into the webview, keeping web content aware of native layout, device state, and accessibility settings in real time.

## Architecture

The `NativiteVars` class manages a `WKUserScript` injected at `documentStart` (before any other script runs) that:

1. Creates a `<style>` element on `document.documentElement` with all `--nk-*` variables set to defaults.
2. Defines a `window.__nk_patch()` helper function for efficient subsequent updates.
3. Sets the `data-nk-platform` attribute on `documentElement` (`"ios"`, `"ipad"`, or `"macos"`).

## Update Sources

| Source                 | Trigger                                   | Variables Updated                      |
| ---------------------- | ----------------------------------------- | -------------------------------------- |
| `updateSafeArea()`     | `viewDidLayoutSubviews()`                 | Safe area insets                       |
| `updateTraits()`       | Trait collection changes                  | Dark mode, accessibility, Dynamic Type |
| `updateChrome()`       | Chrome state changes                      | Nav/tab/toolbar geometry               |
| Keyboard notifications | `keyboardWillChange` / `keyboardWillHide` | Keyboard height/visibility             |

## Full Variable Reference

### Safe Area

| Variable           | Type | Description            |
| ------------------ | ---- | ---------------------- |
| `--nk-safe-top`    | `px` | Top safe area inset    |
| `--nk-safe-bottom` | `px` | Bottom safe area inset |
| `--nk-safe-left`   | `px` | Left safe area inset   |
| `--nk-safe-right`  | `px` | Right safe area inset  |

### Combined Insets

Includes safe area plus any native chrome that overlaps the webview:

| Variable            | Type | Description                          |
| ------------------- | ---- | ------------------------------------ |
| `--nk-inset-top`    | `px` | Safe area + nav bar height           |
| `--nk-inset-bottom` | `px` | Safe area + tab bar / toolbar height |
| `--nk-inset-left`   | `px` | Safe area + sidebar width            |
| `--nk-inset-right`  | `px` | Safe area                            |

### Chrome Geometry

| Variable               | Type      | Description                       |
| ---------------------- | --------- | --------------------------------- |
| `--nk-nav-height`      | `px`      | Navigation bar height             |
| `--nk-nav-visible`     | `0` / `1` | Whether navigation bar is visible |
| `--nk-tab-height`      | `px`      | Tab bar height                    |
| `--nk-tab-visible`     | `0` / `1` | Whether tab bar is visible        |
| `--nk-toolbar-height`  | `px`      | Toolbar height                    |
| `--nk-toolbar-visible` | `0` / `1` | Whether toolbar is visible        |
| `--nk-status-height`   | `px`      | Status bar height                 |

### Keyboard

| Variable                 | Type      | Description                          |
| ------------------------ | --------- | ------------------------------------ |
| `--nk-keyboard-height`   | `px`      | Software keyboard height             |
| `--nk-keyboard-visible`  | `0` / `1` | Whether keyboard is shown            |
| `--nk-keyboard-floating` | `0` / `1` | Whether keyboard is floating (iPad)  |
| `--nk-keyboard-inset`    | `px`      | Combined keyboard + safe area bottom |
| `--nk-keyboard-duration` | `s`       | Keyboard animation duration          |
| `--nk-keyboard-curve`    | string    | Keyboard animation curve identifier  |

### Device

| Variable              | Type      | Description                       |
| --------------------- | --------- | --------------------------------- |
| `--nk-is-phone`       | `0` / `1` | Running on iPhone                 |
| `--nk-is-tablet`      | `0` / `1` | Running on iPad                   |
| `--nk-is-desktop`     | `0` / `1` | Running on macOS                  |
| `--nk-is-portrait`    | `0` / `1` | Portrait orientation              |
| `--nk-is-landscape`   | `0` / `1` | Landscape orientation             |
| `--nk-display-scale`  | number    | Device display scale (1x, 2x, 3x) |
| `--nk-display-corner` | `px`      | Display corner radius             |

### Appearance

| Variable                    | Type      | Description                    |
| --------------------------- | --------- | ------------------------------ |
| `--nk-is-dark`              | `0` / `1` | Dark mode active               |
| `--nk-is-light`             | `0` / `1` | Light mode active              |
| `--nk-contrast`             | `0` / `1` | High contrast enabled          |
| `--nk-reduced-motion`       | `0` / `1` | Reduce motion preference       |
| `--nk-reduced-transparency` | `0` / `1` | Reduce transparency preference |
| `--nk-font-scale`           | number    | Dynamic Type scaling factor    |

### Accent Colour

| Variable        | Type    | Description                   |
| --------------- | ------- | ----------------------------- |
| `--nk-accent-r` | `0-255` | Accent colour red component   |
| `--nk-accent-g` | `0-255` | Accent colour green component |
| `--nk-accent-b` | `0-255` | Accent colour blue component  |
| `--nk-accent`   | `rgb()` | Composed accent colour value  |

### Dynamic Type (Font Sizes)

All values are in `px` and reflect the user's Dynamic Type preference:

| Variable                | iOS Default |
| ----------------------- | ----------- |
| `--nk-font-body`        | 17px        |
| `--nk-font-callout`     | 16px        |
| `--nk-font-caption1`    | 12px        |
| `--nk-font-caption2`    | 11px        |
| `--nk-font-footnote`    | 13px        |
| `--nk-font-headline`    | 17px        |
| `--nk-font-subheadline` | 15px        |
| `--nk-font-title1`      | 28px        |
| `--nk-font-title2`      | 22px        |
| `--nk-font-title3`      | 20px        |
| `--nk-font-largeTitle`  | 34px        |

## macOS Differences

- No keyboard variables (no software keyboard)
- No status bar height
- Always `--nk-is-desktop=1`, `--nk-is-landscape=1`
- Fixed font sizes per macOS HIG (not Dynamic Type)
- Appearance changes tracked via `NSApplication` notifications instead of trait collection changes

## Usage in CSS

```css
/* Adapt to native chrome insets */
.content {
  padding-top: var(--nk-inset-top);
  padding-bottom: var(--nk-inset-bottom);
}

/* React to keyboard */
.chat-input {
  transform: translateY(calc(-1 * var(--nk-keyboard-height)));
  transition-duration: var(--nk-keyboard-duration);
}

/* Dark mode */
:root[style*="--nk-is-dark: 1"] {
  --bg: #1a1a1a;
}

/* Respect Dynamic Type */
body {
  font-size: var(--nk-font-body);
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  /* also available as --nk-reduced-motion */
}
```
