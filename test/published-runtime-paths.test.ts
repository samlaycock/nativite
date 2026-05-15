import { afterEach, describe, expect, it, mock } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type PlatformRuntime = {
  readonly id: string;
  readonly config: { readonly platform: string };
  readonly plugin: {
    readonly generate?: (ctx: {
      readonly rootConfig: NativiteConfigFixture;
      readonly config: NativiteConfigFixture;
      readonly projectRoot: string;
      readonly platform: { readonly platform: string };
      readonly force: boolean;
      readonly mode: "generate";
      readonly logger: {
        info(message: string): void;
        warn(message: string): void;
        error(message: string): void;
      };
    }) => Promise<void> | void;
  };
};

type NativiteConfigFixture = {
  readonly app: {
    readonly name: string;
    readonly bundleId: string;
    readonly version: string;
    readonly buildNumber: number;
  };
  readonly platforms: ReadonlyArray<{ readonly platform: string; readonly minSdk?: number }>;
  readonly backgroundTasks?: readonly string[];
};

type RegistryChunk = {
  readonly r: (config: NativiteConfigFixture) => PlatformRuntime[];
};

describe("published runtime template paths", () => {
  const tempDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it(
    "generates iOS, macOS, and Android projects from the built package",
    async () => {
      execFileSync("bun", ["run", "build"], { stdio: "pipe" });

      const registryChunk = Array.from(new Bun.Glob("dist/registry-*.mjs").scanSync()).at(0);
      expect(registryChunk).toBeDefined();

      void mock.module("node:child_process", () => ({
        execSync(command: string, options?: { cwd?: string }) {
          if (!command.startsWith("gradle wrapper ")) {
            throw new Error(`Unexpected command: ${command}`);
          }

          const cwd = options?.cwd ?? process.cwd();
          const gradleWrapperDir = join(cwd, "gradle", "wrapper");
          mkdirSync(gradleWrapperDir, { recursive: true });
          writeFileSync(join(cwd, "gradlew"), "#!/usr/bin/env sh\n");
          writeFileSync(join(cwd, "gradlew.bat"), "");
          writeFileSync(join(gradleWrapperDir, "gradle-wrapper.jar"), "fake jar");
          return "";
        },
      }));

      const registry = (await import(
        `${pathToFileURL(join(process.cwd(), registryChunk!)).href}?runtime-paths`
      )) as RegistryChunk;
      const taskRoot = makeTempDir("nativite-published-background-task-");
      const taskPath = join(taskRoot, "sync.task.mjs");
      writeFileSync(
        taskPath,
        `import { defineBackgroundTask } from "${pathToFileURL(join(process.cwd(), "dist/background.mjs")).href}";
export default defineBackgroundTask({
  id: "sync-inbox",
  ios: { kind: "app-refresh" },
  android: { kind: "periodic-work" },
  run() {},
});
`,
      );

      const config: NativiteConfigFixture = {
        app: {
          name: "TestApp",
          bundleId: "com.example.testapp",
          version: "1.0.0",
          buildNumber: 1,
        },
        platforms: [{ platform: "ios" }, { platform: "macos" }, { platform: "android" }],
        backgroundTasks: [taskPath],
      };
      const logger = { info() {}, warn() {}, error() {} };
      const runtimes = registry.r(config);
      const projectRoots = new Map<string, string>();

      for (const platformId of ["ios", "macos", "android"]) {
        const runtime = runtimes.find((entry) => entry.id === platformId);
        expect(runtime?.plugin.generate).toBeFunction();
        const projectRoot = makeTempDir(`nativite-published-${platformId}-`);
        projectRoots.set(platformId, projectRoot);

        await runtime!.plugin.generate!({
          rootConfig: config,
          config,
          projectRoot,
          platform: runtime!.config,
          force: true,
          mode: "generate",
          logger,
        });
      }

      expect(existsSync("dist/runtime/ViewController.swift")).toBe(true);
      expect(existsSync("dist/runtime/NativiteWebView.kt")).toBe(true);
      expect(existsSync("dist/plugins/local-auth/ios/NativiteLocalAuthPlugin.swift")).toBe(true);
      expect(existsSync("dist/plugins/local-auth/android/NativiteLocalAuthPlugin.kt")).toBe(true);
      expect(existsSync("dist/plugins/app-integrity/ios/NativiteAppIntegrityPlugin.swift")).toBe(
        true,
      );
      expect(existsSync("dist/plugins/app-integrity/android/NativiteAppIntegrityPlugin.kt")).toBe(
        true,
      );
      expect(
        existsSync(
          join(
            projectRoots.get("ios")!,
            ".nativite",
            "ios",
            "TestApp",
            "nativite-background",
            "manifest.json",
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(
          join(
            projectRoots.get("macos")!,
            ".nativite",
            "macos",
            "TestApp",
            "nativite-background",
            "manifest.json",
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(
          join(
            projectRoots.get("android")!,
            ".nativite",
            "android",
            "app",
            "src",
            "main",
            "assets",
            "nativite-background",
            "manifest.json",
          ),
        ),
      ).toBe(true);
    },
    { timeout: 30_000 },
  );
});
