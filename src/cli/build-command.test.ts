import { afterEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { NativiteConfig } from "../index.ts";
import type { ResolvedNativitePlatformRuntime } from "../platforms/registry.ts";
import type { NativiteLogger } from "./logger.ts";

import { runBuildCommand, type BuildCommandDependencies, type ViteApi } from "./build-command.ts";

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
    rootDir: "/mock/project",
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
  cwd?: string;
  runtimes?: ResolvedNativitePlatformRuntime[];
  build?: ViteApi["build"];
  loadViteApi?: BuildCommandDependencies["loadViteApi"];
  logger?: NativiteLogger;
  exists?: BuildCommandDependencies["exists"];
  remove?: BuildCommandDependencies["remove"];
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
    cwd: () => options?.cwd ?? "/fake/project",
    loadConfig: async () => createMockConfig(),
    resolveConfiguredPlatformRuntimes: () => runtimes,
    serializePlatformRuntimeMetadata: () => "mock-metadata",
    loadViteApi:
      options?.loadViteApi ??
      (async () => ({
        build: viteBuild,
      })),
    createLogger: () => options?.logger ?? createMockLogger(),
    exists: options?.exists ?? (() => true),
    readFile: (path) => {
      if (existsSync(path)) return readFileSync(path, "utf-8");
      return JSON.stringify({
        manifestPath: "dist-ios/manifest.json",
        nativeProjectPath: ".nativite/ios/TestApp.xcodeproj",
      });
    },
    remove: options?.remove ?? (() => {}),
  };
}

function createTempProject(): string {
  return mkdtempSync(join(tmpdir(), "nativite-build-command-"));
}

function writeSuccessfulIosOutputs(projectRoot: string): void {
  mkdirSync(join(projectRoot, "dist-ios"), { recursive: true });
  mkdirSync(join(projectRoot, ".nativite", "ios", "TestApp.xcodeproj"), { recursive: true });
  mkdirSync(join(projectRoot, ".nativite", "build"), { recursive: true });
  writeFileSync(join(projectRoot, "dist-ios", "manifest.json"), "{}\n");
  writeFileSync(
    join(projectRoot, ".nativite", "build", "ios.json"),
    JSON.stringify({
      manifestPath: "dist-ios/manifest.json",
      nativeProjectPath: ".nativite/ios/TestApp.xcodeproj",
    }),
  );
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

  it("prints the native project and web bundle paths for the target platform", async () => {
    const info = mock(() => {});
    const logger: NativiteLogger = {
      ...createMockLogger(),
      info,
    };
    const deps = createDependencies({ logger });

    const exitCode = await runBuildCommand({ platform: "ios" }, deps);

    expect(exitCode).toBe(0);
    expect(info).toHaveBeenCalledWith("Native project: .nativite/ios/TestApp.xcodeproj");
    expect(info).toHaveBeenCalledWith("Web bundle: dist-ios");
  });

  it("prints next steps for every successfully built configured platform", async () => {
    const info = mock(() => {});
    const logger: NativiteLogger = {
      ...createMockLogger(),
      info,
    };
    const deps = createDependencies({ logger });

    const exitCode = await runBuildCommand({}, deps);

    expect(exitCode).toBe(0);
    expect(info).toHaveBeenCalledWith(
      "Next steps:\n  iOS: open .nativite/ios/TestApp.xcodeproj\n  macOS: open .nativite/macos/TestApp.xcodeproj\n  Android: open .nativite/android",
    );
  });

  it("prints only the targeted platform in the next steps", async () => {
    const info = mock(() => {});
    const logger: NativiteLogger = {
      ...createMockLogger(),
      info,
    };
    const deps = createDependencies({ logger });

    const exitCode = await runBuildCommand({ platform: "ios" }, deps);

    expect(exitCode).toBe(0);
    expect(info).toHaveBeenCalledWith("Next steps:\n  iOS: open .nativite/ios/TestApp.xcodeproj");
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
    const info = mock(() => {});
    const logger: NativiteLogger = {
      ...createMockLogger(),
      info,
    };
    const observedPlatforms: string[] = [];
    const build = mock(async () => {
      observedPlatforms.push(process.env["NATIVITE_PLATFORM"] ?? "");
      if (observedPlatforms.length === 2) {
        throw new Error("kaboom");
      }
    });

    const deps = createDependencies({ build, logger });
    const exitCode = await runBuildCommand({}, deps);

    expect(exitCode).toBe(1);
    expect(build).toHaveBeenCalledTimes(2);
    expect(observedPlatforms).toEqual(["ios", "macos"]);
    expect(info).not.toHaveBeenCalledWith(
      "Next steps:\n  iOS: open .nativite/ios/TestApp.xcodeproj\n  macOS: open .nativite/macos/TestApp.xcodeproj\n  Android: open .nativite/android",
    );
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

  it("fails when the Nativite Vite plugin did not run for the platform build", async () => {
    const projectRoot = createTempProject();
    try {
      mkdirSync(join(projectRoot, "dist-ios"), { recursive: true });
      mkdirSync(join(projectRoot, ".nativite", "ios", "TestApp.xcodeproj"), { recursive: true });
      writeFileSync(join(projectRoot, "dist-ios", "manifest.json"), "{}\n");

      const error = mock(() => {});
      const logger: NativiteLogger = {
        ...createMockLogger(),
        error,
      };
      const deps = createDependencies({
        cwd: projectRoot,
        runtimes: [createRuntime("ios")],
        logger,
        exists: existsSync,
        remove: (path) => rmSync(path, { force: true }),
      });

      const exitCode = await runBuildCommand({ platform: "ios" }, deps);

      expect(exitCode).toBe(1);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('Add `nativite()` to your Vite config "plugins" array.'),
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("fails when the platform web manifest is missing after the build", async () => {
    const projectRoot = createTempProject();
    try {
      mkdirSync(join(projectRoot, ".nativite", "ios", "TestApp.xcodeproj"), { recursive: true });

      const error = mock(() => {});
      const logger: NativiteLogger = {
        ...createMockLogger(),
        error,
      };
      const deps = createDependencies({
        cwd: projectRoot,
        runtimes: [createRuntime("ios")],
        logger,
        exists: existsSync,
        remove: (path) => rmSync(path, { force: true }),
        build: async () => {
          mkdirSync(join(projectRoot, ".nativite", "build"), { recursive: true });
          writeFileSync(
            join(projectRoot, ".nativite", "build", "ios.json"),
            JSON.stringify({
              manifestPath: "dist-ios/manifest.json",
              nativeProjectPath: ".nativite/ios/TestApp.xcodeproj",
            }),
          );
        },
      });

      const exitCode = await runBuildCommand({ platform: "ios" }, deps);

      expect(exitCode).toBe(1);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("Expected web bundle manifest was not generated"),
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("fails when the native project output is missing after the build", async () => {
    const projectRoot = createTempProject();
    try {
      mkdirSync(join(projectRoot, "dist-ios"), { recursive: true });
      writeFileSync(join(projectRoot, "dist-ios", "manifest.json"), "{}\n");

      const error = mock(() => {});
      const logger: NativiteLogger = {
        ...createMockLogger(),
        error,
      };
      const deps = createDependencies({
        cwd: projectRoot,
        runtimes: [createRuntime("ios")],
        logger,
        exists: existsSync,
        remove: (path) => rmSync(path, { force: true }),
        build: async () => {
          mkdirSync(join(projectRoot, ".nativite", "build"), { recursive: true });
          writeFileSync(
            join(projectRoot, ".nativite", "build", "ios.json"),
            JSON.stringify({
              manifestPath: "dist-ios/manifest.json",
              nativeProjectPath: ".nativite/ios/TestApp.xcodeproj",
            }),
          );
        },
      });

      const exitCode = await runBuildCommand({ platform: "ios" }, deps);

      expect(exitCode).toBe(1);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("Expected native project output was not generated"),
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("reports success only after plugin marker, manifest, and native project exist", async () => {
    const projectRoot = createTempProject();
    try {
      const build = mock(async () => {
        writeSuccessfulIosOutputs(projectRoot);
      });
      const deps = createDependencies({
        cwd: projectRoot,
        runtimes: [createRuntime("ios")],
        build,
        exists: existsSync,
        remove: (path) => rmSync(path, { force: true }),
      });

      const exitCode = await runBuildCommand({ platform: "ios" }, deps);

      expect(exitCode).toBe(0);
      expect(existsSync(join(projectRoot, ".nativite", "build", "ios.json"))).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
