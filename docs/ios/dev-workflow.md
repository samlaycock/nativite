# iOS Development Workflow

> Maps to: `src/platforms/first-party.ts` (iOS platform plugin)

The iOS platform plugin generates an Xcode project that developers run with
normal Xcode simulator, device, signing, and archive workflows.

## Toolchain Ownership

Nativite does not install, download, vendor, or bootstrap Apple toolchain
dependencies. Before generating, building, or launching iOS projects, the
developer or CI image must provide:

- macOS with Xcode installed
- Xcode command line tools selected and available on `PATH`
- An available iOS simulator or connected device for launch/testing
- Signing configuration for device builds, archives, and distribution

Xcode owns native dependency resolution, simulator/device selection, signing,
archiving, and App Store distribution. Nativite's responsibility is to generate
the project structure and web bundle handoff files.

## Primary Flow

When running `nativite build` for iOS:

### 1. Build the web bundle

The CLI runs a production Vite build with `NATIVITE_PLATFORM=ios`.
The Vite plugin writes the iOS web bundle to `dist-ios/` and emits
`dist-ios/manifest.json`.

### 2. Generate the Xcode project

The iOS platform build hook calls `generateProject(config, cwd, false, "build", "ios")`
to create or update the Xcode project in `.nativite/ios/`.

Project generation writes an `.xcodeproj` and Swift source files only. It does
not install Xcode, select simulators, create signing identities, or provision
devices. If Xcode tooling is unavailable, configure the Apple toolchain and
rerun the Nativite build command.

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
URL. When the app has not set `server.host`, the plugin asks Vite to bind to all
interfaces so physical devices can use the LAN URL. Explicit `server.host`
settings are preserved.

The metadata includes all Vite local and network URLs plus native-specific
connection hints:

```json
{
  "devURL": "http://192.168.1.2:5173/",
  "urls": {
    "local": ["http://localhost:5173/"],
    "network": ["http://192.168.1.2:5173/"]
  },
  "native": {
    "iosSimulatorURL": "http://localhost:5173/",
    "iosDeviceURL": "http://192.168.1.2:5173/"
  }
}
```

Debug native builds can use the selected URL instead of loading the embedded
bundle. iOS simulators can use the local loopback URL because they share the host
network stack. Physical iOS devices usually need the network URL and must be on a
network that can reach the Vite host. If Vite reports no network URL, Nativite
warns that `server.host` may need to be set to `0.0.0.0` or `true`.

Open and run the generated debug project in Xcode. Nativite does not own
simulator orchestration from the CLI.

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
