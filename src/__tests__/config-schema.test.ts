import { describe, expect, it } from "bun:test";

import { NativiteConfigSchema, definePlatformPlugin, ios, macos, platform } from "../index.ts";
import {
  baseUserConfig,
  dualPlatformUserConfig,
  macosUserConfig,
  signedUserConfig,
} from "./fixtures.ts";

describe("NativiteConfigSchema", () => {
  function minimumVersionFor(
    parsed: ReturnType<typeof NativiteConfigSchema.parse>,
    platformName: string,
  ): string | undefined {
    const entry = parsed.platforms?.find((platform) => platform.platform === platformName) as
      | { minimumVersion?: string }
      | undefined;
    return entry?.minimumVersion;
  }

  // ── Valid configs ────────────────────────────────────────────────────────────

  it("accepts a minimal valid config", () => {
    expect(() => NativiteConfigSchema.parse(baseUserConfig)).not.toThrow();
  });

  it("accepts a config with all optional fields populated", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        signing: { ios: { mode: "automatic", teamId: "ABCDE12345" } },
        updates: { url: "https://updates.example.com", channel: "staging" },
        plugins: [{ name: "my-plugin", customOption: true }],
        icon: "assets/icon.png",
        splash: { backgroundColor: "#FFFFFF", image: "assets/logo.png" },
      }),
    ).not.toThrow();
  });

  it("accepts top-level platform entries created with ios()/macos()", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        platforms: [ios({ minimumVersion: "17.0" }), macos({ minimumVersion: "14.0" })],
      }),
    ).not.toThrow();
  });

  it("accepts platform overrides for built-in platforms", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        platforms: [
          ios({
            minimumVersion: "17.0",
            overrides: {
              app: { bundleId: "com.example.testapp.ios" },
              signing: { ios: { mode: "automatic", teamId: "ABCDE12345" } },
            },
          }),
        ],
      }),
    ).not.toThrow();
  });

  it("accepts a custom platform when a matching platform plugin is provided", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        platforms: [platform("android", { minSdk: 26 })],
        platformPlugins: [
          definePlatformPlugin({
            name: "android-platform",
            platform: "android",
            extensions: [".android", ".mobile", ".native"],
          }),
        ],
      }),
    ).not.toThrow();
  });

  it("rejects a custom platform when no matching platform plugin is provided", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        platforms: [platform("android", { minSdk: 26 })],
      }),
    ).toThrow();
  });

  it("accepts 'manual' signing mode", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        signing: { ios: { mode: "manual", teamId: "XYZ" } },
      }),
    ).not.toThrow();
  });

  it("accepts a config with only the macos platform key (no ios required)", () => {
    expect(() => NativiteConfigSchema.parse(macosUserConfig)).not.toThrow();
  });

  it("rejects a config with no platforms configured", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        platforms: [],
      }),
    ).toThrow();
  });

  it("rejects duplicate top-level platform entries", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        platforms: [ios({ minimumVersion: "17.0" }), ios({ minimumVersion: "18.0" })],
      }),
    ).toThrow();
  });

  it("passes through unknown plugin fields (passthrough)", () => {
    const result = NativiteConfigSchema.parse({
      ...baseUserConfig,
      plugins: [{ name: "my-plugin", apiKey: "secret", version: 2 }],
    });
    expect(result.plugins?.[0]).toMatchObject({ name: "my-plugin", apiKey: "secret", version: 2 });
  });

  it("rejects duplicate plugin names", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        plugins: [{ name: "my-plugin" }, { name: "my-plugin" }],
      }),
    ).toThrow();
  });

  it("accepts plugins with distinct names", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        plugins: [{ name: "plugin-a" }, { name: "plugin-b" }],
      }),
    ).not.toThrow();
  });

  it("accepts function-based plugin entries", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        plugins: [
          {
            name: "camera-plugin",
            resolve: () => ({
              platforms: {
                ios: {
                  sources: ["./ios/CameraPlugin.swift"],
                },
              },
            }),
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects plugin entries with a non-function resolve field", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        plugins: [{ name: "bad-plugin", resolve: "not-a-function" }],
      }),
    ).toThrow();
  });

  // ── Required fields ──────────────────────────────────────────────────────────

  it("rejects a config missing app.name", () => {
    const { name: _n, ...appWithoutName } = baseUserConfig.app;
    expect(() => NativiteConfigSchema.parse({ ...baseUserConfig, app: appWithoutName })).toThrow();
  });

  it("rejects a config missing app.bundleId", () => {
    const { bundleId: _b, ...appWithoutId } = baseUserConfig.app;
    expect(() => NativiteConfigSchema.parse({ ...baseUserConfig, app: appWithoutId })).toThrow();
  });

  it("rejects a config missing app.version", () => {
    const { version: _v, ...appWithoutVersion } = baseUserConfig.app;
    expect(() =>
      NativiteConfigSchema.parse({ ...baseUserConfig, app: appWithoutVersion }),
    ).toThrow();
  });

  it("rejects buildNumber of 0 (must be >= 1)", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, buildNumber: 0 },
      }),
    ).toThrow();
  });

  it("rejects a non-integer buildNumber", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, buildNumber: 1.5 },
      }),
    ).toThrow();
  });

  it("rejects an empty app.name", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, name: "" },
      }),
    ).toThrow();
  });

  it("accepts app.name with letters and numbers", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, name: "MyApp2" },
      }),
    ).not.toThrow();
  });

  it("accepts app.name with spaces, hyphens, and underscores", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, name: "My App_Name-v2" },
      }),
    ).not.toThrow();
  });

  it("rejects app.name with a double-quote (breaks Xcode project files)", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, name: 'My"App' },
      }),
    ).toThrow();
  });

  it("rejects app.name with a slash (breaks file paths)", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, name: "My/App" },
      }),
    ).toThrow();
  });

  it("rejects app.name starting with a space", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, name: " MyApp" },
      }),
    ).toThrow();
  });

  // ── bundleId format ──────────────────────────────────────────────────────────

  it("accepts a standard reverse-domain bundleId", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, bundleId: "com.example.myapp" },
      }),
    ).not.toThrow();
  });

  it("accepts a bundleId with numbers", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, bundleId: "com.example2.app1" },
      }),
    ).not.toThrow();
  });

  it("rejects a bundleId with no dot separator", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, bundleId: "myapp" },
      }),
    ).toThrow();
  });

  it("rejects a bundleId starting with a number", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, bundleId: "1com.example.app" },
      }),
    ).toThrow();
  });

  it("rejects a bundleId with a trailing dot", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, bundleId: "com.example." },
      }),
    ).toThrow();
  });

  it("rejects a bundleId with hyphens", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: { ...baseUserConfig.app, bundleId: "com.my-company.app" },
      }),
    ).toThrow();
  });

  // ── Optional field shapes ────────────────────────────────────────────────────

  it("rejects updates.url that is not a valid URL", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        updates: { url: "not-a-url", channel: "prod" },
      }),
    ).toThrow();
  });

  it("rejects an invalid signing mode", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...signedUserConfig,
        signing: { ios: { mode: "magic" as "automatic", teamId: "X" } },
      }),
    ).toThrow();
  });

  it("rejects legacy top-level dev options", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        dev: { target: "device", simulator: "iPhone 15 Pro" } as {
          target: "device";
          simulator: string;
        },
      }),
    ).toThrow();
  });

  // ── Inferred type ────────────────────────────────────────────────────────────

  it("returns the parsed value for valid input", () => {
    const result = NativiteConfigSchema.parse(baseUserConfig);
    expect(result.app.name).toBe("TestApp");
    expect(result.app.bundleId).toBe("com.example.testapp");
    expect(result.app.buildNumber).toBe(1);
  });

  it("maps iOS platform dev options into normalized dev config", () => {
    const result = NativiteConfigSchema.parse({
      ...baseUserConfig,
      platforms: [
        ios({
          minimumVersion: "17.0",
          target: "simulator",
          simulator: "iPhone 17 Pro",
        }),
      ],
    });

    expect(minimumVersionFor(result, "ios")).toBe("17.0");
    expect(result.dev?.target).toBe("simulator");
    expect(result.dev?.simulator).toBe("iPhone 17 Pro");
  });

  it("maps iOS errorOverlay dev option into normalized dev config", () => {
    const result = NativiteConfigSchema.parse({
      ...baseUserConfig,
      platforms: [
        ios({
          minimumVersion: "17.0",
          errorOverlay: true,
        }),
      ],
    });

    expect(minimumVersionFor(result, "ios")).toBe("17.0");
    expect(result.dev?.errorOverlay).toBe(true);
    expect(result.dev?.target).toBe("simulator");
    expect(result.dev?.simulator).toBe("iPhone 16 Pro");
  });

  it("rejects legacy app.platforms objects", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        app: {
          ...baseUserConfig.app,
          platforms: {
            ios: { minimumVersion: "16.0" },
          },
        } as typeof baseUserConfig.app & { platforms: { ios: { minimumVersion: string } } },
      }),
    ).toThrow();
  });

  it("uses top-level platform minimumVersion", () => {
    const result = NativiteConfigSchema.parse({
      ...baseUserConfig,
      platforms: [ios({ minimumVersion: "17.0" })],
    });

    expect(minimumVersionFor(result, "ios")).toBe("17.0");
  });

  it("does not include legacy normalized app.platforms metadata", () => {
    const result = NativiteConfigSchema.parse(baseUserConfig);
    expect((result.app as Record<string, unknown>)["platforms"]).toBeUndefined();
  });

  // ── Splash screen ───────────────────────────────────────────────────────────

  it("accepts splash with only backgroundColor (image optional)", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        splash: { backgroundColor: "#1A2B3C" },
      }),
    ).not.toThrow();
  });

  it("accepts splash with both backgroundColor and image", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...baseUserConfig,
        splash: { backgroundColor: "#1A2B3C", image: "assets/logo.png" },
      }),
    ).not.toThrow();
  });

  // ── App icon ────────────────────────────────────────────────────────────────

  it("accepts a config without an icon (optional)", () => {
    const result = NativiteConfigSchema.parse(baseUserConfig);
    expect(result.icon).toBeUndefined();
  });

  it("accepts a config with an icon path", () => {
    const result = NativiteConfigSchema.parse({ ...baseUserConfig, icon: "assets/icon.png" });
    expect(result.icon).toBe("assets/icon.png");
  });

  it("accepts an icon path with spaces", () => {
    const result = NativiteConfigSchema.parse({
      ...baseUserConfig,
      icon: "my assets/app icon.png",
    });
    expect(result.icon).toBe("my assets/app icon.png");
  });

  // ── macOS platform ──────────────────────────────────────────────────────────

  it("accepts a config with only macOS platform", () => {
    expect(() => NativiteConfigSchema.parse(macosUserConfig)).not.toThrow();
  });

  it("accepts a config with both iOS and macOS platforms", () => {
    expect(() => NativiteConfigSchema.parse(dualPlatformUserConfig)).not.toThrow();
  });

  it("parses macOS minimumVersion correctly", () => {
    const result = NativiteConfigSchema.parse(macosUserConfig);
    expect(minimumVersionFor(result, "macos")).toBe("14.0");
  });

  it("allows macOS platform alongside all optional fields", () => {
    expect(() =>
      NativiteConfigSchema.parse({
        ...dualPlatformUserConfig,
        signing: { ios: { mode: "automatic", teamId: "ABCDE12345" } },
        updates: { url: "https://updates.example.com", channel: "staging" },
        icon: "assets/icon.png",
        splash: { backgroundColor: "#FFFFFF", image: "assets/logo.png" },
      }),
    ).not.toThrow();
  });
});
