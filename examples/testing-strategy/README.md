# Nativite Testing Strategy Examples

These snippets mirror the recommended app testing layers:

- `regular-vitest.bridge.example.ts` shows a fast regular Vitest test that mocks a
  `nativite/client` bridge call.
- `browser-mode.stub-host.example.ts` shows Vitest Browser Mode with the
  JavaScript stub host, including chrome snapshot assertions and native event
  simulation.
- `vitest.nativite.config.ts` shows direct provider configuration for native
  provider tests.
- `native-provider.safe-area.example.ts` shows the shape of a native-provider test
  that reads coordinator-backed geometry and screenshot artifacts.

Run the fast layers with Bun:

```bash
bunx vitest run
bunx vitest --browser.enabled --run
```

Run real native provider tests through the CLI wrapper:

```bash
bunx nativite test --platform ios
bunx nativite test --platform android
```

Native provider tests require platform tooling. iOS runs require macOS with
Xcode command-line tools. Android runs require Android Studio or the Android
SDK, Gradle, and an available emulator or device.
