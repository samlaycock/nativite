# CLI Test Command

> Maps to: `src/cli/test-command.ts`, `src/cli/index.ts`

The `nativite test` command is the user-facing orchestration entrypoint for
native-aware app tests. It keeps Vitest Browser Mode responsible for test
selection, watch mode, reporting, snapshots, and CI exit codes, while Nativite
provides the native harness and local coordinator details needed by tests that
opt into real native execution.

## Usage

```bash
bunx nativite test --platform ios
bunx nativite test --platform macos
bunx nativite test --platform android
bunx nativite test --platform ios --watch
bunx nativite test --platform android --device emulator-5554
```

`--platform` is required and currently accepts `ios`, `macos`, or `android`.
`--device` passes a simulator, emulator, or physical device id to the provider.
macOS launches target the host app directly, so `--device` is usually omitted.
`--watch` keeps Vitest in watch mode; otherwise the command appends `--run` for
CI-friendly non-watch execution.

Optional lower-level flags are available when a test environment needs explicit
networking or artifact paths:

- `--test-url <url>` sets the URL loaded by the generated native harness.
- `--coordinator-port <port>` selects the local loopback coordinator port.
- `--artifacts-dir <path>` selects where native logs, screenshots, and other
  failure artifacts are written.
- `--timeout <ms>` sets the native harness launch timeout.

## Vitest Provider Invocation

The command validates `nativite.config.ts`, resolves the selected platform, and
checks the minimum native tooling before invoking Vitest. iOS and macOS tests
require macOS with `xcodebuild` and `xcrun`; Android tests require `adb` on
`PATH`.

Before launching Vitest, the command writes
`.nativite/test/vitest.nativite.generated.mts`. This generated config imports
`nativite/vitest-browser-provider` and merges the project's `vitest.config` with
Browser Mode settings for the Nativite provider:

```ts
test: {
  browser: {
    enabled: true,
    provider: nativite(nativiteProviderOptions),
    instances: [{ browser: nativiteProviderOptions.device ?? nativiteProviderOptions.platform }],
  },
}
```

Vitest is launched with `bunx vitest --config <generated-config>
--browser.enabled`. Non-watch mode also includes `--run`.

The same provider options are exposed through environment variables for
provider implementations and native harness launch code:

- `NATIVITE_TEST_PLATFORM`
- `NATIVITE_TEST_DEVICE`
- `NATIVITE_TEST_URL`
- `NATIVITE_COORDINATOR_URL`
- `NATIVITE_TEST_SESSION_ID`
- `NATIVITE_TEST_SESSION_TOKEN`
- `NATIVITE_TEST_TARGET_ID`
- `NATIVITE_TEST_ARTIFACTS_DIR`
- `NATIVITE_TEST_PROVIDER_OPTIONS`

`NATIVITE_TEST_PROVIDER_OPTIONS` intentionally excludes
`NATIVITE_TEST_SESSION_TOKEN`; the token is passed only through the dedicated
environment variable so CI secret masking can target one value.

## Coordinator Lifecycle

The coordinator is a local debug/test-only control plane for the Nativite
Vitest provider and generated native harness. It must bind to loopback by
default and creates a per-run session token before launching or guiding launch
of the native harness. The CLI logs only a redacted token value.

The expected lifecycle is:

1. `nativite test` creates provider options, writes the generated Vitest config,
   and starts Vitest Browser Mode with the Nativite provider.
2. `nativite test` starts the local HTTP coordinator on the generated loopback
   endpoint and creates a random session token with 256 bits of entropy.
3. The coordinator prints exact Xcode or Android Studio fallback steps with the
   required harness inputs. Automatic simulator/emulator build launch remains a
   platform-specific follow-up; the current coordinator owns the protocol
   session, validation, routing, artifacts, and teardown.
4. The native harness registers with `harness.register`, including its session
   token, platform, app id, runtime version, device id, and test URL.
5. The coordinator validates the token, protocol version, platform, app id, and
   active session before accepting the harness.
6. Browser-side helpers from `nativite/test` send native commands through
   `/commands/<command>` using the session token. Vitest provider lifecycle
   commands use `/harness`.
7. The harness streams readiness, native logs, screenshots, artifacts, protocol
   errors, and runtime state updates back to the coordinator.
8. Vitest remains responsible for test assertions, reporters, snapshots, watch
   mode, and the final process exit code.
9. At the end of the run, the coordinator tears down sockets, harness sessions,
   native resources it owns, and temporary artifacts.

Startup and failure output should distinguish Vitest configuration errors,
unsupported Vitest provider API versions, native build failures, launch
failures, harness connection failures, coordinator protocol failures, and test
assertion failures. The coordinator must redact session tokens in logs.

See [Native Test Harness](./native-test-harness.md) and
[Native Test Protocol](./native-test-protocol.md) for the generated native
configuration and wire protocol details. See
[Vitest Browser Provider](./vitest-browser-provider.md) for the provider
contract and commands context exposed to Browser Mode tests.
