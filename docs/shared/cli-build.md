# CLI Build Command

> Maps to: `src/cli/build-command.ts`, `src/cli/index.ts`

The `nativite build` command runs Vite production builds for the configured
native platforms and prints the generated project paths.

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

## Published Runtime Templates

The package build copies first-party Swift and Kotlin runtime templates into
`dist/runtime`. The bundled platform generators resolve runtime templates
relative to the emitted registry chunk, so published `nativite build` and
generation flows must keep those template files as direct siblings under that
directory.
