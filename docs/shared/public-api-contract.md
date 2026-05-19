# Public API Contract

> Maps to: `package.json`, `src/index.ts`, `src/client/index.ts`,
> `src/chrome/public.ts`, `src/background.ts`, `src/test/index.ts`,
> `src/vitest-browser-provider/index.ts`, `src/plugins/*/index.ts`, `NCLP.md`

This document defines the Nativite 1.0 public API, semver policy, and support
contract. If a surface is not named here or in a linked reference document, it
is an implementation detail and may change without a semver guarantee.

## Stable 1.0 Surface

The following surfaces are stable for Nativite 1.0:

- Package subpaths listed in `package.json#exports` and documented in
  [Package Exports](./package-exports.md).
- TypeScript values and types exported from those public subpaths.
- `nativite.config.ts` shape accepted by `defineConfig()`, including built-in
  `ios()`, `macos()`, `android()`, `platform()`, `definePlugin()`, and
  `definePlatformPlugin()` helpers.
- Generated native project layout needed by app and CI workflows: the
  `.nativite/<platform>` output roots, embedded web bundle locations, generated
  manifest files, native source registration points, and documented native IDE
  handoff behavior.
- Native Chrome Layout Protocol v2 messages, required fields, type strings, and
  compilation mapping documented in [`NCLP.md`](../../NCLP.md).
- First-party plugin JavaScript APIs and native bridge namespaces documented in
  the plugin reference pages.
- CLI commands `nativite init`, `nativite build`, `nativite dev`, and
  `nativite test`, including exit-code behavior and documented filesystem
  outputs.

## Experimental Or Private Surface

The following surfaces are not stable public API unless promoted in a future
minor or major release:

- Deep imports outside `package.json#exports`.
- Native runtime source file paths, internal generator helpers, platform
  registry internals, and unlisted test helpers.
- Exact human-readable CLI log wording, progress text, and warning ordering.
- Generated native project files not documented as user-editable or
  integration-owned.
- Undocumented native bridge namespaces, method names, event names, or payload
  fields.
- Patch-form NCLP messages as emitted by the JavaScript runtime. NCLP v2
  documents patch shapes, but Nativite 1.0 sends full `chrome.snapshot`
  messages.

## Semver Policy

Patch releases may fix bugs without changing documented behavior; tighten
validation for inputs that already violate documented schemas; add diagnostics,
warnings, or clearer error messages without changing documented exit-code
behavior; and update generated implementation details when documented output
roots, app-owned files, and integration points remain compatible.

Minor releases may add package exports, TypeScript exports, CLI flags, config
fields, generated files, first-party plugin methods, or NCLP optional fields.
They may also add platform support, plugin hooks, test utilities, native
capabilities, or new structured error codes when existing documented codes keep
their meaning. Deprecations require documentation and runtime or type-level
migration guidance before removal in a future major release.

Major releases may remove or rename documented exports, config fields, CLI
commands, generated integration points, or first-party plugin APIs; change
required NCLP fields, core message semantics, or native bridge wire contracts;
or remove deprecated behavior after a migration window.

## Surface-Specific Guarantees

### Package Exports And TypeScript APIs

`package.json#exports` is the complete public package boundary. Removing or
renaming a public subpath or exported TypeScript symbol is a major change.
Adding new subpaths or symbols is a minor change. CommonJS `require` conditions
are not part of the 1.0 contract.

### `nativite.config.ts`

Documented config fields are stable. New optional fields may be added in minor
releases. Validation can become stricter in patch or minor releases when the
previously accepted value contradicted the documented schema.

### Generated Native Project Structure

The generated `.nativite/ios`, `.nativite/macos`, and `.nativite/android`
project roots are stable handoff locations. Nativite may rewrite generated
files during build. App-owned native edits should live in documented extension
points, native IDE configuration, or plugin-provided files rather than patched
generated runtime internals.

### NCLP And Native Bridge Wire Contracts

NCLP v2 is the stable 1.0 chrome host protocol. Optional additive fields are
minor changes; required-field or semantic changes require a new protocol
version. Native bridge plugin payloads are stable where documented by the
client bridge and first-party plugin references.

### First-Party Plugin APIs

Documented plugin functions, TypeScript interfaces, bridge namespaces, method
names, event names, and structured error codes are public API. Unsupported
platform behavior that returns structured `unsupported` errors is also part of
the contract.

### CLI Commands And Output Guarantees

The stable CLI contract covers command names, documented flags, exit codes,
generated filesystem outputs, and machine-meaningful files such as
`.nativite/dev.json`. Human-readable log text is diagnostic output and may
change in patch releases.
