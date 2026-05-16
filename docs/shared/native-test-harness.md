# Native Test Harness

Generated iOS, macOS, and Android projects include a debug/test-only native
harness path for running app tests inside the real Nativite WebView. The
harness uses the same bridge, WebView, chrome state, CSS variable, keyboard,
safe-area, and native chrome runtime components as normal app launches.

The harness is inactive by default and fails closed. It only starts when the
generated debug/test configuration supplies all required inputs:

- `NATIVITE_TEST_URL`: Vite/Vitest URL loaded by the primary WebView.
- `NATIVITE_COORDINATOR_URL`: local coordinator endpoint that receives protocol
  envelopes.
- `NATIVITE_TEST_SESSION_TOKEN`: per-run secret token. Empty tokens disable the
  harness.
- `NATIVITE_TEST_SESSION_ID`: non-secret correlation id, defaults to `local`.
- `NATIVITE_TEST_TARGET_ID`: simulator, emulator, or device id when known.
- `NATIVITE_TEST_LAUNCH_TIMEOUT_MS`: native launch timeout, defaults to `60000`.
- `NATIVITE_TEST_WEBVIEW_READY_TIMEOUT_MS`: WebView bundle readiness timeout,
  defaults to `30000`.
- `NATIVITE_COORDINATOR_TIMEOUT_MS`: coordinator connection timeout, defaults to
  `5000`.

## iOS and macOS

Apple harness configuration is read from launch environment variables in debug
builds. Set `NATIVITE_TEST_HARNESS=1` with the required URL, coordinator, and
token variables in the generated Xcode scheme or through `nativite test` when
the coordinator owns launch.

iOS and macOS simulators can use `localhost` or `127.0.0.1` to reach a dev
server or coordinator running on the host Mac. Physical device support should
use an explicit host-network URL on the same network or a future coordinator
tunnel.

## Android

Android debug builds expose harness configuration through Gradle project
properties:

- `-PnativiteTestUrl=http://10.0.2.2:5173/__nativite_test__`
- `-PnativiteCoordinatorUrl=http://10.0.2.2:17321/harness`
- `-PnativiteTestSessionToken=<token>`
- `-PnativiteTestSessionId=<session-id>`
- `-PnativiteTestTargetId=<emulator-or-device-id>`
- `-PnativiteTestLaunchTimeoutMs=60000`
- `-PnativiteTestWebViewReadyTimeoutMs=30000`
- `-PnativiteCoordinatorTimeoutMs=5000`

The generated runtime normalizes Android emulator loopback URLs from
`localhost`, `127.0.0.1`, or `::1` to `10.0.2.2`. Physical devices should use an
explicit LAN host URL or `adb reverse` for ports owned by the local coordinator.

Release builds force the generated harness flag off and replace harness-only
configuration with empty values, so release asset loading remains the embedded
production bundle path.

## Startup Events

When enabled, the native harness sends `harness.register` with token-authenticated
metadata, then sends `runtime.ready` independently of WebView readiness. After
the primary WebView finishes loading the configured test URL, the harness sends
`webview.ready`.

See [Native Test Protocol](./native-test-protocol.md) for envelope shape,
capability names, session states, and command semantics.
