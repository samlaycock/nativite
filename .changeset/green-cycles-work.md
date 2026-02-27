---
"nativite": patch
---

Refactor platform runtime integration so built-in Apple platforms run through the platform plugin system:

- add first-party `nativite-ios` and `nativite-macos` platform plugins with built-in extension/environments metadata and generate/dev/build hooks.
- resolve all configured platforms through plugin lookup in the platform registry, removing dedicated built-in runtime branching.
- route CLI and Vite lifecycle execution through `runtime.plugin` hooks consistently, including richer hook context (`rootConfig`, generate `mode`).
- harden generation stale checks in `generateProject` so legacy Xcode project metadata triggers regeneration even when the config hash is unchanged.
- reserve `ios`/`macos` platform plugin identifiers in config validation so first-party platform plugins cannot be overridden accidentally.
