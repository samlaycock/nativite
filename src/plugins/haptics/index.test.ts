import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NativiteConfig } from "../../index.ts";

import { resolveNativitePlugins } from "../resolve.ts";
import { haptics } from "./index.ts";

function makeConfig(): NativiteConfig {
  return {
    app: {
      name: "HapticsApp",
      bundleId: "com.example.haptics",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [
      { platform: "ios", minimumVersion: "17.0" },
      { platform: "android", minSdk: 26 },
    ],
    plugins: [haptics],
  };
}

describe("haptics plugin", () => {
  it("exposes first-party haptics metadata", () => {
    expect(haptics.name).toBe("nativite-haptics");
    expect(haptics.bridge?.namespaces?.[0]?.name).toBe("haptics");
    expect(haptics.bridge?.namespaces?.[0]?.methods).toEqual([
      "getCapabilities",
      "selection",
      "impact",
      "notification",
    ]);
  });

  it("resolves Apple and Android native contributions", async () => {
    const resolved = await resolveNativitePlugins(makeConfig(), process.cwd(), "generate");

    expect(
      resolved.platforms.ios.sources.some((source) =>
        source.absolutePath.includes("src/plugins/haptics/ios/NativiteHapticsPlugin.swift"),
      ),
    ).toBe(true);
    expect(resolved.platforms.ios.registrars).toContain("registerNativiteHapticsPlugin");
    expect(resolved.platforms.ios.dependencies).toEqual([{ name: "UIKit", weak: false }]);
    expect(
      resolved.platforms.android.sources.some((source) =>
        source.absolutePath.includes("src/plugins/haptics/android/NativiteHapticsPlugin.kt"),
      ),
    ).toBe(true);
    expect(resolved.platforms.android.registrars).toContain(
      "dev.nativite.plugins.haptics.registerNativiteHapticsPlugin",
    );
  });

  it("maps iOS semantic feedback to UIFeedbackGenerator families", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/haptics/ios/NativiteHapticsPlugin.swift"),
      "utf-8",
    );

    expect(source).toContain("UISelectionFeedbackGenerator");
    expect(source).toContain("UIImpactFeedbackGenerator");
    expect(source).toContain("UINotificationFeedbackGenerator");
    expect(source).toContain(".rigid");
    expect(source).toContain(".soft");
  });

  it("uses Android semantic haptic constants without manifest vibration permission", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/haptics/android/NativiteHapticsPlugin.kt"),
      "utf-8",
    );

    expect(source).toContain("performHapticFeedback");
    expect(source).toContain("HapticFeedbackConstants.CONFIRM");
    expect(source).toContain("HapticFeedbackConstants.REJECT");
    expect(source).not.toContain("android.permission.VIBRATE");
  });

  it("guards Android API-specific semantic haptic constants", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/haptics/android/NativiteHapticsPlugin.kt"),
      "utf-8",
    );

    expect(source).toContain(
      '"rigid" ->\n            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)',
    );
    expect(source).toContain(
      '"warning" ->\n            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)',
    );
    expect(source).toContain("HapticFeedbackConstants.LONG_PRESS");
    expect(source).toContain("HapticFeedbackConstants.VIRTUAL_KEY");
  });
});
