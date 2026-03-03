# iOS Keyboard & Input Accessory

> Maps to: `src/ios/templates/nativite-keyboard.ts`
> Generated file: `NativiteKeyboard.swift`

The keyboard module provides a native input accessory bar above the software keyboard and configurable keyboard dismiss modes.

## Components

### NativiteWebView (WKWebView Subclass)

```swift
class NativiteWebView: WKWebView, UIScrollViewDelegate
```

Subclasses `WKWebView` to enable:

1. **Input Accessory Override**: The `inputAccessoryView` property is read-only on `WKWebView`. The subclass makes it settable, allowing a custom accessory bar to be displayed above the keyboard.

2. **Root Scroll Lock**: Maintains a `lockRootScroll: Bool` property. When enabled, implements `UIScrollViewDelegate` to reset `contentOffset.y` to `0`, preventing the webview document from shifting when the keyboard appears. This gives full scroll control to the web content.

### NativiteKeyboard

```swift
class NativiteKeyboard
```

Manages the native accessory bar and dismiss mode.

#### Installation

```swift
func install(on webView: NativiteWebView)
```

Attaches a `NativiteAccessoryView` to the webview's `inputAccessoryView` slot.

#### State Application

```swift
func applyState(_ state: [String: Any])
```

Receives the keyboard configuration from JavaScript and applies:

##### Dismiss Mode

Maps to `UIScrollView.keyboardDismissMode`:

| JS Value        | UIKit Value    | Behaviour                                 |
| --------------- | -------------- | ----------------------------------------- |
| `"none"`        | `.none`        | Keyboard stays until explicitly dismissed |
| `"on-drag"`     | `.onDrag`      | Keyboard dismisses on scroll              |
| `"interactive"` | `.interactive` | Keyboard follows finger during scroll     |

##### Accessory Bar

The `accessory` property configures the items displayed in the bar above the keyboard:

- Each item follows the same `BarItem` format as title bar and toolbar items
- Supports buttons, flexible spaces, and fixed spaces
- Item presses fire `keyboard.itemPressed` events with the item `id`

When `accessory` is `nil` or has no items, the accessory bar is hidden.

## Events

| Event                  | Payload          | Description                      |
| ---------------------- | ---------------- | -------------------------------- |
| `keyboard.itemPressed` | `{ id: string }` | An accessory bar item was tapped |

## CSS Variables

The keyboard module updates the following CSS variables via `NativiteVars`:

| Variable                 | Description                               |
| ------------------------ | ----------------------------------------- |
| `--nv-keyboard-height`   | Current keyboard height in px             |
| `--nv-keyboard-visible`  | `0` or `1`                                |
| `--nv-keyboard-floating` | `0` or `1` (iPad floating keyboard)       |
| `--nv-keyboard-inset`    | Keyboard height + safe area bottom        |
| `--nv-keyboard-duration` | Animation duration for keyboard show/hide |
| `--nv-keyboard-curve`    | Animation curve identifier                |

These variables are updated in response to `UIResponder.keyboardWillChangeFrameNotification` and `keyboardWillHideNotification`.
