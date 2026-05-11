import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { definePlugin, type NativiteConfig } from "../index.ts";
import { resolveNativitePlugins } from "./resolve.ts";

function makeBaseConfig(): NativiteConfig {
  return {
    app: {
      name: "PluginTestApp",
      bundleId: "com.example.plugintest",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [
      { platform: "ios", minimumVersion: "17.0" },
      { platform: "macos", minimumVersion: "14.0" },
    ],
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

  it("resolves plugin paths relative to definePlugin import metadata", async () => {
    const root = mkdtempSync(join(tmpdir(), "nativite-plugin-import-meta-"));
    try {
      mkdirSync(join(root, "plugins", "camera", "ios"), { recursive: true });
      const pluginModulePath = join(root, "plugins", "camera", "camera.ts");
      writeFileSync(pluginModulePath, "export {}\n");
      writeFileSync(
        join(root, "plugins", "camera", "ios", "CameraPlugin.swift"),
        "func noop() {}\n",
      );

      const config: NativiteConfig = {
        ...makeBaseConfig(),
        plugins: [
          definePlugin(
            {
              name: "camera-plugin",
              platforms: {
                ios: {
                  sources: ["./ios/CameraPlugin.swift"],
                },
              },
            },
            pathToFileURL(pluginModulePath),
          ),
        ],
      };

      const resolved = await resolveNativitePlugins(config, root, "generate");
      expect(resolved.plugins[0]?.rootDir).toBe(join(root, "plugins", "camera"));
      expect(resolved.platforms.ios.sources[0]?.absolutePath).toBe(
        join(root, "plugins", "camera", "ios", "CameraPlugin.swift"),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not include type-only bridge contracts in plugin fingerprints", async () => {
    const root = mkdtempSync(join(tmpdir(), "nativite-plugin-contracts-"));
    try {
      const basePlugin = {
        name: "camera-plugin",
        bridge: {
          namespaces: [{ name: "camera", methods: ["capture"], events: ["camera.ready"] }],
        },
      };
      const first = await resolveNativitePlugins(
        {
          ...makeBaseConfig(),
          plugins: [
            definePlugin({
              ...basePlugin,
              contracts: {} as {
                camera: {
                  methods: {
                    capture: {
                      params: { readonly quality: number };
                      result: { readonly path: string };
                    };
                  };
                };
              },
            }),
          ],
        },
        root,
        "generate",
      );
      const second = await resolveNativitePlugins(
        {
          ...makeBaseConfig(),
          plugins: [
            definePlugin({
              ...basePlugin,
              contracts: {} as {
                camera: {
                  methods: {
                    capture: {
                      params: { readonly quality: number; readonly format: "jpeg" };
                      result: { readonly path: string; readonly width: number };
                    };
                  };
                };
              },
            }),
          ],
        },
        root,
        "generate",
      );

      expect(first.plugins[0]?.fingerprint).toBe(second.plugins[0]?.fingerprint);
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

  it("resolves Android native plugin contributions", async () => {
    const root = mkdtempSync(join(tmpdir(), "nativite-plugin-android-"));
    try {
      mkdirSync(join(root, "native", "android"), { recursive: true });
      writeFileSync(join(root, "native", "android", "CameraPlugin.kt"), "class CameraPlugin\n");
      writeFileSync(join(root, "native", "android", "camera.xml"), "<resources />\n");
      const baseConfig = makeBaseConfig();

      const config: NativiteConfig = {
        ...baseConfig,
        platforms: [
          { platform: "ios", minimumVersion: "17.0" },
          { platform: "macos", minimumVersion: "14.0" },
          { platform: "android", minSdk: 26 },
        ],
        plugins: [
          {
            name: "camera-plugin",
            platforms: {
              android: {
                sources: ["./native/android/CameraPlugin.kt"],
                resources: ["./native/android/camera.xml"],
                registrars: [
                  {
                    symbol: "registerCameraPlugin",
                    import: "com.example.camera.registerCameraPlugin",
                  },
                ],
                dependencies: [
                  "androidx.camera:camera-core:1.4.0",
                  {
                    kind: "gradle",
                    notation: "androidx.camera:camera-camera2:1.4.0",
                    configuration: "implementation",
                  },
                ],
              },
            },
          },
        ],
      };

      const resolved = await resolveNativitePlugins(config, root, "generate");
      expect(resolved.platforms.android.sources[0]?.absolutePath).toBe(
        join(root, "native", "android", "CameraPlugin.kt"),
      );
      expect(resolved.platforms.android.resources[0]?.absolutePath).toBe(
        join(root, "native", "android", "camera.xml"),
      );
      expect(resolved.platforms.android.registrars).toEqual([
        "com.example.camera.registerCameraPlugin",
      ]);
      expect(resolved.platforms.android.dependencies).toEqual([
        {
          kind: "gradle",
          notation: "androidx.camera:camera-camera2:1.4.0",
          configuration: "implementation",
        },
        {
          kind: "gradle",
          notation: "androidx.camera:camera-core:1.4.0",
          configuration: "implementation",
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
