# CLI Dev Command

> Maps to: `src/cli/dev-command.ts`, `src/cli/index.ts`

The `nativite dev` command is an optional status dashboard for the native
development feedback loop. It does not replace `bunx vite dev`, Xcode, Android
Studio, simulators, emulators, or device launch tooling.

## Status Output

The command loads `nativite.config.ts`, resolves configured platform runtimes,
and prints:

- the Vite dev server URL and whether it is reachable
- configured platforms and generated native project paths
- platform environment names used by the Vite plugin
- a reminder that Vite hotkeys live in the terminal running `bunx vite dev`
- IDE launch hints for each generated native project

When `.nativite/dev.json` exists, `nativite dev` uses the `devURL` written by
the Vite plugin after the dev server starts. Otherwise it falls back to
`http://localhost:5173`. Pass `--url <url>` to check a specific dev server URL.

## Intended Flow

For a first-time developer after `init`:

1. Run `bunx vite dev` in one terminal.
2. Run `bunx nativite dev` when you want a concise native status summary.
3. Open the generated project in the native IDE.
4. Launch the debug build from Xcode or Android Studio.

The command is safe to skip. HMR, native project generation, production builds,
and IDE-owned debug runs continue to work through the existing Vite plugin and
native toolchains.

## Scope Boundary

`nativite dev` intentionally does not supervise native tools, start simulators,
launch emulators, or hide native toolchain failures behind generic dashboard
status. Native build and launch errors should remain visible in the IDE or
native command that produced them.
