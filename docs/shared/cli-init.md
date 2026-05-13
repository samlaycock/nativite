# CLI Init Command

> Maps to: `src/cli/init-command.ts`, `src/cli/index.ts`

The `nativite init` command prepares an existing Vite project for the build-only
workflow.

## Project Detection

The command runs from the current working directory and requires an existing
`package.json`. It reads `package.json#name` to derive:

- `app.name` as a PascalCase app name, with `NativiteApp` as the fallback.
- `app.bundleId` as `com.example.<package-name>`, sanitized for a reverse-domain identifier.

## Generated Config

When `nativite.config.ts` does not already exist, init writes a minimal config
for the selected first-party platforms. Pass `--platform` more than once to
enable multiple targets:

```bash
bunx nativite init --platform ios --platform android
```

Supported values are `ios`, `macos`, and `android`. Without `--platform`, init
uses a narrow host-aware default: `ios` on macOS and `android` on other hosts.

```ts
import { defineConfig, ios } from "nativite";

export default defineConfig({
  app: {
    name: "MyApp",
    bundleId: "com.example.myapp",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [ios()],
});
```

The helper calls rely on built-in defaults for whichever platforms are
selected: iOS minimum version `17.0`, macOS minimum version `14.0`, Android
`minSdk` `26`, and Android `targetSdk` `36`.

Existing `nativite.config.ts` files are preserved by default. Passing `--force`
allows init to overwrite the generated Nativite config.

## Vite Config Updates

Init looks for `vite.config.ts`, `vite.config.mts`, `vite.config.js`, or
`vite.config.mjs`. It uses syntax-aware edits that balance strings, comments,
and brackets before changing the file. Supported config shapes include:

- `defineConfig({ plugins: [...] })`
- `defineConfig({ plugins })` when `plugins` is a top-level array variable
- `defineConfig({ ... })` objects without a `plugins` property
- `mergeConfig(baseConfig, { ... })` override objects

```ts
import { nativite } from "nativite/vite";
```

and inserts `nativite()` at the start of the plugins array. When the config
object has no `plugins` property, init adds `plugins: [nativite()]`.

If the Vite config uses a computed plugin expression, helper return value, or
another ambiguous shape, init leaves it unchanged and prints exact manual
instructions instead of attempting a risky edit.
