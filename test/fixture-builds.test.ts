import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runBuildCommand } from "../src/cli/build-command.ts";
import { loadConfig } from "../src/cli/config.ts";
import { createNativiteLogger } from "../src/cli/logger.ts";
import {
  resolveConfiguredPlatformRuntimes,
  serializePlatformRuntimeMetadata,
} from "../src/platforms/registry.ts";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const nativiteEntry = join(repoRoot, "src", "index.ts");
const viteEntry = join(repoRoot, "src", "vite", "index.ts");
const originalCwd = process.cwd();
const originalNativitePlatform = process.env["NATIVITE_PLATFORM"];
const originalNativitePlatforms = process.env["NATIVITE_PLATFORMS"];
const originalNativitePlatformMetadata = process.env["NATIVITE_PLATFORM_METADATA"];

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function writeFixtureApp(projectRoot: string): void {
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify(
      {
        type: "module",
        dependencies: {
          nativite: "file:.",
          vite: "7.3.1",
        },
        devDependencies: {},
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(projectRoot, "nativite.config.ts"),
    `import { android, defineConfig, ios, macos } from ${JSON.stringify(nativiteEntry)};

export default defineConfig({
  app: {
    name: "FixtureApp",
    bundleId: "com.example.fixture",
    version: "2.3.4",
    buildNumber: 42,
  },
  platforms: [ios(), macos(), android()],
});
`,
  );
  writeFileSync(
    join(projectRoot, "vite.config.ts"),
    `import { nativite } from ${JSON.stringify(viteEntry)};

export default {
  plugins: [nativite()],
};
`,
  );
  writeFileSync(
    join(projectRoot, "index.html"),
    `<script type="module" src="/src/main.ts"></script>`,
  );
  writeFileSync(
    join(projectRoot, "index.ios.html"),
    `<main id="entry">ios-entry</main><script type="module" src="/src/main.ts"></script>`,
  );
  writeFileSync(
    join(projectRoot, "index.macos.html"),
    `<main id="entry">macos-entry</main><script type="module" src="/src/main.ts"></script>`,
  );
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "main.ts"),
    `import { platformLabel } from "./platform";

document.body.dataset.platform = platformLabel;
document.body.dataset.native = String(__IS_NATIVE__);
`,
  );
  writeFileSync(join(projectRoot, "src", "platform.ts"), `export const platformLabel = "web";\n`);
  writeFileSync(
    join(projectRoot, "src", "platform.ios.ts"),
    `export const platformLabel = "ios";\n`,
  );
  writeFileSync(
    join(projectRoot, "src", "platform.macos.ts"),
    `export const platformLabel = "macos";\n`,
  );
}

function writeBackgroundTaskFixture(projectRoot: string): void {
  writeFileSync(
    join(projectRoot, "nativite.config.ts"),
    `import { defineConfig, ios, macos } from ${JSON.stringify(nativiteEntry)};

export default defineConfig({
  app: {
    name: "FixtureApp",
    bundleId: "com.example.fixture",
    version: "2.3.4",
    buildNumber: 42,
  },
  platforms: [ios(), macos()],
  backgroundTasks: [
    "./src/background/periodic-sync.task.ts",
    "./src/background/refresh-session.task.ts",
  ],
});
`,
  );
  mkdirSync(join(projectRoot, "src", "background"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "background", "periodic-sync.task.ts"),
    `import { defineBackgroundTask } from ${JSON.stringify(join(repoRoot, "src", "background.ts"))};

export default defineBackgroundTask({
  id: "periodic-sync",
  ios: { kind: "app-refresh", earliestBeginAfterMinutes: 15 },
  android: { kind: "periodic-work", repeatIntervalMinutes: 15, requiresNetwork: "connected" },
  async run(ctx) {
    const cursor = await ctx.storage.get("cursor");
    await ctx.storage.set("cursor", cursor ?? "initial");
    return { status: "success", output: { cursor: cursor ?? null } };
  },
});
`,
  );
  writeFileSync(
    join(projectRoot, "src", "background", "refresh-session.task.ts"),
    `import { defineBackgroundTask } from ${JSON.stringify(join(repoRoot, "src", "background.ts"))};

export default defineBackgroundTask({
  id: "refresh-session",
  android: { kind: "one-off-work", requiresNetwork: true },
  async run(ctx) {
    await ctx.storage.set("reason", String(ctx.payload?.reason ?? "manual"));
    return "success";
  },
});
`,
  );
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

describe("fixture app native builds", () => {
  const tempDirs: string[] = [];

  function makeTempProject(): string {
    const dir = mkdtempSync(join(tmpdir(), "nativite-fixture-app-"));
    tempDirs.push(dir);
    writeFixtureApp(dir);
    return dir;
  }

  afterEach(() => {
    process.chdir(originalCwd);
    restoreEnvValue("NATIVITE_PLATFORM", originalNativitePlatform);
    restoreEnvValue("NATIVITE_PLATFORMS", originalNativitePlatforms);
    restoreEnvValue("NATIVITE_PLATFORM_METADATA", originalNativitePlatformMetadata);
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it(
    "builds real Vite fixture apps and generates native project outputs",
    async () => {
      const projectRoot = makeTempProject();
      process.chdir(projectRoot);

      const exitCode = await runBuildCommand(
        { platform: "ios" },
        {
          cwd: () => projectRoot,
          loadConfig,
          resolveConfiguredPlatformRuntimes,
          serializePlatformRuntimeMetadata,
          loadViteApi: async () => import("vite"),
          createLogger: createNativiteLogger,
        },
      );

      expect(exitCode).toBe(0);

      const iosManifest = readJson<{
        platform: string;
        version: string;
        assets: { path: string }[];
      }>(join(projectRoot, "dist-ios", "manifest.json"));
      const iosBuildMarker = readJson<{
        manifestPath: string;
        nativeProjectPath: string;
      }>(join(projectRoot, ".nativite", "build", "ios.json"));
      const html = readFileSync(join(projectRoot, "dist-ios", "index.html"), "utf-8");
      const jsAsset = iosManifest.assets.find((asset) => asset.path.endsWith(".js"));
      const js = readFileSync(join(projectRoot, "dist-ios", jsAsset?.path ?? ""), "utf-8");

      expect(iosManifest.platform).toBe("ios");
      expect(iosManifest.version).toBe("2.3.4");
      expect(iosManifest.assets.map((asset) => asset.path)).toContain("index.html");
      expect(iosBuildMarker.manifestPath).toBe("dist-ios/manifest.json");
      expect(iosBuildMarker.nativeProjectPath).toBe(".nativite/ios/FixtureApp.xcodeproj");
      expect(html).toContain("ios-entry");
      expect(js).toContain("ios");
      expect(js).toMatch(/String\(!0\)|String\(true\)/);
      expect(existsSync(join(projectRoot, ".nativite", "ios", "FixtureApp.xcodeproj"))).toBe(true);
      expect(
        existsSync(join(projectRoot, ".nativite", "ios", "FixtureApp", "NativiteConfig.swift")),
      ).toBe(true);
    },
    { timeout: 60_000 },
  );

  it(
    "selects the matching platform HTML entry and source variants for macOS",
    async () => {
      const projectRoot = makeTempProject();
      process.chdir(projectRoot);

      const exitCode = await runBuildCommand(
        { platform: "macos" },
        {
          cwd: () => projectRoot,
          loadConfig,
          resolveConfiguredPlatformRuntimes,
          serializePlatformRuntimeMetadata,
          loadViteApi: async () => import("vite"),
          createLogger: createNativiteLogger,
        },
      );

      expect(exitCode).toBe(0);

      const macosManifest = readJson<{ platform: string; assets: { path: string }[] }>(
        join(projectRoot, "dist-macos", "manifest.json"),
      );
      const html = readFileSync(join(projectRoot, "dist-macos", "index.html"), "utf-8");
      const jsAsset = macosManifest.assets.find((asset) => asset.path.endsWith(".js"));
      const js = readFileSync(join(projectRoot, "dist-macos", jsAsset?.path ?? ""), "utf-8");

      expect(macosManifest.platform).toBe("macos");
      expect(html).toContain("macos-entry");
      expect(js).toContain("macos");
      expect(existsSync(join(projectRoot, ".nativite", "macos", "FixtureApp.xcodeproj"))).toBe(
        true,
      );
    },
    { timeout: 60_000 },
  );

  it(
    "generates Android fixture projects with debug-only native test harness configuration",
    async () => {
      const projectRoot = makeTempProject();
      process.chdir(projectRoot);

      const exitCode = await runBuildCommand(
        { platform: "android" },
        {
          cwd: () => projectRoot,
          loadConfig,
          resolveConfiguredPlatformRuntimes,
          serializePlatformRuntimeMetadata,
          loadViteApi: async () => import("vite"),
          createLogger: createNativiteLogger,
        },
      );

      expect(exitCode).toBe(0);

      const appDir = join(projectRoot, ".nativite", "android", "app");
      const buildGradle = readFileSync(join(appDir, "build.gradle.kts"), "utf-8");
      const harness = readFileSync(
        join(appDir, "src", "main", "java", "com", "example", "fixture", "NativiteTestHarness.kt"),
        "utf-8",
      );

      expect(buildGradle).toContain("debug {");
      expect(buildGradle).toContain('buildConfigField("Boolean", "NATIVITE_TEST_HARNESS", "true")');
      expect(buildGradle).toContain(
        'buildConfigField("String", "NATIVITE_TEST_URL", nativiteBuildConfigString("nativiteTestUrl"))',
      );
      expect(buildGradle).toContain(
        'buildConfigField("String", "NATIVITE_TEST_SESSION_TOKEN", nativiteBuildConfigString("nativiteTestSessionToken"))',
      );
      expect(buildGradle).toContain("release {");
      expect(buildGradle).toContain(
        'buildConfigField("Boolean", "NATIVITE_TEST_HARNESS", "false")',
      );
      expect(buildGradle).toContain('buildConfigField("String", "NATIVITE_TEST_URL", "\\"\\"")');
      expect(buildGradle).toContain(
        'buildConfigField("String", "NATIVITE_TEST_SESSION_TOKEN", "\\"\\"")',
      );
      expect(harness).toContain("BuildConfig.DEBUG &&");
      expect(harness).toContain("BuildConfig.NATIVITE_TEST_SESSION_TOKEN.isNotBlank()");
    },
    { timeout: 60_000 },
  );

  it(
    "generates background task manifests, bundles, and runtime files from fixture tasks",
    async () => {
      const projectRoot = makeTempProject();
      writeBackgroundTaskFixture(projectRoot);
      process.chdir(projectRoot);

      const exitCode = await runBuildCommand(
        { platform: "ios" },
        {
          cwd: () => projectRoot,
          loadConfig,
          resolveConfiguredPlatformRuntimes,
          serializePlatformRuntimeMetadata,
          loadViteApi: async () => import("vite"),
          createLogger: createNativiteLogger,
        },
      );

      expect(exitCode).toBe(0);

      const appDir = join(projectRoot, ".nativite", "ios", "FixtureApp");
      const manifest = readJson<{
        readonly tasks: readonly {
          readonly id: string;
          readonly bundle: string;
          readonly platforms: Record<string, unknown>;
        }[];
      }>(join(appDir, "nativite-background", "manifest.json"));
      const taskIds = manifest.tasks.map((task) => task.id);

      expect(taskIds).toEqual(["periodic-sync", "refresh-session"]);
      expect(manifest.tasks.find((task) => task.id === "periodic-sync")?.platforms.ios).toEqual({
        kind: "app-refresh",
        earliestBeginAfterMinutes: 15,
      });
      expect(existsSync(join(appDir, "nativite-background", "periodic-sync.task.js"))).toBe(true);
      expect(
        readFileSync(join(appDir, "nativite-background", "periodic-sync.task.js"), "utf-8"),
      ).toContain("initial");
      expect(existsSync(join(appDir, "NativiteBackgroundTasks.swift"))).toBe(true);
      expect(readFileSync(join(appDir, "AppDelegate.swift"), "utf-8")).toContain(
        "registerAppRefreshTasks",
      );
      expect(readFileSync(join(appDir, "Info.plist"), "utf-8")).toContain(
        "BGTaskSchedulerPermittedIdentifiers",
      );
    },
    { timeout: 60_000 },
  );
});
