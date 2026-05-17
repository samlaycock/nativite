# JavaScript Test Utilities

`nativite/test` is a test-only package entrypoint for app test suites. It should
not be imported by production application code.

## Local Stub Host

Use `nativeTest` and `chromeHarness` for fast Vitest and Vitest Browser Mode
tests that run entirely in JavaScript. The stub host installs a browser-local
`window.webkit.messageHandlers.nativite` implementation so `nativite/client` and
`nativite/chrome` use the same public message shapes as the native runtimes.

```ts
import { beforeEach, expect, it } from "vitest";
import { bridge } from "nativite/client";
import { chrome, titleBar } from "nativite/chrome";
import { chromeHarness, nativeTest } from "nativite/test";

beforeEach(() => {
  nativeTest.reset();
  nativeTest.ready({ platform: "ios" });
});

it("mocks native bridge calls", async () => {
  nativeTest.bridge.handle("contacts", "pick", async () => ({ name: "Ada" }));

  await expect(bridge.call("contacts", "pick")).resolves.toEqual({ name: "Ada" });
  expect(nativeTest.bridge.calls("contacts", "pick")).toHaveLength(1);
});

it("captures chrome snapshots", async () => {
  const cleanup = chrome(titleBar({ title: "Inbox" }));
  await Promise.resolve();

  expect(chromeHarness.latestSnapshot()).toMatchObject({
    type: "chrome.snapshot",
  });

  cleanup();
});
```

`nativeTest.ready()` emits an NCLP v2 `shell.ready` message with the supported
chrome capability areas. Pass `areas` to test unsupported-area behavior.

`nativeTest.emit(event, data)` emits a legacy bridge event into
`bridge.subscribe()` and `chrome.on()` listeners.

`nativeTest.emitChromeEvent({ event, target, value })` emits an NCLP v2
`chrome.event` envelope into the app runtime.

`chromeHarness.snapshots()` returns captured NCLP v2 `chrome.snapshot`
envelopes, and `chromeHarness.latestSnapshot()` returns the most recent one.

`nativeTest.reset()` restores the previous browser globals and clears bridge
handlers, call history, and captured snapshots. Call it from `beforeEach()` or
`afterEach()` so state does not leak between tests, workers, or browser-mode
sessions.

## Native Harness Commands

Use `nativeHarness` only for tests that intentionally run against a real native
harness and local coordinator. These helpers do not use the local stub host.
They post command requests to `NATIVITE_COORDINATOR_URL`, or to the `endpoint`
passed per command. Privileged commands include the per-run
`NATIVITE_TEST_SESSION_TOKEN`, or the `sessionToken` passed per command.

```ts
import { nativeHarness } from "nativite/test";

await nativeHarness.emitChromeEvent({
  event: "activate",
  target: "appWindow:main/button:save",
});

expect(await nativeHarness.latestSnapshot()).toMatchObject({
  type: "chrome.snapshot",
});

const safeArea = await nativeHarness.geometry("safeArea");
const keyboard = await nativeHarness.geometry("keyboard");
const screenshot = await nativeHarness.screenshot("after-keyboard-open");
const logs = await nativeHarness.nativeLogs();
```

The coordinator-backed surface is intentionally grouped under `nativeHarness`
so app authors do not accidentally add native-tooling requirements to fast
browser-mode tests.

The coordinator, native harness, message envelope, session-token rules,
capability negotiation, timeout behavior, cancellation behavior, and native
command mapping are defined in [Native Test Protocol](./native-test-protocol.md).
