# CLI Build Command

> Maps to: `src/cli/build-command.ts`, `src/cli/index.ts`

The `nativite build` command prepares production native projects for the
configured platforms. It runs Vite production builds, creates or updates the
generated native projects, and prints the generated project paths.

`nativite build` does not create final distributable artifacts such as `.ipa`,
`.aab`, `.apk`, signed `.app`, or `.dmg`. Those artifacts are produced by the
native toolchain after the project has been generated: Xcode, Android Studio,
Gradle, `xcodebuild`, or CI own signing, packaging, archiving, notarization, and
store submission.

## Platform Selection

Without `--platform`, the command builds every platform configured in
`nativite.config.ts`. Passing `--platform <id>` builds only that configured
platform. Unknown platform ids fail before Vite is loaded.

For each target platform, the command sets:

- `NATIVITE_PLATFORM` to the platform currently being built.
- `NATIVITE_PLATFORMS` to the comma-separated list of configured platforms.
- `NATIVITE_PLATFORM_METADATA` to serialized platform runtime metadata.

## Output Paths

After each successful platform build, the command prints the native project path
and web bundle path. Xcode-based platforms point at their generated
`.xcodeproj`; Android points at the generated Gradle project directory.

`nativite build` verifies that the Nativite Vite plugin completed before it
prints success. For each requested platform it requires:

- `.nativite/build/<platform>.json`, written by the plugin after its
  `closeBundle` work completes.
- `dist-<bundle-platform>/manifest.json`, the generated web bundle manifest.
- The generated native project output: `.nativite/<platform>/<App>.xcodeproj`
  for iOS/macOS, or `.nativite/android` for Android.

The CLI removes the previous platform marker before each build, so a stale
successful build cannot hide a missing plugin or failed generation step.

After all requested platform builds succeed, the command prints a concise
copy-pasteable next-steps block:

```text
Next steps:
  iOS: open .nativite/ios/MyApp.xcodeproj
  Android: open .nativite/android
```

The block includes only platforms that were requested and successfully built. If
a build fails, the command exits immediately and does not print final next
steps.

## Troubleshooting Missing Outputs

If the command fails with:

```text
The Nativite Vite plugin did not complete for ios.
```

then Vite finished without running Nativite's `closeBundle` hook for that
platform. The usual cause is a project with `nativite.config.ts` but no
`nativite()` plugin in `vite.config.*`.

Add the plugin to the Vite config:

```ts
import { defineConfig } from "vite";
import { nativite } from "nativite/vite";

export default defineConfig({
  plugins: [nativite()],
});
```

If the plugin marker exists but the manifest or native project output is
missing, inspect the Vite output and native generator diagnostics for the
platform that failed. `nativite build` reports the exact missing path.

## Store Artifact Flow

For a first-time user, the production path is:

1. Install Nativite and initialize the existing Vite app.
2. Run `bunx nativite build` to prepare the native project and embedded
   production web bundle.
3. Configure signing in Xcode, Android Studio, Gradle, or the CI environment.
4. Archive or package the generated native project with the native toolchain.
5. Submit the resulting artifact with the platform's store tooling.

Future packaging helpers should stay explicit and optional. They may wrap native
commands to produce release artifacts, but they should consume signing inputs
from the app, native project, or environment instead of becoming the source of
truth for certificates, provisioning profiles, keystores, notarization
credentials, or store-upload credentials.

## Published Runtime Templates

The package build copies first-party Swift and Kotlin runtime templates into
`dist/runtime`. The bundled platform generators resolve runtime templates
relative to the emitted registry chunk, so published `nativite build` and
generation flows must keep those template files as direct siblings under that
directory.
