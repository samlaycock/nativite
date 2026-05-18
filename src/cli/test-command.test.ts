import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { NativiteConfig } from "../index.ts";
import type { ResolvedNativitePlatformRuntime } from "../platforms/registry.ts";
import type { NativiteLogger } from "./logger.ts";
import type { NativeTestCoordinator } from "./native-test-coordinator.ts";

import {
  createGeneratedVitestConfig,
  createTestProviderConfig,
  runTestCommand,
  type TestCommandDependencies,
} from "./test-command.ts";

const tempDirs: string[] = [];
const ORIGINAL_NATIVITE_TEST_DEVICE = process.env["NATIVITE_TEST_DEVICE"];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }

  if (ORIGINAL_NATIVITE_TEST_DEVICE === undefined) {
    delete process.env["NATIVITE_TEST_DEVICE"];
  } else {
    process.env["NATIVITE_TEST_DEVICE"] = ORIGINAL_NATIVITE_TEST_DEVICE;
  }
});

function createTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "nativite-test-command-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, ".nativite"), { recursive: true });
  writeFileSync(join(dir, "vitest.config.ts"), "export default {};\n");
  return dir;
}

function createTempProjectWithMtsConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), "nativite-test-command-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, ".nativite"), { recursive: true });
  writeFileSync(join(dir, "vitest.config.mts"), "export default {};\n");
  return dir;
}

function createMockConfig(): NativiteConfig {
  return {
    app: {
      name: "TestApp",
      bundleId: "com.example.testapp",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [
      { platform: "ios", minimumVersion: "17.0" },
      { platform: "macos", minimumVersion: "14.0" },
      { platform: "android", minSdk: 26 },
    ],
  } as NativiteConfig;
}

function createRuntime(id: string): ResolvedNativitePlatformRuntime {
  return {
    id,
    config: { platform: id } as ResolvedNativitePlatformRuntime["config"],
    plugin: { name: `${id}-plugin`, platform: id },
    rootDir: "/mock/project",
    extensions: [`.${id}`, ".native"],
    environments: [id],
    bundlePlatform: id,
    native: true,
    mobile: id === "ios" || id === "android",
    desktop: id === "macos",
  };
}

function createMockLogger(): NativiteLogger {
  return {
    tag: "nativite",
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };
}

function createSpawnVitestMock(
  implementation: TestCommandDependencies["spawnVitest"] = async () => {
    return 0;
  },
): TestCommandDependencies["spawnVitest"] & {
  readonly mock: {
    readonly calls: [string, readonly string[], NodeJS.ProcessEnv][];
  };
} {
  return mock(implementation) as TestCommandDependencies["spawnVitest"] & {
    readonly mock: {
      readonly calls: [string, readonly string[], NodeJS.ProcessEnv][];
    };
  };
}

function createDependencies(options?: {
  readonly cwd?: string;
  readonly platform?: NodeJS.Platform;
  readonly runtimes?: ResolvedNativitePlatformRuntime[];
  readonly commandExists?: TestCommandDependencies["commandExists"];
  readonly writeFile?: TestCommandDependencies["writeFile"];
  readonly spawnVitest?: TestCommandDependencies["spawnVitest"];
  readonly coordinator?: NativeTestCoordinator;
  readonly logger?: NativiteLogger;
}): TestCommandDependencies {
  return {
    cwd: () => options?.cwd ?? createTempProject(),
    platform: () => options?.platform ?? "darwin",
    loadConfig: async () => createMockConfig(),
    resolveConfiguredPlatformRuntimes: () =>
      options?.runtimes ?? [createRuntime("ios"), createRuntime("macos"), createRuntime("android")],
    commandExists: options?.commandExists ?? (() => true),
    writeFile: options?.writeFile ?? writeFileSync,
    spawnVitest: options?.spawnVitest ?? createSpawnVitestMock(),
    createSessionToken: () => "test-session-token",
    createCoordinator: () =>
      options?.coordinator ?? {
        endpoint: "http://127.0.0.1:17321/harness",
        sessionToken: "test-session-token",
        start: async () => {},
        stop: async () => {},
      },
    createLogger: () => options?.logger ?? createMockLogger(),
  };
}

describe("createTestProviderConfig", () => {
  it("normalizes native test provider options", () => {
    const config = createTestProviderConfig({
      platform: "android",
      device: "emulator-5554",
      watch: true,
      coordinatorPort: "18444",
      timeout: "90000",
      sessionId: "session-1",
      sessionToken: "token-1",
    });

    expect(config).toEqual({
      platform: "android",
      device: "emulator-5554",
      testUrl: "http://127.0.0.1:5173/__nativite_test__",
      coordinator: {
        host: "127.0.0.1",
        port: 18444,
        endpoint: "http://127.0.0.1:18444/harness",
      },
      sessionId: "session-1",
      sessionToken: "token-1",
      artifactsDir: ".nativite/test-artifacts",
      launchTimeoutMs: 90000,
      watch: true,
    });
  });

  it("rejects invalid numeric options", () => {
    expect(() =>
      createTestProviderConfig({
        platform: "ios",
        watch: false,
        coordinatorPort: "zero",
      }),
    ).toThrow("--coordinator-port must be a positive integer.");
  });
});

describe("createGeneratedVitestConfig", () => {
  it("generates a Vitest Browser Mode provider config for Nativite", () => {
    const contents = createGeneratedVitestConfig(
      createTestProviderConfig({ platform: "ios", watch: false }),
    );

    expect(contents).toContain('import { nativite } from "nativite/vitest-browser-provider";');
    expect(contents).toContain("provider: nativite(nativiteProviderOptions)");
    expect(contents).toContain(
      "instances: [{ browser: nativiteProviderOptions.device ?? nativiteProviderOptions.platform }]",
    );
    expect(contents).toContain('"platform": "ios"');
    expect(contents).toContain('"endpoint": "http://127.0.0.1:17321/harness"');
    expect(contents).toContain('"sessionId":');
    expect(contents).not.toContain("sessionToken");
  });

  it("uses the provided user config import specifier", () => {
    const contents = createGeneratedVitestConfig(
      createTestProviderConfig({ platform: "ios", watch: false }),
      "../../vitest.config.mts",
    );

    expect(contents).toContain('import userConfig from "../../vitest.config.mts";');
  });
});

describe("runTestCommand", () => {
  it("invokes Vitest Browser Mode through bunx with generated provider options", async () => {
    const cwd = createTempProject();
    const spawnVitest = createSpawnVitestMock();

    const exitCode = await runTestCommand(
      { platform: "android", device: "emulator-5554" },
      createDependencies({ cwd, spawnVitest }),
    );

    expect(exitCode).toBe(0);
    expect(spawnVitest).toHaveBeenCalledTimes(1);

    const [_cwd, args, env] = spawnVitest.mock.calls[0]!;
    expect(_cwd).toBe(cwd);
    expect(args).toContain("vitest");
    expect(args).toContain("--browser.enabled");
    expect(args).toContain("--run");
    expect(env["NATIVITE_TEST_PLATFORM"]).toBe("android");
    expect(env["NATIVITE_TEST_DEVICE"]).toBe("emulator-5554");
    expect(env["NATIVITE_COORDINATOR_URL"]).toBe("http://127.0.0.1:17321/harness");
    expect(env["NATIVITE_TEST_SESSION_TOKEN"]).toBe("test-session-token");
    expect(env["NATIVITE_TEST_PROVIDER_OPTIONS"]).not.toContain("test-session-token");
    expect(env["NATIVITE_TEST_PROVIDER_OPTIONS"]).not.toContain("sessionToken");
  });

  it("omits the device environment variable when no device is specified", async () => {
    const cwd = createTempProject();
    const spawnVitest = createSpawnVitestMock();
    process.env["NATIVITE_TEST_DEVICE"] = "stale-device-id";

    const exitCode = await runTestCommand(
      { platform: "android" },
      createDependencies({ cwd, spawnVitest }),
    );

    expect(exitCode).toBe(0);
    const env = spawnVitest.mock.calls[0]![2];
    expect(env["NATIVITE_TEST_DEVICE"]).toBeUndefined();
  });

  it("imports vitest.config.mts when that is the project config", async () => {
    const cwd = createTempProjectWithMtsConfig();
    const writtenFiles: Record<string, string> = {};
    const deps = createDependencies({
      cwd,
      writeFile: (path, contents) => {
        writtenFiles[path] = contents;
      },
    });

    const exitCode = await runTestCommand({ platform: "ios" }, deps);

    expect(exitCode).toBe(0);
    const generatedConfig = Object.values(writtenFiles)[0];
    expect(generatedConfig).toContain('import userConfig from "../../vitest.config.mts";');
  });

  it("returns 1 with a clean error when generated config writing fails", async () => {
    const cwd = createTempProject();
    const error = mock(() => {});
    const spawnVitest = createSpawnVitestMock();
    const logger: NativiteLogger = {
      ...createMockLogger(),
      error,
    };

    const exitCode = await runTestCommand(
      { platform: "ios" },
      createDependencies({
        cwd,
        logger,
        spawnVitest,
        writeFile: () => {
          throw new Error("disk full");
        },
      }),
    );

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith("Could not write generated Vitest config: disk full");
    expect(spawnVitest).not.toHaveBeenCalled();
  });

  it("keeps Vitest in watch mode when --watch is passed", async () => {
    const cwd = createTempProject();
    const spawnVitest = createSpawnVitestMock();

    const exitCode = await runTestCommand(
      { platform: "ios", watch: true },
      createDependencies({ cwd, spawnVitest }),
    );

    expect(exitCode).toBe(0);
    const args = spawnVitest.mock.calls[0]![1];
    expect(args).not.toContain("--run");
  });

  it("invokes Vitest Browser Mode for macOS test runs", async () => {
    const cwd = createTempProject();
    const spawnVitest = createSpawnVitestMock();

    const exitCode = await runTestCommand(
      { platform: "macos" },
      createDependencies({ cwd, spawnVitest }),
    );

    expect(exitCode).toBe(0);
    const [_cwd, args, env] = spawnVitest.mock.calls[0]!;
    expect(_cwd).toBe(cwd);
    expect(args).toContain("vitest");
    expect(args).toContain("--browser.enabled");
    expect(args).toContain("--run");
    expect(env["NATIVITE_TEST_PLATFORM"]).toBe("macos");
  });

  it("fails before invoking Vitest when the platform is not supported", async () => {
    const spawnVitest = createSpawnVitestMock();

    const exitCode = await runTestCommand(
      { platform: "windows" },
      createDependencies({
        runtimes: [createRuntime("windows")],
        spawnVitest,
      }),
    );

    expect(exitCode).toBe(1);
    expect(spawnVitest).not.toHaveBeenCalled();
  });

  it("fails with an actionable iOS tooling error before invoking Vitest", async () => {
    const error = mock(() => {});
    const spawnVitest = createSpawnVitestMock();
    const logger: NativiteLogger = {
      ...createMockLogger(),
      error,
    };

    const exitCode = await runTestCommand(
      { platform: "ios" },
      createDependencies({
        commandExists: (command) => command !== "xcodebuild",
        logger,
        spawnVitest,
      }),
    );

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(
      "iOS native tests require xcodebuild. Install Xcode or Xcode Command Line Tools.",
    );
    expect(spawnVitest).not.toHaveBeenCalled();
  });

  it("fails with an actionable macOS tooling error before invoking Vitest", async () => {
    const error = mock(() => {});
    const spawnVitest = createSpawnVitestMock();
    const logger: NativiteLogger = {
      ...createMockLogger(),
      error,
    };

    const exitCode = await runTestCommand(
      { platform: "macos" },
      createDependencies({
        commandExists: (command) => command !== "xcrun",
        logger,
        spawnVitest,
      }),
    );

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(
      "macOS native tests require xcrun. Install Xcode or Xcode Command Line Tools.",
    );
    expect(spawnVitest).not.toHaveBeenCalled();
  });

  it("fails with an actionable Android tooling error before invoking Vitest", async () => {
    const error = mock(() => {});
    const spawnVitest = createSpawnVitestMock();
    const logger: NativiteLogger = {
      ...createMockLogger(),
      error,
    };

    const exitCode = await runTestCommand(
      { platform: "android" },
      createDependencies({
        commandExists: (command) => command !== "adb",
        logger,
        spawnVitest,
      }),
    );

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(
      "Android native tests require adb on PATH. Install Android SDK platform-tools.",
    );
    expect(spawnVitest).not.toHaveBeenCalled();
  });
});
