# iOS CSS Variables

> Maps to: `src/ios/templates/nativite-vars.ts`
> Generated file: `NativiteVars.swift`

The CSS variables layer injects 70+ `--nv-*` CSS custom properties into the webview, keeping web content aware of native layout, device state, and accessibility settings in real time.

## Architecture

The `NativiteVars` class manages a `WKUserScript` injected at `documentStart` (before any other script runs) that:

1. Creates a `<style>` element on `document.documentElement` with all `--nv-*` variables set to defaults.
2. Defines a `window.__nv_patch()` helper function for efficient subsequent updates.
3. Sets the `data-nv-platform` attribute on `documentElement` (`"ios"`, `"ipad"`, or `"macos"`).

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
| `--nv-safe-top`    | `px` | Top safe area inset    |
| `--nv-safe-bottom` | `px` | Bottom safe area inset |
| `--nv-safe-left`   | `px` | Left safe area inset   |
| `--nv-safe-right`  | `px` | Right safe area inset  |

### Combined Insets

Includes safe area plus any native chrome that overlaps the webview:

| Variable            | Type | Description                          |
| ------------------- | ---- | ------------------------------------ |
| `--nv-inset-top`    | `px` | Safe area + nav bar height           |
| `--nv-inset-bottom` | `px` | Safe area + tab bar / toolbar height |
| `--nv-inset-left`   | `px` | Safe area + sidebar width            |
| `--nv-inset-right`  | `px` | Safe area                            |

### Chrome Geometry

| Variable               | Type      | Description                       |
| ---------------------- | --------- | --------------------------------- |
| `--nv-nav-height`      | `px`      | Navigation bar height             |
| `--nv-nav-visible`     | `0` / `1` | Whether navigation bar is visible |
| `--nv-tab-height`      | `px`      | Tab bar height                    |
| `--nv-tab-visible`     | `0` / `1` | Whether tab bar is visible        |
| `--nv-toolbar-height`  | `px`      | Toolbar height                    |
| `--nv-toolbar-visible` | `0` / `1` | Whether toolbar is visible        |
| `--nv-status-height`   | `px`      | Status bar height                 |

### Keyboard

| Variable                 | Type      | Description                          |
| ------------------------ | --------- | ------------------------------------ |
| `--nv-keyboard-height`   | `px`      | Software keyboard height             |
| `--nv-keyboard-visible`  | `0` / `1` | Whether keyboard is shown            |
| `--nv-keyboard-floating` | `0` / `1` | Whether keyboard is floating (iPad)  |
| `--nv-keyboard-inset`    | `px`      | Combined keyboard + safe area bottom |
| `--nv-keyboard-duration` | `s`       | Keyboard animation duration          |
| `--nv-keyboard-curve`    | string    | Keyboard animation curve identifier  |

### Device

| Variable              | Type      | Description                       |
| --------------------- | --------- | --------------------------------- |
| `--nv-is-phone`       | `0` / `1` | Running on iPhone                 |
| `--nv-is-tablet`      | `0` / `1` | Running on iPad                   |
| `--nv-is-desktop`     | `0` / `1` | Running on macOS                  |
| `--nv-is-portrait`    | `0` / `1` | Portrait orientation              |
| `--nv-is-landscape`   | `0` / `1` | Landscape orientation             |
| `--nv-display-scale`  | number    | Device display scale (1x, 2x, 3x) |
| `--nv-display-corner` | `px`      | Display corner radius             |

### Appearance

| Variable                    | Type      | Description                    |
| --------------------------- | --------- | ------------------------------ |
| `--nv-is-dark`              | `0` / `1` | Dark mode active               |
| `--nv-is-light`             | `0` / `1` | Light mode active              |
| `--nv-contrast`             | `0` / `1` | High contrast enabled          |
| `--nv-reduced-motion`       | `0` / `1` | Reduce motion preference       |
| `--nv-reduced-transparency` | `0` / `1` | Reduce transparency preference |
| `--nv-font-scale`           | number    | Dynamic Type scaling factor    |

### Accent Colour

| Variable        | Type    | Description                   |
| --------------- | ------- | ----------------------------- |
| `--nv-accent-r` | `0-255` | Accent colour red component   |
| `--nv-accent-g` | `0-255` | Accent colour green component |
| `--nv-accent-b` | `0-255` | Accent colour blue component  |
| `--nv-accent`   | `rgb()` | Composed accent colour value  |

### Dynamic Type (Font Sizes)

All values are in `px` and reflect the user's Dynamic Type preference:

| Variable                | iOS Default |
| ----------------------- | ----------- |
| `--nv-font-body`        | 17px        |
| `--nv-font-callout`     | 16px        |
| `--nv-font-caption1`    | 12px        |
| `--nv-font-caption2`    | 11px        |
| `--nv-font-footnote`    | 13px        |
| `--nv-font-headline`    | 17px        |
| `--nv-font-subheadline` | 15px        |
| `--nv-font-title1`      | 28px        |
| `--nv-font-title2`      | 22px        |
| `--nv-font-title3`      | 20px        |
| `--nv-font-largeTitle`  | 34px        |

## macOS Differences

- No keyboard variables (no software keyboard)
- No status bar height
- Always `--nv-is-desktop=1`, `--nv-is-landscape=1`
- Fixed font sizes per macOS HIG (not Dynamic Type)
- Appearance changes tracked via `NSApplication` notifications instead of trait collection changes

## Usage in CSS

```css
/* Adapt to native chrome insets */
.content {
  padding-top: var(--nv-inset-top);
  padding-bottom: var(--nv-inset-bottom);
}

/* React to keyboard */
.chat-input {
  transform: translateY(calc(-1 * var(--nv-keyboard-height)));
  transition-duration: var(--nv-keyboard-duration);
}

/* Dark mode */
:root[style*="--nv-is-dark: 1"] {
  --bg: #1a1a1a;
}

/* Respect Dynamic Type */
body {
  font-size: var(--nv-font-body);
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  /* also available as --nv-reduced-motion */
}
```
