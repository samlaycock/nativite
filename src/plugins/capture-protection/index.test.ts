import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NativiteConfig } from "../../index.ts";

import { resolveNativitePlugins } from "../resolve.ts";
import { captureProtection } from "./index.ts";

function makeConfig(): NativiteConfig {
  return {
    app: {
      name: "CaptureProtectionApp",
      bundleId: "com.example.captureprotection",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [
      { platform: "ios", minimumVersion: "17.0" },
      { platform: "android", minSdk: 26 },
    ],
    plugins: [captureProtection],
  };
}

describe("capture protection plugin", () => {
  it("exposes first-party capture protection metadata", () => {
    expect(captureProtection.name).toBe("nativite-capture-protection");
    expect(captureProtection.bridge?.namespaces?.[0]?.name).toBe("captureProtection");
    expect(captureProtection.bridge?.namespaces?.[0]?.methods).toEqual([
      "getCapabilities",
      "preventCapture",
      "allowCapture",
      "getState",
    ]);
    expect(captureProtection.bridge?.namespaces?.[0]?.events).toEqual([
      "captureProtection:screenshot",
      "captureProtection:captureStatusChange",
    ]);
  });

  it("resolves Apple and Android native contributions", async () => {
    const resolved = await resolveNativitePlugins(makeConfig(), process.cwd(), "generate");

    expect(
      resolved.platforms.ios.sources.some((source) =>
        source.absolutePath.includes(
          "src/plugins/capture-protection/ios/NativiteCaptureProtectionPlugin.swift",
        ),
      ),
    ).toBe(true);
    expect(resolved.platforms.ios.registrars).toContain("registerNativiteCaptureProtectionPlugin");
    expect(resolved.platforms.ios.dependencies).toEqual([{ name: "UIKit", weak: false }]);
    expect(
      resolved.platforms.android.sources.some((source) =>
        source.absolutePath.includes(
          "src/plugins/capture-protection/android/NativiteCaptureProtectionPlugin.kt",
        ),
      ),
    ).toBe(true);
    expect(resolved.platforms.android.registrars).toContain(
      "dev.nativite.plugins.captureprotection.registerNativiteCaptureProtectionPlugin",
    );
  });

  it("uses Android FLAG_SECURE and per-registration key state", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/plugins/capture-protection/android/NativiteCaptureProtectionPlugin.kt",
      ),
      "utf-8",
    );

    expect(source).toContain("WindowManager.LayoutParams.FLAG_SECURE");
    expect(source).toContain("activity.runOnUiThread");
    expect(source).toContain("private class CaptureProtectionState");
    expect(source).toContain("synchronized(state)");
  });

  it("serializes Android errors as structured JSON and guards bridge registration", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/plugins/capture-protection/android/NativiteCaptureProtectionPlugin.kt",
      ),
      "utf-8",
    );

    expect(source).toContain("JSONObject(");
    expect(source).toContain('"code" to code');
    expect(source).toContain('"message" to message');
    expect(source).toContain('"platform" to "android"');
    expect(source).toContain('"operation" to operation');
    expect(source).toContain("firstOrNull");
    expect(source).toContain(
      "Nativite bridge does not expose the expected plugin registration method.",
    );
  });

  it("documents iOS public API limits in the native implementation", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/plugins/capture-protection/ios/NativiteCaptureProtectionPlugin.swift",
      ),
      "utf-8",
    );

    expect(source).toContain("UIScreen.capturedDidChangeNotification");
    expect(source).toContain("UIApplication.userDidTakeScreenshotNotification");
    expect(source).toContain("iOS does not expose a public API");
  });

  it("serializes iOS errors as structured JSON and cleans up observers", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/plugins/capture-protection/ios/NativiteCaptureProtectionPlugin.swift",
      ),
      "utf-8",
    );

    expect(source).toContain("JSONSerialization.data(withJSONObject: payload)");
    expect(source).toContain("NSLocalizedDescriptionKey: jsonMessage");
    expect(source).toContain("var observerTokens: [NSObjectProtocol] = []");
    expect(source).toContain("NotificationCenter.default.removeObserver(token)");
    expect(source).toContain("state.observerTokens.append");
    expect(source).toContain("[weak bridge]");
  });
});
