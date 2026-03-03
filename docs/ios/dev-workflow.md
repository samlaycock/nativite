# iOS Development Workflow

> Maps to: `src/platforms/first-party.ts` (iOS platform plugin)

The iOS platform plugin manages the full development lifecycle: project generation, simulator management, and app launch with hot-reloading.

## Dev Mode Flow

When running `nativite dev` for iOS:

### 1. Generate Project

Calls `generateProject(config, cwd, false, "ios")` to create or update the Xcode project in `.nativite/ios/`.

### 2. Boot Simulator

- Checks if the target simulator is already booted.
- If not, boots the configured simulator (default: `"iPhone 16 Pro"`).
- The simulator name is configurable in the platform config.

### 3. Build & Launch

- Builds the app using `xcodebuild`.
- Installs the built app on the simulator using `simctl install`.
- Launches the app using `simctl launch`.

### 4. Dev URL Injection

The dev server URL is passed to the app via the `SIMCTL_CHILD_NATIVITE_DEV_URL` environment variable. This is a special `simctl` environment variable prefix that forwards to the app's process environment.

The app reads this URL in the `ViewController.loadContent()` method to connect to the Vite dev server instead of loading the embedded bundle.

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

## Build Mode

When running `nativite build` for iOS:

- Generates the project in build mode.
- Writes `manifest.json` with version info and asset list.
- Does not automatically build or archive the Xcode project (left to the developer's CI/CD pipeline).
