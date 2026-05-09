# Platform Registry

> Maps to: `src/platforms/registry.ts`

The platform registry is the core orchestration system that maps configured platforms to their plugins and manages configuration resolution.

## Key Functions

### `resolveConfiguredPlatformRuntimes(config, projectRoot?)`

The main function that:

1. Loads all first-party platform plugins (iOS, macOS, Android).
2. Merges any custom platform plugins from the user's config.
3. Resolves each platform plugin root directory.
4. Returns resolved runtime objects for each configured platform.

### `resolveConfigForPlatform(config, platformId)`

Deep merges platform-specific overrides into the root config. The `overrides` field in the config allows per-platform customisation of:

- App metadata (name, bundleId, version)
- Signing configuration
- Update settings
- Plugins
- Chrome state
- Icons and splash screens

### `serializePlatformRuntimeMetadata(runtimes)` / `deserializePlatformRuntimeMetadata(raw)`

Handles the CLI ↔ Vite handoff:

- CLI serializes platform metadata into `NATIVITE_PLATFORM_METADATA` env var.
- Vite deserializes it to understand platform file extensions and environments.

## Resolved Runtime Type

```typescript
type ResolvedNativitePlatformRuntime = {
  id: string; // "ios", "android", "macos"
  config: NativitePlatformConfig; // Platform-specific config
  plugin: NativitePlatformPlugin; // Plugin with generate/build hooks
  rootDir: string; // Platform plugin root directory
  extensions: string[]; // [".ios", ".mobile", ".native"]
  environments: string[]; // ["ios", "ipad"]
  bundlePlatform: string; // Platform name for bundle manifest
  native: boolean; // __IS_NATIVE__
  mobile: boolean; // __IS_MOBILE__
  desktop: boolean; // __IS_DESKTOP__
};
```

## First-Party Plugins

> Maps to: `src/platforms/first-party.ts`

| Plugin             | Platform  | Environments  | Extensions                       | Traits                          |
| ------------------ | --------- | ------------- | -------------------------------- | ------------------------------- |
| `nativite-ios`     | `ios`     | `ios`, `ipad` | `.ios`, `.mobile`, `.native`     | `native: true`, `mobile: true`  |
| `nativite-macos`   | `macos`   | `macos`       | `.macos`, `.desktop`, `.native`  | `native: true`, `desktop: true` |
| `nativite-android` | `android` | `android`     | `.android`, `.mobile`, `.native` | `native: true`, `mobile: true`  |

For custom platform plugins, omitted traits default to:

- `native: true`
- `mobile: false`
- `desktop: false`

Custom platform plugins are explicit config entries. They can be imported from a
local file in the app repository or from an installed package:

```ts
// platforms/electron/platform.ts
import { definePlatformPlugin } from "nativite";

export const electronPlatform = definePlatformPlugin(
  {
    name: "electron-platform",
    platform: "electron",
    native: true,
    desktop: true,
    extensions: [".electron", ".desktop", ".native"],
    environments: ["electron"],
    async generate(ctx) {
      // ctx.rootDir is this module's directory when import.meta.url is passed.
    },
    async build(ctx) {},
  },
  import.meta.url,
);
```

```ts
// nativite.config.ts
import { defineConfig, platform } from "nativite";
import { electronPlatform } from "./platforms/electron/platform";

export default defineConfig({
  app: {
    name: "MyApp",
    bundleId: "com.example.myapp",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [platform("electron", { appId: "com.example.myapp" })],
  platformPlugins: [electronPlatform],
});
```

Passing `import.meta.url` to `definePlatformPlugin` makes `ctx.rootDir` resolve
to the platform plugin module directory. String `rootDir` values are resolved
from the app project root; `URL` values are resolved as file-system paths.

### Plugin Hooks

Each plugin implements:

| Hook            | Purpose                       |
| --------------- | ----------------------------- |
| `generate(ctx)` | Generate the native project   |
| `build(ctx)`    | Generate for production build |

## Helper Functions

### `toDotPrefixedSuffixes(platformId, suffixes)`

Normalises file extension suffixes:

- Ensures leading dots (e.g., `"ios"` → `".ios"`)
- Removes duplicates
- Defaults to `[".{platformId}", ".native"]` if not specified

### `normalizeEnvironments(platformId, environments)`

Normalises Vite environment names, defaulting to the platform ID if not specified.
