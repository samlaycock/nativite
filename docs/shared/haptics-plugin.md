# Haptics Plugin

The haptics plugin exposes semantic native tactile feedback through the Nativite
bridge. It is imported from `nativite/plugins/haptics` and added to
`plugins` in `nativite.config.ts`.

```ts
import { defineConfig, ios } from "nativite";
import { haptics } from "nativite/plugins/haptics";

export default defineConfig({
  app: {
    name: "MyApp",
    bundleId: "com.example.myapp",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [ios()],
  plugins: [haptics],
});
```

## JavaScript API

```ts
import {
  getHapticsCapabilities,
  impactFeedback,
  notificationFeedback,
  selectionFeedback,
} from "nativite/plugins/haptics";

await selectionFeedback();
await impactFeedback("light");
await notificationFeedback("success");

const capabilities = await getHapticsCapabilities();
```

`impactFeedback()` accepts `"light"`, `"medium"`, `"heavy"`, `"rigid"`, and
`"soft"`. It defaults to `"medium"` when no style is passed.

`notificationFeedback()` accepts `"success"`, `"warning"`, and `"error"`.

`getHapticsCapabilities()` returns:

```ts
interface HapticsCapabilities {
  readonly platform: "ios" | "android" | "macos" | "unknown";
  readonly available: boolean;
  readonly selection: boolean;
  readonly impact: readonly ("light" | "medium" | "heavy" | "rigid" | "soft")[];
  readonly notification: readonly ("success" | "warning" | "error")[];
}
```

## Platform Behavior

iOS maps selection, impact, and notification calls to `UISelectionFeedbackGenerator`,
`UIImpactFeedbackGenerator`, and `UINotificationFeedbackGenerator`. The `rigid`
and `soft` impact styles use their native iOS styles where available and fall
back to heavier or lighter impact styles on older OS versions.

Android uses `View.performHapticFeedback()` with semantic
`HapticFeedbackConstants`. It does not add `android.permission.VIBRATE`, because
the plugin avoids arbitrary vibration patterns and uses view-level haptic
feedback instead.

macOS does not currently include a first-party native haptics implementation.

## Limitations

The returned `performed` flag means the native API accepted the request. It does
not guarantee the user felt feedback. The operating system can suppress haptics
because of device settings, low power mode, active camera or dictation
constraints, unsupported hardware, or other system policy.

When the native bridge or attached Android activity is unavailable, calls fail
with structured bridge errors using `native-unavailable`. Invalid semantic
styles fail with `invalid-impact-style` or `invalid-notification-style`.
