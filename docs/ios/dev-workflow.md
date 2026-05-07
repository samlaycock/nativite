# iOS Development Workflow

> Maps to: `src/platforms/first-party.ts` (iOS platform plugin)

The iOS platform plugin generates an Xcode project that developers run with
normal Xcode simulator, device, signing, and archive workflows.

## Primary Flow

When running `nativite build` for iOS:

### 1. Build the web bundle

The CLI runs a production Vite build with `NATIVITE_PLATFORM=ios`.
The Vite plugin writes the iOS web bundle to `dist-ios/` and emits
`dist-ios/manifest.json`.

### 2. Generate the Xcode project

The iOS platform build hook calls `generateProject(config, cwd, false, "build", "ios")`
to create or update the Xcode project in `.nativite/ios/`.

### 3. Open and run in Xcode

Open the generated project and use Xcode for simulator/device selection,
debugging, signing, and archiving:

```bash
open .nativite/ios/MyApp.xcodeproj
```

Release builds copy the embedded web bundle from `dist-ios/` into the app bundle.

## Debug Builds With Vite Dev

Run your normal Vite dev server when you want the generated debug app to load web
code from Vite:

```bash
bunx vite dev
```

The Nativite Vite plugin writes `.nativite/dev.json` with the resolved dev server
URL. Debug native builds can use that URL instead of loading the embedded bundle.

The older `nativite dev` command can still generate, build, install, and launch a
simulator app from the terminal, but it is not the default setup path. Prefer
Xcode unless you specifically want terminal-owned simulator orchestration.

## User-Agent Based Routing

Each webview identifies itself via the User-Agent string:

| Device | User-Agent Suffix   |
| ------ | ------------------- |
| iPhone | `Nativite/ios/1.0`  |
| iPad   | `Nativite/ipad/1.0` |

The Vite dev server middleware reads this to route module requests to the correct platform environment, enabling platform-specific file resolution (`.ios.ts`, `.mobile.ts`, etc.) during development.

## Hot Module Replacement

The Vite plugin bridges HMR for native variant files:

- When a `.ios.ts` file changes, the HMR update is forwarded to the client environment's HMR channel.
- The webview picks up the update and hot-reloads without a full page refresh.

## Single-Platform Build

To build only iOS:

```bash
bunx nativite build --platform ios
```
