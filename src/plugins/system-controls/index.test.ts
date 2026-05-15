import { describe, expect, it } from "bun:test";

import type { NativiteConfig } from "../../index.ts";

import { resolveNativitePlugins } from "../resolve.ts";
import { systemControls } from "./index.ts";

function makeConfig(): NativiteConfig {
  return {
    app: {
      name: "SystemControlsApp",
      bundleId: "com.example.systemcontrols",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [
      { platform: "ios", minimumVersion: "17.0" },
      { platform: "android", minSdk: 26 },
    ],
    plugins: [systemControls],
  };
}

describe("system controls plugin", () => {
  it("exposes first-party system controls metadata", () => {
    expect(systemControls.name).toBe("nativite-system-controls");
    expect(systemControls.bridge?.namespaces?.[0]?.name).toBe("systemControls");
    expect(systemControls.bridge?.namespaces?.[0]?.methods).toEqual([
      "getCapabilities",
      "activateKeepAwake",
      "deactivateKeepAwake",
      "getOrientation",
      "lockOrientation",
      "unlockOrientation",
      "getBrightness",
      "setBrightness",
      "restoreBrightness",
      "getPowerStatus",
    ]);
    expect(systemControls.bridge?.namespaces?.[0]?.events).toEqual([
      "systemControls:orientationChange",
    ]);
  });

  it("resolves Apple and Android native contributions", async () => {
    const resolved = await resolveNativitePlugins(makeConfig(), process.cwd(), "generate");

    expect(
      resolved.platforms.ios.sources.some((source) =>
        source.absolutePath.includes(
          "src/plugins/system-controls/ios/NativiteSystemControlsPlugin.swift",
        ),
      ),
    ).toBe(true);
    expect(resolved.platforms.ios.registrars).toContain("registerNativiteSystemControlsPlugin");
    expect(resolved.platforms.ios.dependencies).toEqual([{ name: "UIKit", weak: false }]);
    expect(
      resolved.platforms.android.sources.some((source) =>
        source.absolutePath.includes(
          "src/plugins/system-controls/android/NativiteSystemControlsPlugin.kt",
        ),
      ),
    ).toBe(true);
    expect(resolved.platforms.android.registrars).toContain(
      "dev.nativite.plugins.systemcontrols.registerNativiteSystemControlsPlugin",
    );
  });
});
