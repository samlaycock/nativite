import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("keeps Android UI mutations on the activity UI thread", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/system-controls/android/NativiteSystemControlsPlugin.kt"),
      "utf-8",
    );

    expect(source).toContain("activity.runOnUiThread");
    expect(source).toContain("activity.requestedOrientation = request");
    expect(source).toContain("activity.window.attributes = params");
  });

  it("scopes Android mutable runtime state per plugin registration", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/system-controls/android/NativiteSystemControlsPlugin.kt"),
      "utf-8",
    );
    const topLevelSource = source.slice(
      0,
      source.indexOf("fun registerNativiteSystemControlsPlugin"),
    );

    expect(topLevelSource).toContain("private class SystemControlsState");
    expect(topLevelSource).not.toContain("private val keepAwakeKeys");
    expect(topLevelSource).not.toContain("private var orientationLock");
    expect(topLevelSource).not.toContain("private var originalBrightness");
    expect(source).toContain("val state = SystemControlsState()");
    expect(source).toContain("synchronized(state)");
  });

  it("uses API-aware Android display access for orientation reads", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/system-controls/android/NativiteSystemControlsPlugin.kt"),
      "utf-8",
    );

    expect(source).toContain("Build.VERSION.SDK_INT >= Build.VERSION_CODES.R");
    expect(source).toContain("activity.display?.rotation");
    expect(source).toContain('@Suppress("DEPRECATION")');
  });

  it("scopes iOS mutable runtime state and restores one-shot battery monitoring", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/system-controls/ios/NativiteSystemControlsPlugin.swift"),
      "utf-8",
    );
    const topLevelSource = source.slice(
      0,
      source.indexOf("func registerNativiteSystemControlsPlugin"),
    );

    expect(topLevelSource).toContain("private final class SystemControlsState");
    expect(topLevelSource).not.toContain("private var keepAwakeKeys");
    expect(topLevelSource).not.toContain("private var orientationLock");
    expect(topLevelSource).not.toContain("private var originalBrightness");
    expect(source).toContain("let state = SystemControlsState()");
    expect(source).toContain("let wasBatteryMonitoringEnabled");
    expect(source).toContain("UIDevice.current.isBatteryMonitoringEnabled = false");
  });
});
