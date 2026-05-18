# Vitest Browser Provider

> Maps to: `src/vitest-browser-provider/index.ts`, `src/cli/test-command.ts`

`nativite/vitest-browser-provider` exposes the Nativite Vitest Browser Mode
provider factory. The provider is the real-native test integration path: Vitest
continues to own test collection, browser RPC, lifecycle reporting, snapshots,
watch mode, reporters, and CI exit codes, while Nativite owns native harness
launch and coordinator command routing.

## Configuration

Use the provider object in Vitest Browser Mode config:

```ts
import { defineConfig } from "vitest/config";
import { nativite } from "nativite/vitest-browser-provider";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: nativite({ platform: "macos" }),
      instances: [{ browser: "macos" }],
    },
  },
});
```

The provider accepts:

- `platform`: `ios`, `macos`, or `android`.
- `device`: optional simulator, emulator, or physical device id.
- `testUrl`: optional URL passed to the generated native harness.
- `coordinator.endpoint`: local coordinator endpoint, defaulting to
  `NATIVITE_COORDINATOR_URL` or `http://127.0.0.1:17321/harness`.
- `artifactsDir`: predictable output directory for native logs, screenshots,
  and failure artifacts.
- `launchTimeoutMs`: native harness launch timeout.
- `watch`: whether the current Vitest run is watch mode.
- `vitestVersion`: optional explicit compatibility guard. The current provider
  supports Vitest `4.x` and throws an actionable error for other major versions.

## Provider Contract

The provider implements the Vitest 4 browser provider contract:

- `name` is `nativite`.
- `supportsParallelism` is `false` until the coordinator can isolate multiple
  devices or harness sessions safely.
- `openPage(sessionId, url, options)` sends an `open-page` coordinator command
  with the Vitest Browser Mode page URL and native harness launch options.
- `getCommandsContext(sessionId)` exposes coordinator-backed commands for
  native events, NCLP chrome events, latest snapshot reads, geometry reads,
  screenshots, and native logs.
- `close()` sends `close` for every opened session so the coordinator can tear
  down harness sessions, owned simulator/emulator resources, sockets, and
  temporary artifacts.

## Commands Context

The commands context is intentionally narrow and maps directly to the native
test protocol:

- `emit(event, data)` routes native event commands.
- `emitChromeEvent(event)` routes NCLP chrome interaction events.
- `latestSnapshot()` returns the latest native chrome snapshot.
- `geometry(target)` asks the harness/coordinator for target geometry.
- `screenshot(name)` captures a native screenshot artifact.
- `nativeLogs()` reads native runtime log entries.

Coordinator failures are thrown from provider methods so Vitest reports them as
normal actionable test failures.

## CLI Integration

`nativite test` writes `.nativite/test/vitest.nativite.generated.mts` and imports
`nativite/vitest-browser-provider` directly. The generated config merges the
project Vitest config with Browser Mode settings:

```ts
test: {
  browser: {
    enabled: true,
    provider: nativite(nativiteProviderOptions),
    instances: [{ browser: nativiteProviderOptions.device ?? nativiteProviderOptions.platform }],
  },
}
```

Use regular Vitest for pure browser/unit tests, Vitest Browser Mode with
`nativite/test` for stub native-host tests, and Vitest Browser Mode with this
provider for real native harness tests running inside a generated app build.
