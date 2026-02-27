import { describe, expect, it } from "bun:test";

import { NativiteConfigSchema, definePlatformPlugin, ios, platform } from "../../index.ts";
import {
  resolveConfigForPlatform,
  resolveConfiguredPlatformRuntimes,
  serializePlatformRuntimeMetadata,
} from "../registry.ts";

describe("platform registry", () => {
  it("resolves built-in iOS metadata", () => {
    const config = NativiteConfigSchema.parse({
      app: {
        name: "TestApp",
        bundleId: "com.example.testapp",
        version: "1.0.0",
        buildNumber: 1,
      },
      platforms: [ios({ minimumVersion: "17.0" })],
    });

    const runtimes = resolveConfiguredPlatformRuntimes(config);
    expect(runtimes).toHaveLength(1);
    expect(runtimes[0]?.id).toBe("ios");
    expect(runtimes[0]?.environments).toEqual(["ios", "ipad"]);
    expect(runtimes[0]?.extensions).toEqual([".ios", ".mobile", ".native"]);
  });

  it("resolves custom platform metadata from platform plugin", () => {
    const config = NativiteConfigSchema.parse({
      app: {
        name: "TestApp",
        bundleId: "com.example.testapp",
        version: "1.0.0",
        buildNumber: 1,
      },
      platforms: [platform("android", { minSdk: 26 })],
      platformPlugins: [
        definePlatformPlugin({
          name: "android-platform",
          platform: "android",
          environments: ["android", "android-tablet"],
          extensions: ["android", ".mobile", ".native"],
        }),
      ],
    });

    const runtimes = resolveConfiguredPlatformRuntimes(config);
    expect(runtimes).toHaveLength(1);
    expect(runtimes[0]?.id).toBe("android");
    expect(runtimes[0]?.environments).toEqual(["android", "android-tablet"]);
    expect(runtimes[0]?.extensions).toEqual([".android", ".mobile", ".native"]);
  });

  it("serializes runtime metadata for CLI -> Vite handoff", () => {
    const config = NativiteConfigSchema.parse({
      app: {
        name: "TestApp",
        bundleId: "com.example.testapp",
        version: "1.0.0",
        buildNumber: 1,
      },
      platforms: [platform("android", { minSdk: 26 })],
      platformPlugins: [
        definePlatformPlugin({
          name: "android-platform",
          platform: "android",
          environments: ["android"],
          extensions: [".android", ".native"],
        }),
      ],
    });
    const runtimes = resolveConfiguredPlatformRuntimes(config);
    const metadata = JSON.parse(serializePlatformRuntimeMetadata(runtimes)) as Record<
      string,
      { extensions: string[]; environments: string[]; bundlePlatform: string }
    >;
    expect(metadata["android"]).toEqual({
      extensions: [".android", ".native"],
      environments: ["android"],
      bundlePlatform: "android",
    });
  });

  it("merges root config overrides per platform", () => {
    const config = NativiteConfigSchema.parse({
      app: {
        name: "TestApp",
        bundleId: "com.example.testapp",
        version: "1.0.0",
        buildNumber: 1,
      },
      platforms: [
        ios({
          minimumVersion: "17.0",
          overrides: {
            app: { bundleId: "com.example.testapp.ios", version: "1.1.0" },
            signing: { ios: { mode: "automatic", teamId: "ABCDE12345" } },
          },
        }),
      ],
    });

    const iosConfig = resolveConfigForPlatform(config, "ios");
    expect(iosConfig.app.bundleId).toBe("com.example.testapp.ios");
    expect(iosConfig.app.version).toBe("1.1.0");
    expect(iosConfig.signing?.ios.teamId).toBe("ABCDE12345");
  });
});
