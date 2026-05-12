# Drop-In Quickstart

> Maps to: `README.md`, `src/cli/init-command.ts`, `src/vite/index.ts`

This guide is the shortest path from an existing Vite app to a generated native
shell. It keeps the first run focused on init, build, and native IDE launch
before introducing chrome or custom native APIs.

## 1. Start in an existing Vite app

Install Nativite with Bun:

```bash
bun add nativite
```

Run init from the Vite project root:

```bash
bunx nativite init
```

Init reads `package.json`, creates `nativite.config.ts`, and updates a simple
Vite config to include the `nativite()` plugin. If the Vite config is too
dynamic to edit safely, init leaves it unchanged and prints the exact import and
plugin entry to add manually.

## 2. Choose native platforms

Without flags, init chooses a narrow host-aware default: `ios` on macOS and
`android` on other hosts. Select targets explicitly by repeating `--platform`:

```bash
bunx nativite init --platform ios --platform android
```

Supported built-in targets are:

| Target  | Helper      | Native project output |
| ------- | ----------- | --------------------- |
| iOS     | `ios()`     | `.nativite/ios`       |
| macOS   | `macos()`   | `.nativite/macos`     |
| Android | `android()` | `.nativite/android`   |

The generated config uses built-in defaults for platform versions. Adjust
`nativite.config.ts` later when your app needs a different minimum iOS, macOS,
Android min SDK, or Android target SDK value.

## 3. Build the native shell

Build every configured platform:

```bash
bunx nativite build
```

Build one platform when iterating:

```bash
bunx nativite build --platform ios
```

The build command runs Vite for each platform, writes platform-specific web
bundles such as `dist-ios` or `dist-android`, and creates or updates the native
project under `.nativite/`.

## 4. Run in a simulator or device

Open the generated project in the native IDE:

```bash
open .nativite/ios/MyApp.xcodeproj
open .nativite/android
```

Use Xcode or Android Studio for simulator/device selection, signing, native
build settings, and launch. Nativite intentionally stops at generated native
projects and embedded web bundles; signed `.ipa`, `.aab`, `.apk`, `.app`, and
`.dmg` artifacts come from the native toolchain or CI.

For native debug builds that should load the web app from Vite, run:

```bash
bunx vite dev
```

The Vite plugin writes `.nativite/dev.json` with the resolved dev server URL so
generated native debug projects can discover the server.

## 5. Router and framework notes

Keep the first pass as close to your existing Vite app as possible:

- Use the same `index.html` entry unless a platform needs a native-specific
  HTML entry such as `index.ios.html` or `index.android.html`.
- Prefer app routes that can reload from `index.html`; native shells embed the
  Vite output rather than replacing your framework router.
- Use platform-specific source files only where native behavior diverges:
  `.ios`, `.android`, `.macos`, `.mobile`, `.desktop`, or `.native`.
- Add `/// <reference types="nativite/globals" />` to `vite-env.d.ts` before
  using `__PLATFORM__`, `__IS_NATIVE__`, `__IS_MOBILE__`, `__IS_DESKTOP__`, or
  `__DEV__`.
- Keep framework data loading and navigation in web code unless a native
  capability needs to own the interaction.

## 6. Troubleshooting

`No platforms are configured.`

Add at least one platform in `nativite.config.ts` or rerun init with one or more
`--platform` flags.

iOS or macOS project opens but will not launch.

Check that Xcode, Xcode command line tools, and the required simulator/device
runtime are installed. Nativite generates the project, but Xcode owns native
launching and signing.

Android generation fails with `gradle: command not found`.

Install Android Studio, Android SDK, Java, and expose a `gradle` command on
`PATH`, then rerun the build.

The Vite config was not updated.

Apply the import and `plugins: [nativite()]` change printed by init. Init avoids
editing computed plugin expressions or helper-returned config shapes when it
cannot prove the edit is safe.

Native debug builds are not loading the dev server.

Start `bunx vite dev`, rebuild or relaunch the native debug project, and confirm
`.nativite/dev.json` contains the expected local URL.

## 7. When to use advanced APIs

Use the generated shell first. Reach for advanced Nativite APIs only when the
web app needs native-owned UI or native capabilities:

- Use `nativite/chrome` for native title bars, navigation, toolbars, drawers,
  sheets, menus, splash control, and inter-webview messaging.
- Use `nativite/client` for low-level bridge calls, event subscriptions, and OTA
  checks.
- Use `nativite/css` for live safe-area, keyboard, appearance, and device CSS
  variables.
- Use platform plugins when you need custom Swift, Kotlin, or third-party native
  capability registration.

Reference docs:

- [CLI Init Command](./cli-init.md)
- [CLI Build Command](./cli-build.md)
- [Vite Plugin](./vite-plugin.md)
- [Chrome API](./chrome-api.md)
- [Client Bridge](./client-bridge.md)
- [CSS Variables](./css-vars-module.md)
- [Plugin System](./plugin-system.md)
