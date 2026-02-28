import { describe, expect, it } from "bun:test";

import type { NativiteConfig, NativitePlatformPlugin } from "../../index.ts";
import type { ResolvedNativitePlatformRuntime } from "../../platforms/registry.ts";

import { createNativiteShortcuts } from "../shortcuts.ts";

function createMockRuntime(id: string, hasDev: boolean): ResolvedNativitePlatformRuntime {
  const plugin: NativitePlatformPlugin = {
    name: `nativite-${id}`,
    platform: id,
    environments: [id],
    extensions: [`.${id}`],
    ...(hasDev ? { dev: async () => {} } : {}),
  };

  return {
    id,
    config: { platform: id },
    plugin,
    extensions: [`.${id}`],
    environments: [id],
    bundlePlatform: id,
  };
}

const mockConfig: NativiteConfig = {
  app: {
    name: "TestApp",
    bundleId: "com.test.app",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [{ platform: "ios" }],
};

describe("createNativiteShortcuts", () => {
  it("includes rebuild shortcut when platform has dev hook", () => {
    const runtime = createMockRuntime("ios", true);
    const shortcuts = createNativiteShortcuts({
      config: mockConfig,
      platform: "ios",
      runtimes: [runtime],
      simulatorName: "iPhone 16 Pro",
      devUrl: "http://localhost:5173",
      launchTarget: "simulator",
    });

    const rebuildShortcut = shortcuts.find((s) => s.key === "s");
    expect(rebuildShortcut).toBeDefined();
    expect(rebuildShortcut!.description).toContain("ios");
  });

  it("excludes rebuild shortcut when platform has no dev hook", () => {
    const runtime = createMockRuntime("ios", false);
    const shortcuts = createNativiteShortcuts({
      config: mockConfig,
      platform: "ios",
      runtimes: [runtime],
      simulatorName: "iPhone 16 Pro",
      devUrl: "http://localhost:5173",
      launchTarget: "simulator",
    });

    const rebuildShortcut = shortcuts.find((s) => s.key === "s");
    expect(rebuildShortcut).toBeUndefined();
  });

  it("always includes browser shortcut", () => {
    const shortcuts = createNativiteShortcuts({
      config: mockConfig,
      platform: "ios",
      runtimes: [],
      simulatorName: "iPhone 16 Pro",
      devUrl: "http://localhost:5173",
      launchTarget: "simulator",
    });

    const browserShortcut = shortcuts.find((s) => s.key === "b");
    expect(browserShortcut).toBeDefined();
    expect(browserShortcut!.description).toContain("browser");
  });

  it("finds correct runtime from multiple runtimes", () => {
    const iosRuntime = createMockRuntime("ios", true);
    const macosRuntime = createMockRuntime("macos", true);
    const shortcuts = createNativiteShortcuts({
      config: mockConfig,
      platform: "macos",
      runtimes: [iosRuntime, macosRuntime],
      simulatorName: "iPhone 16 Pro",
      devUrl: "http://localhost:5173",
      launchTarget: "simulator",
    });

    const rebuildShortcut = shortcuts.find((s) => s.key === "s");
    expect(rebuildShortcut).toBeDefined();
    expect(rebuildShortcut!.description).toContain("macos");
  });
});
