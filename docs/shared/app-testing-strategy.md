# App Testing Strategy

Nativite app tests should use the fastest layer that can prove the behavior.
Most tests should stay in regular Vitest or Vitest Browser Mode with the
JavaScript stub host. Native provider tests are for behavior that depends on a
real WebView, native bridge, platform geometry, or native UI.

## Decision Matrix

| Layer                                   | Use for                                                                                                                                                                                  | Avoid for                                                                                                                          | Command                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Regular Vitest                          | App logic, client RPC wrappers, stores, state reducers, and chrome API usage that does not need a rendered DOM                                                                           | DOM layout, browser APIs, native rendering, native geometry, native plugin behavior                                                | `bunx vitest run`                     |
| Vitest Browser Mode + stub host         | DOM/component behavior, browser APIs, rendered interactions, mocked bridge calls, emitted native events, and captured NCLP snapshots without native startup cost                         | Native WebView quirks, native chrome rendering, safe-area/keyboard geometry, native plugins, screenshots, platform launch failures | `bunx vitest --browser.enabled --run` |
| Vitest Browser Mode + Nativite provider | Real WebView behavior, native bridge integration, native chrome rendering, safe-area/keyboard geometry, native plugin behavior, screenshots, native logs, and platform-specific failures | Pure app logic, simple DOM assertions, behavior that can be mocked with `nativite/test`                                            | `bunx nativite test --platform ios`   |

Keep the test pyramid wide at the first two layers. Native provider tests are
slower, require platform tooling, and should be reserved for behavior that
cannot be validated with JavaScript-only stubs.

## Fast Unit And Component Tests

Use regular Vitest for code that does not require a browser page. When the code
touches the Nativite browser bridge, run the test in a DOM-capable Vitest
environment and mock native bridge calls through `nativite/test`:

```ts
import { beforeEach, expect, it } from "vitest";
import { bridge } from "nativite/client";
import { nativeTest } from "nativite/test";

beforeEach(() => {
  nativeTest.reset();
});

it("maps contact picker results from the native bridge", async () => {
  nativeTest.bridge.handle("contacts", "pick", () => ({ name: "Ada" }));

  await expect(bridge.call("contacts", "pick")).resolves.toEqual({ name: "Ada" });
  expect(nativeTest.bridge.calls("contacts", "pick")).toHaveLength(1);
});
```

Use this layer for application logic, state transitions, serialization, and
wrapper behavior. Do not start simulators or emulators for code that can be
covered here.

## Browser Mode With The Stub Host

Use Vitest Browser Mode and `nativite/test` when the test needs a real DOM or
browser APIs but not a native runtime. The stub host installs a browser-local
`window.webkit.messageHandlers.nativite` implementation and sends the same NCLP
message shapes used by the native runtimes.

```ts
import { beforeEach, expect, it } from "vitest";
import { chrome, titleBar } from "nativite/chrome";
import { chromeHarness, nativeTest } from "nativite/test";

beforeEach(() => {
  nativeTest.reset();
  nativeTest.ready({ platform: "ios" });
});

it("captures the latest NCLP chrome snapshot", async () => {
  const cleanup = chrome(titleBar({ title: "Inbox" }));
  await Promise.resolve();

  expect(chromeHarness.latestSnapshot()).toMatchObject({
    nativite: 2,
    type: "chrome.snapshot",
  });

  cleanup();
});

it("emits a native chrome event into app code", async () => {
  const events: string[] = [];
  const unsubscribe = chrome.on("titleBar.trailingItemPressed", (event) => {
    events.push(event.id);
  });

  await nativeTest.emitChromeEvent({
    event: "activate",
    target: "titleBar:trailing:save",
  });

  expect(events).toEqual(["save"]);
  unsubscribe();
});
```

Stub-host browser-mode tests are the right place for rendered component
interactions, mocked native bridge calls, `shell.ready` capability negotiation,
and assertions over emitted `chrome.snapshot` messages.

Stub-host browser-mode tests do not validate native rendering, native WebView
quirks, native plugin behavior, safe-area insets, keyboard geometry, native
screenshots, simulator launch, emulator networking, or platform logs.

## Native Provider Tests

Use the Nativite Vitest Browser Mode provider only when the assertion needs the
real native side. The provider keeps Vitest responsible for test collection,
reporting, watch mode, and exit codes, while Nativite owns the native harness
and coordinator command path.

```ts
import { defineConfig } from "vitest/config";
import { nativite } from "nativite/vitest-browser-provider";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: nativite({ platform: "ios" }),
      instances: [{ browser: "ios" }],
    },
  },
});
```

Prefer the stable CLI wrapper once native-provider execution is needed:

```bash
bunx nativite test --platform ios
bunx nativite test --platform android
bunx nativite test --platform ios --device "iPhone 16"
bunx nativite test --platform android --device emulator-5554
```

Native-aware tests can use authenticated coordinator-backed commands from
`nativite/test`:

```ts
import { expect, it } from "vitest";
import { nativeHarness } from "nativite/test";

it("reads native geometry and captures failure artifacts", async () => {
  await nativeHarness.emitChromeEvent({
    event: "activate",
    target: "titleBar:trailing:save",
  });

  await expect(nativeHarness.latestSnapshot()).resolves.toMatchObject({
    type: "chrome.snapshot",
  });

  const safeArea = await nativeHarness.geometry("safeArea");
  const screenshot = await nativeHarness.screenshot("after-save");

  expect(safeArea).toBeDefined();
  expect(screenshot.path).toContain(".nativite");
});
```

`nativeHarness` reads `NATIVITE_COORDINATOR_URL`, `NATIVITE_TEST_SESSION_ID`, and
`NATIVITE_TEST_SESSION_TOKEN` from the provider environment. Tests can read safe
area or keyboard geometry with `nativeHarness.geometry("safeArea")` and
`nativeHarness.geometry("keyboard")`, capture screenshots with
`nativeHarness.screenshot("after-keyboard-open")`, and inspect native logs with
`nativeHarness.nativeLogs()`. Configure `--artifacts-dir <path>` or
`NATIVITE_TEST_ARTIFACTS_DIR` when CI needs predictable screenshot and log
locations.

## Native UI Introspection

Prefer DOM assertions for content rendered by the web app. Use native UI
introspection only for native chrome, WebView bounds, safe areas, keyboard
position, screenshots, platform accessibility trees, or plugin UI that is not
represented in the DOM.

Do not use native screenshots as a replacement for precise DOM assertions. Use
screenshots to diagnose provider failures or to validate visual behavior that
depends on native layout.

## Security Constraints

The native test protocol is debug-only. Generated harness support must be
disabled for production builds and must require a per-run session token. The
coordinator, provider, native harness, and CI logs must redact tokens and should
bind local control endpoints to loopback by default.

Do not expose coordinator commands to arbitrary app JavaScript. Test helpers
should call explicit coordinator-backed surfaces such as `nativeHarness`, not a
generic privileged bridge.

## Tooling Ownership

Vitest owns test discovery, Browser Mode lifecycle, snapshots, reporters, watch
mode, and the process exit code. Nativite owns provider configuration, native
harness launch, coordinator routing, and generated native test inputs.

Xcode, Android Studio, Gradle, simulators, emulators, and physical devices
remain platform-owned. `nativite test` validates required tools and prints
fallback instructions, but it should not hide native build or launch failures
behind generic test errors.

## Vitest Compatibility

`nativite/vitest-browser-provider` currently supports Vitest `4.x`. When an
unsupported Vitest version is detected, the provider throws an actionable error
before launching native tooling. Pin Vitest to a supported major version or use
regular Vitest and stub-host tests until the Nativite provider supports the
newer Vitest Browser Mode provider API.

## CI Guidance

Use Bun consistently in project scripts and CI jobs:

```bash
bun install --frozen-lockfile
bunx vitest run
bunx vitest --browser.enabled --run
bunx nativite test --platform ios --artifacts-dir .nativite/test-artifacts/ios
bunx nativite test --platform android --artifacts-dir .nativite/test-artifacts/android
```

Run native provider jobs separately from fast unit and browser-mode jobs so
simulator or emulator instability does not block the fast feedback loop. Upload
`.nativite/test-artifacts/**` when provider jobs fail.

This repository's default PR test workflow runs `bun test`, which includes fast
fixture coverage for the `examples/testing-strategy` stub-host and native
provider examples plus generated native harness configuration checks. The
simulator/emulator runtime suites remain in the separate path-filtered native
workflow for PRs that touch native runtime code, and can also be run manually
with `bun run test:native:ios` or `bun run test:native:android`.

## Troubleshooting

| Failure                                       | What to check                                                                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider configuration failure                | Confirm Browser Mode is enabled, `nativite/vitest-browser-provider` is installed, and Vitest is on a supported major version.                                                                                |
| Coordinator connection failure                | Confirm `NATIVITE_COORDINATOR_URL` or `--coordinator-port` points at the active local coordinator and that the endpoint is reachable from the test process.                                                  |
| Token mismatch                                | Restart the test run so the provider and harness receive the same generated session token. Check logs only for redacted token fingerprints.                                                                  |
| Android emulator cannot reach the coordinator | Use emulator host networking rules. The native side may need `10.0.2.2` to reach a coordinator running on the development machine.                                                                           |
| Simulator or device launch failure            | Open the generated native project in Xcode or Android Studio, verify platform tooling, and run the generated debug harness with the printed test URL, coordinator URL, and session token.                    |
| Dev server URL unreachable                    | Confirm the Vite/Vitest server URL is reachable from the simulator, emulator, or device. Use explicit host binding when loopback from the native runtime is not equivalent to loopback from the test runner. |
| Missing screenshot artifact                   | Pass `--artifacts-dir <path>`, inspect native logs, and confirm the provider command reached the active harness before the session closed.                                                                   |

See [JavaScript Test Utilities](./test-utilities.md),
[Vitest Browser Provider](./vitest-browser-provider.md),
[CLI Test Command](./cli-test.md), and
[Native Test Protocol](./native-test-protocol.md) for implementation details.
