import { afterEach, describe, expect, it, mock } from "bun:test";

import type { NativiteConfig } from "../../index.ts";
import type { ResolvedNativitePlatformRuntime } from "../../platforms/registry.ts";
import type { NativiteLogger } from "../logger.ts";

import { runBuildCommand, type BuildCommandDependencies, type ViteApi } from "../build-command.ts";

const ORIGINAL_NATIVITE_PLATFORM = process.env["NATIVITE_PLATFORM"];
const ORIGINAL_NATIVITE_PLATFORMS = process.env["NATIVITE_PLATFORMS"];
const ORIGINAL_NATIVITE_PLATFORM_METADATA = process.env["NATIVITE_PLATFORM_METADATA"];

function restoreBuildEnv(): void {
  if (ORIGINAL_NATIVITE_PLATFORM === undefined) {
    delete process.env["NATIVITE_PLATFORM"];
  } else {
    process.env["NATIVITE_PLATFORM"] = ORIGINAL_NATIVITE_PLATFORM;
  }

  if (ORIGINAL_NATIVITE_PLATFORMS === undefined) {
    delete process.env["NATIVITE_PLATFORMS"];
  } else {
    process.env["NATIVITE_PLATFORMS"] = ORIGINAL_NATIVITE_PLATFORMS;
  }

  if (ORIGINAL_NATIVITE_PLATFORM_METADATA === undefined) {
    delete process.env["NATIVITE_PLATFORM_METADATA"];
  } else {
    process.env["NATIVITE_PLATFORM_METADATA"] = ORIGINAL_NATIVITE_PLATFORM_METADATA;
  }
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
    extensions: [`.${id}`, ".native"],
    environments: [id],
    bundlePlatform: id,
    native: true,
    mobile: id === "ios" || id === "android",
    desktop: id === "windows" || id === "macos" || id === "linux",
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
  runtimes?: ResolvedNativitePlatformRuntime[];
  build?: ViteApi["build"];
  loadViteApi?: BuildCommandDependencies["loadViteApi"];
}): BuildCommandDependencies {
  const runtimes = options?.runtimes ?? [
    createRuntime("ios"),
    createRuntime("macos"),
    createRuntime("android"),
  ];

  const viteBuild =
    options?.build ??
    mock(async (_inlineConfig?: Record<string, unknown>) => {
      return;
    });

  return {
    cwd: () => "/fake/project",
    loadConfig: async () => createMockConfig(),
    resolveConfiguredPlatformRuntimes: () => runtimes,
    serializePlatformRuntimeMetadata: () => "mock-metadata",
    loadViteApi:
      options?.loadViteApi ??
      (async () => ({
        build: viteBuild,
      })),
    createLogger: () => createMockLogger(),
  };
}

afterEach(() => {
  restoreBuildEnv();
});

describe("runBuildCommand", () => {
  it("builds each configured platform in production mode", async () => {
    const observedPlatforms: string[] = [];
    const build = mock(async (inlineConfig?: Record<string, unknown>) => {
      observedPlatforms.push(process.env["NATIVITE_PLATFORM"] ?? "");
      expect(inlineConfig?.["mode"]).toBe("production");
    });

    const deps = createDependencies({ build });
    const exitCode = await runBuildCommand({}, deps);

    expect(exitCode).toBe(0);
    expect(build).toHaveBeenCalledTimes(3);
    expect(observedPlatforms).toEqual(["ios", "macos", "android"]);
    expect(process.env["NATIVITE_PLATFORMS"]).toBe("ios,macos,android");
    expect(process.env["NATIVITE_PLATFORM_METADATA"]).toBe("mock-metadata");
  });

  it("can target a single platform with --platform", async () => {
    const observedPlatforms: string[] = [];
    const build = mock(async () => {
      observedPlatforms.push(process.env["NATIVITE_PLATFORM"] ?? "");
    });

    const deps = createDependencies({ build });
    const exitCode = await runBuildCommand({ platform: "android" }, deps);

    expect(exitCode).toBe(0);
    expect(build).toHaveBeenCalledTimes(1);
    expect(observedPlatforms).toEqual(["android"]);
  });

  it("returns 1 for an unknown platform", async () => {
    const build = mock(async () => {
      return;
    });

    const deps = createDependencies({ build });
    const exitCode = await runBuildCommand({ platform: "web" }, deps);

    expect(exitCode).toBe(1);
    expect(build).not.toHaveBeenCalled();
  });

  it("stops on the first build failure", async () => {
    const observedPlatforms: string[] = [];
    const build = mock(async () => {
      observedPlatforms.push(process.env["NATIVITE_PLATFORM"] ?? "");
      if (observedPlatforms.length === 2) {
        throw new Error("kaboom");
      }
    });

    const deps = createDependencies({ build });
    const exitCode = await runBuildCommand({}, deps);

    expect(exitCode).toBe(1);
    expect(build).toHaveBeenCalledTimes(2);
    expect(observedPlatforms).toEqual(["ios", "macos"]);
  });

  it("returns 1 when no platforms are configured", async () => {
    const build = mock(async () => {
      return;
    });

    const deps = createDependencies({ runtimes: [], build });
    const exitCode = await runBuildCommand({}, deps);

    expect(exitCode).toBe(1);
    expect(build).not.toHaveBeenCalled();
  });

  it("returns 1 when vite cannot be imported", async () => {
    const deps = createDependencies({
      loadViteApi: async () => {
        throw new Error("cannot import vite");
      },
    });

    const exitCode = await runBuildCommand({}, deps);

    expect(exitCode).toBe(1);
  });
});
