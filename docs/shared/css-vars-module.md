# CSS Variables Module (JavaScript)

> Maps to: `src/css-vars/index.ts`

The CSS variables module provides typed, observable access to `--nk-*` CSS custom properties set by native code. It works in both native and browser environments with sensible defaults.

## API

### Reading Values

```typescript
import { NKVars } from "nativite/css";

// Raw string value
NKVars.get("keyboard-height"); // → "0px" or "336px"

// Parsed numeric value
NKVars.getNumber("keyboard-height"); // → 0 or 336

// Boolean flag
NKVars.getBoolean("is-dark"); // → true or false
```

### Observing Changes

```typescript
// Observe raw string changes
const unsub = NKVars.observe("keyboard-height", (value) => {
  console.log("Keyboard:", value); // "336px"
});

// Observe as boolean
NKVars.observeBoolean("is-dark", (isDark) => {
  document.body.classList.toggle("dark", isDark);
});

// Observe as number
NKVars.observeNumber("safe-top", (top) => {
  console.log("Safe area top:", top);
});
```

All observe functions return an unsubscribe function.

## Implementation

### MutationObserver

A single shared `MutationObserver` watches `document.documentElement.style` for attribute changes. When a mutation is detected, it fans out to per-variable subscriptions, only calling callbacks when the value has actually changed.

### Default Values

All variables have built-in defaults used when:

- Running in a browser (not native).
- The native code hasn't set the variable yet.

Defaults include: safe area `0px`, dark mode `0`, accent colour blue components, etc.

## Variable Names

The `NKVarName` type defines all valid variable names:

### Safe Area

`safe-top`, `safe-bottom`, `safe-left`, `safe-right`

### Combined Insets

`inset-top`, `inset-bottom`, `inset-left`, `inset-right`

### Chrome Geometry

`nav-height`, `nav-visible`, `tab-height`, `tab-visible`, `toolbar-height`, `toolbar-visible`, `status-height`

### Keyboard

`keyboard-height`, `keyboard-visible`, `keyboard-floating`, `keyboard-inset`, `keyboard-duration`, `keyboard-curve`, `accessory-height`

### Navigation State

`nav-depth`, `title-collapse`, `pop-gesture`, `sheet-visible`, `sheet-detent`

### Device

`display-scale`, `display-corner`, `is-phone`, `is-tablet`, `is-desktop`, `is-portrait`, `is-landscape`, `is-compact-width`, `split-fraction`

### Appearance

`is-dark`, `is-light`, `contrast`, `reduced-motion`, `reduced-transparency`, `accent-r`, `accent-g`, `accent-b`, `accent`

### Dynamic Type

`font-scale`, `font-body`, `font-callout`, `font-caption1`, `font-caption2`, `font-footnote`, `font-headline`, `font-subheadline`, `font-title1`, `font-title2`, `font-title3`, `font-largeTitle`

## Platform Availability

Not all variables are available on all platforms:

| Category        | iOS | Android | macOS      | Browser  |
| --------------- | --- | ------- | ---------- | -------- |
| Safe area       | Yes | Yes     | Limited    | Defaults |
| Chrome geometry | Yes | Yes     | Yes        | Defaults |
| Keyboard        | Yes | Partial | No         | Defaults |
| Device          | Yes | No      | Yes        | Defaults |
| Appearance      | Yes | No      | Yes        | Defaults |
| Dynamic Type    | Yes | No      | No (fixed) | Defaults |
| Accent colour   | Yes | No      | Yes        | Defaults |
