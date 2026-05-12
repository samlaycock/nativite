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
    `import { defineConfig, ios, macos } from ${JSON.stringify(nativiteEntry)};

export default defineConfig({
  app: {
    name: "FixtureApp",
    bundleId: "com.example.fixture",
    version: "2.3.4",
    buildNumber: 42,
  },
  platforms: [ios(), macos()],
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
      const html = readFileSync(join(projectRoot, "dist-ios", "index.html"), "utf-8");
      const jsAsset = iosManifest.assets.find((asset) => asset.path.endsWith(".js"));
      const js = readFileSync(join(projectRoot, "dist-ios", jsAsset?.path ?? ""), "utf-8");

      expect(iosManifest.platform).toBe("ios");
      expect(iosManifest.version).toBe("2.3.4");
      expect(iosManifest.assets.map((asset) => asset.path)).toContain("index.html");
      expect(html).toContain("ios-entry");
      expect(js).toContain("ios");
      expect(js).toContain("String(!0)");
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
});
