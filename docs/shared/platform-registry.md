# Platform Registry

> Maps to: `src/platforms/registry.ts`

The platform registry is the core orchestration system that maps configured platforms to their plugins and manages configuration resolution.

## Key Functions

### `resolveConfiguredPlatformRuntimes(config)`

The main function that:

1. Loads all first-party platform plugins (iOS, macOS, Android).
2. Merges any custom platform plugins from the user's config.
3. Returns resolved runtime objects for each configured platform.

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
  plugin: NativitePlatformPlugin; // Plugin with generate/dev/build hooks
  extensions: string[]; // [".ios", ".mobile", ".native"]
  environments: string[]; // ["ios", "ipad"]
  bundlePlatform: string; // Platform name for bundle manifest
};
```

## First-Party Plugins

> Maps to: `src/platforms/first-party.ts`

| Plugin             | Platform  | Environments  | Extensions                       |
| ------------------ | --------- | ------------- | -------------------------------- |
| `nativite-ios`     | `ios`     | `ios`, `ipad` | `.ios`, `.mobile`, `.native`     |
| `nativite-macos`   | `macos`   | `macos`       | `.macos`, `.desktop`, `.native`  |
| `nativite-android` | `android` | `android`     | `.android`, `.mobile`, `.native` |

### Plugin Hooks

Each plugin implements:

| Hook            | Purpose                                 |
| --------------- | --------------------------------------- |
| `generate(ctx)` | Generate the native project             |
| `dev(ctx)`      | Generate, build, launch with dev server |
| `build(ctx)`    | Generate for production build           |

## Helper Functions

### `toDotPrefixedSuffixes(platformId, suffixes)`

Normalises file extension suffixes:

- Ensures leading dots (e.g., `"ios"` → `".ios"`)
- Removes duplicates
- Defaults to `[".{platformId}", ".native"]` if not specified

### `normalizeEnvironments(platformId, environments)`

Normalises Vite environment names, defaulting to the platform ID if not specified.
