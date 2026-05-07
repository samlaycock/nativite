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
with iOS, macOS, and Android platform entries:

```ts
import { android, defineConfig, ios, macos } from "nativite";

export default defineConfig({
  app: {
    name: "MyApp",
    bundleId: "com.example.myapp",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [ios(), macos(), android()],
});
```

The helper calls rely on built-in defaults: iOS minimum version `17.0`, macOS
minimum version `14.0`, Android `minSdk` `26`, and Android `targetSdk` `35`.

Existing `nativite.config.ts` files are preserved by default. Passing `--force`
allows init to overwrite the generated Nativite config.

## Vite Config Updates

Init looks for `vite.config.ts`, `vite.config.mts`, `vite.config.js`, or
`vite.config.mjs`. When it finds a simple inline `plugins: []` array, it adds:

```ts
import { nativite } from "nativite/vite";
```

and inserts `nativite()` into the plugins array.

If the Vite config uses a variable, helper, or another ambiguous shape, init
leaves it unchanged and prints exact manual instructions instead of attempting a
risky edit.
