import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
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
};

type RegistryChunk = {
  readonly r: (config: NativiteConfigFixture) => PlatformRuntime[];
};

describe("published runtime template paths", () => {
  const tempDirs: string[] = [];
  const originalPath = process.env.PATH;

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    process.env.PATH = originalPath;
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

      const registry = (await import(
        `${pathToFileURL(join(process.cwd(), registryChunk!)).href}?runtime-paths`
      )) as RegistryChunk;

      const config: NativiteConfigFixture = {
        app: {
          name: "TestApp",
          bundleId: "com.example.testapp",
          version: "1.0.0",
          buildNumber: 1,
        },
        platforms: [{ platform: "ios" }, { platform: "macos" }, { platform: "android" }],
      };
      const logger = { info() {}, warn() {}, error() {} };
      const fakeGradleBin = makeTempDir("nativite-fake-gradle-bin-");
      const fakeGradlePath = join(fakeGradleBin, "gradle");

      writeFileSync(
        fakeGradlePath,
        [
          "#!/usr/bin/env sh",
          "mkdir -p gradle/wrapper",
          "printf '#!/usr/bin/env sh\\n' > gradlew",
          "chmod +x gradlew",
          "printf '' > gradlew.bat",
          "printf 'fake jar' > gradle/wrapper/gradle-wrapper.jar",
        ].join("\n"),
      );
      chmodSync(fakeGradlePath, 0o755);
      process.env.PATH = `${fakeGradleBin}${delimiter}${originalPath ?? ""}`;

      const runtimes = registry.r(config);

      for (const platformId of ["ios", "macos", "android"]) {
        const runtime = runtimes.find((entry) => entry.id === platformId);
        expect(runtime?.plugin.generate).toBeFunction();

        await runtime!.plugin.generate!({
          rootConfig: config,
          config,
          projectRoot: makeTempDir(`nativite-published-${platformId}-`),
          platform: runtime!.config,
          force: true,
          mode: "generate",
          logger,
        });
      }

      expect(existsSync("dist/runtime/ViewController.swift")).toBe(true);
      expect(existsSync("dist/runtime/NativiteWebView.kt")).toBe(true);
    },
    { timeout: 30_000 },
  );
});
