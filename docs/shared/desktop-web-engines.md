# Desktop Web Engines

Nativite desktop targets can choose the native web engine used by the generated
application shell. The default is the platform system engine.

```ts
import { defineConfig, macos } from "nativite";

export default defineConfig({
  app: {
    name: "Example",
    bundleId: "com.example.app",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [macos({ webEngine: "chromium" })],
});
```

## Configuration

`macos({ webEngine })` accepts:

| Value      | Behavior                                                                     |
| ---------- | ---------------------------------------------------------------------------- |
| `system`   | Uses the OS-provided WebKit `WKWebView`. This is the default.                |
| `chromium` | Generates a macOS project that links and embeds Chromium Embedded Framework. |

`webEngine` is desktop-only. iOS and Android continue to use the platform
WebView engines and reject `webEngine` configuration with a clear config error.

## macOS Chromium Support

Chromium support is currently macOS-only. Generated macOS Xcode projects using
`webEngine: "chromium"` reference:

```text
native/chromium/macos/Chromium Embedded Framework.framework
```

The framework is linked and embedded with code signing enabled. Apps using this
engine must provide that framework at the referenced path before building the
native project.

## Tradeoffs

The system engine keeps generated apps small and relies on OS security updates.
Chromium improves rendering parity with Chromium-based desktop environments, but
increases bundle size and shifts update, signing, and notarization work to the
app distributor.

Chromium is an alternate renderer engine only. It does not provide Electron API
compatibility.
