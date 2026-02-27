import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { NativiteConfig } from "../../index.ts";

import { resolveNativitePlugins } from "../resolve.ts";

function makeBaseConfig(): NativiteConfig {
  return {
    app: {
      name: "PluginTestApp",
      bundleId: "com.example.plugintest",
      version: "1.0.0",
      buildNumber: 1,
      platforms: {
        ios: { minimumVersion: "17.0" },
        macos: { minimumVersion: "14.0" },
      },
    },
    plugins: [],
  };
}

describe("resolveNativitePlugins", () => {
  it("resolves per-platform sources, resources, registrars, and framework dependencies", async () => {
    const root = mkdtempSync(join(tmpdir(), "nativite-plugin-resolve-"));
    try {
      mkdirSync(join(root, "native", "ios"), { recursive: true });
      writeFileSync(join(root, "native", "ios", "CameraPlugin.swift"), "import Foundation\n");
      writeFileSync(join(root, "native", "ios", "CameraConfig.plist"), "{}\n");

      const config: NativiteConfig = {
        ...makeBaseConfig(),
        plugins: [
          {
            name: "camera-plugin",
            platforms: {
              ios: {
                sources: ["./native/ios/CameraPlugin.swift"],
                resources: ["./native/ios/CameraConfig.plist"],
                registrars: ["registerCameraPlugin"],
                dependencies: ["AVFoundation"],
              },
            },
          },
        ],
      };

      const resolved = await resolveNativitePlugins(config, root, "generate");
      expect(resolved.platforms.ios.sources).toHaveLength(1);
      expect(resolved.platforms.ios.resources).toHaveLength(1);
      expect(resolved.platforms.ios.registrars).toEqual(["registerCameraPlugin"]);
      expect(resolved.platforms.ios.dependencies).toEqual([{ name: "AVFoundation", weak: false }]);
      expect(resolved.platforms.ios.sources[0]?.absolutePath).toBe(
        join(root, "native", "ios", "CameraPlugin.swift"),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves relative paths from plugin rootDir and dynamic resolve() output", async () => {
    const root = mkdtempSync(join(tmpdir(), "nativite-plugin-root-"));
    try {
      mkdirSync(join(root, "vendor", "camera", "ios"), { recursive: true });
      writeFileSync(
        join(root, "vendor", "camera", "ios", "PackageCamera.swift"),
        "import Foundation\n",
      );

      const config: NativiteConfig = {
        ...makeBaseConfig(),
        plugins: [
          {
            name: "camera-package",
            rootDir: "./vendor/camera",
            resolve: () => ({
              platforms: {
                ios: {
                  sources: ["./ios/PackageCamera.swift"],
                },
              },
            }),
          },
        ],
      };

      const resolved = await resolveNativitePlugins(config, root, "dev");
      expect(resolved.platforms.ios.sources[0]?.absolutePath).toBe(
        join(root, "vendor", "camera", "ios", "PackageCamera.swift"),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("throws when a declared plugin file does not exist", async () => {
    const root = mkdtempSync(join(tmpdir(), "nativite-plugin-missing-"));
    try {
      const config: NativiteConfig = {
        ...makeBaseConfig(),
        plugins: [
          {
            name: "broken-plugin",
            platforms: {
              ios: {
                sources: ["./does-not-exist.swift"],
              },
            },
          },
        ],
      };

      let error: unknown;
      try {
        await resolveNativitePlugins(config, root, "generate");
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("source not found");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
