import { describe, expect, it, mock } from "bun:test";

import type { NativiteConfig } from "../index.ts";
import type { ResolvedNativitePlatformRuntime } from "../platforms/registry.ts";
import type { NativiteLogger } from "./logger.ts";

import { runDevCommand, type DevCommandDependencies } from "./dev-command.ts";

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

function createDependencies(options?: {
  readonly runtimes?: ResolvedNativitePlatformRuntime[];
  readonly devServerUrl?: string;
  readonly reachable?: boolean;
  readonly logger?: NativiteLogger;
}): DevCommandDependencies {
  return {
    cwd: () => "/fake/project",
    loadConfig: async () => createMockConfig(),
    resolveConfiguredPlatformRuntimes: () =>
      options?.runtimes ?? [createRuntime("ios"), createRuntime("android")],
    readDevServerUrl: () => options?.devServerUrl,
    checkUrlReachable: async () => options?.reachable ?? true,
    createLogger: () => options?.logger ?? createMockLogger(),
  };
}

describe("runDevCommand", () => {
  it("prints configured platform status and native IDE next actions", async () => {
    const info = mock(() => {});
    const logger: NativiteLogger = {
      ...createMockLogger(),
      info,
    };

    const exitCode = await runDevCommand(
      {},
      createDependencies({
        devServerUrl: "http://192.168.1.2:5173/",
        logger,
      }),
    );

    expect(exitCode).toBe(0);
    expect(info).toHaveBeenCalledWith("Vite dev server: http://192.168.1.2:5173/ (reachable)");
    expect(info).toHaveBeenCalledWith(
      "Configured platforms:\n  iOS: configured, project .nativite/ios/TestApp.xcodeproj, environments ios\n  Android: configured, project .nativite/android, environments android",
    );
    expect(info).toHaveBeenCalledWith(
      "Native IDE launch:\n  iOS: open .nativite/ios/TestApp.xcodeproj in Xcode\n  Android: open .nativite/android in Android Studio",
    );
  });

  it("uses the explicit URL before stored dev metadata", async () => {
    const checkedUrls: string[] = [];
    const deps = createDependencies({ devServerUrl: "http://stored.test:5173" });
    const exitCode = await runDevCommand(
      { url: "http://explicit.test:5173" },
      {
        ...deps,
        checkUrlReachable: async (url) => {
          checkedUrls.push(url);
          return true;
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(checkedUrls).toEqual(["http://explicit.test:5173"]);
  });

  it("warns when the Vite dev server is not reachable", async () => {
    const warn = mock(() => {});
    const logger: NativiteLogger = {
      ...createMockLogger(),
      warn,
    };

    const exitCode = await runDevCommand({}, createDependencies({ reachable: false, logger }));

    expect(exitCode).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      "The Vite URL is not reachable. Start `bunx vite dev`, then relaunch from the native IDE.",
    );
  });

  it("returns 1 when no platforms are configured", async () => {
    const exitCode = await runDevCommand({}, createDependencies({ runtimes: [] }));

    expect(exitCode).toBe(1);
  });
});
