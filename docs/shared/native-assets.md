# Native Asset Pipeline

> Maps to: `src/native/assets.ts`

Nativite validates configured icon and splash source files before native project
generation writes platform assets. The source files remain app-owned inputs in
the project; generated assets under `.nativite/` are reproducible outputs and
should not become the source of truth.

## Supported Inputs

- `icon`: PNG or SVG source. PNG icons must be square and at least
  `1024x1024`. SVG icons must declare numeric `width`/`height` or a `viewBox`
  and must be square.
- `splash.image`: PNG or SVG source. Splash images must declare valid non-zero
  dimensions.

SVG sources are rasterized into PNG outputs during generation so Android and
Apple projects receive platform-valid native resources.

## Generated Outputs

- iOS/macOS icons are rasterized as
  `Assets.xcassets/AppIcon.appiconset/AppIcon.png` with matching
  `Contents.json`.
- iOS splash images are rasterized as `Assets.xcassets/Splash.imageset/Splash.png`
  with matching `Contents.json`.
- Android icons are copied into deterministic `mipmap-{density}` foreground
  assets named `ic_launcher_foreground.png`.
- Android splash images are copied into deterministic `drawable-{density}` assets
  named `nativite_splash.png`, and the splash theme references
  `@drawable/nativite_splash`.

The current pipeline validates and normalizes asset placement, filenames, and
PNG output sizes. It does not act as a design tool or mutate source images in
place.

## Hashing And Opt-Out

Asset content fingerprints are included in native generation hashes. Changing an
icon or splash source file regenerates the native project even when the config
path is unchanged.

To keep manually managed native assets, omit `icon` or `splash.image` from
`nativite.config.ts` for that platform, or use platform-specific overrides to
remove the generated input for a platform that needs manual customization.
